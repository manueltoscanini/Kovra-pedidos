import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.mjs';
import { mongoStore } from '../server/mongo.mjs';

const messages = [];
let server, app, base, staff, member, paymentReference;
const env = {
  DEMO: '1', STAFF_PASSWORD: 'test-password-123', OWNER_PASSWORD: 'owner-password-123',
  TELEGRAM_TOKEN: 'test-token', TELEGRAM_BOT: 'entrepista_test', TELEGRAM_WEBHOOK_SECRET: 'webhook-test',
  WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_ID: '123', WHATSAPP_TEMPLATE: 'pedido_listo',
  WHATSAPP_GRAPH_VERSION: 'v25.0', MP_ACCESS_TOKEN: 'TEST-example', MP_WEBHOOK_SECRET: 'mp-test',
};
async function provider(url, options) {
  const payload = options.body ? JSON.parse(options.body) : null;
  if (url === 'https://api.mercadopago.com/v1/orders') {
    paymentReference = payload.external_reference;
    return Response.json({ id: 'ORDTST123', checkout_url: 'https://www.mercadopago.com.uy/checkout/test' });
  }
  if (url.endsWith('/v1/orders/ORDTST123')) {
    return Response.json({
      id: 'ORDTST123', external_reference: paymentReference, currency: 'UYU', status: 'processed',
      status_detail: 'accredited', total_paid_amount: '200.00', live_mode: false,
    });
  }
  messages.push({ url, payload });
  return Response.json({ ok: true, messages: [{ id: 'wamid.test' }] });
}
before(async () => {
  const database = process.env.TEST_MONGODB_URI ?
    await mongoStore(process.env.TEST_MONGODB_URI, 'kovra_test_' + randomUUID().replaceAll('-', '')) : undefined;
  app = await createApp({ dbPath: ':memory:', env, provider, database });
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { server?.close(); await app?.locals.store.close(); });

async function call(path, body, cookie, headers = {}) {
  const response = await fetch(base + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const draft = () => ({ requestId: randomUUID(), items: [{ id: 'lager', quantity: 1 }], adult: true });
const make = async (cookie, extra = {}) => (await call('/orders', { ...draft(), ...extra }, cookie)).data;
const bar = (order, action, extra = {}) => call('/bar/orders/' + order.id, { action, ...extra }, staff);

test('guest and authenticated customer get server-calculated prices and retries reuse the order', async () => {
  const cart = draft();
  const guest = (await call('/orders', { ...cart, total: 1 })).data;
  assert.equal(guest.total, 20000);
  assert.equal((await call('/orders', cart)).data.id, guest.id);
  assert.equal((await call('/orders', { ...draft(), adult: false })).status, 400);
  member = (await call('/account/register', { email: 'member@example.test', password: 'a-strong-password' })).cookie;
  const customer = await make(member);
  assert.equal(customer.discount, 1000);
  assert.equal(customer.total, 19000);
  assert.equal((await call('/bar/orders')).status, 401);
  staff = (await call('/bar/login', { password: env.STAFF_PASSWORD })).cookie;
  assert.ok(staff);
});

test('only paid orders reach the bar, code is single use, customer confirms receipt separately', async () => {
  const order = await make();
  assert.equal((await bar(order, 'prepare')).status, 409);
  assert.equal((await call('/orders/' + order.token + '/demo', { approved: false })).data.status, 'rejected');
  await call('/orders/' + order.token + '/demo', { approved: true });
  assert.equal((await bar(order, 'prepare')).data.status, 'preparing');
  assert.equal((await bar(order, 'ready')).data.status, 'ready');
  const ready = (await call('/orders/' + order.token)).data;
  assert.match(ready.code, /^\d{4}$/);
  assert.equal((await bar(order, 'deliver', { code: 'invalid', ageVerified: true })).status, 400);
  assert.equal((await bar(order, 'deliver', { code: ready.code })).status, 400);
  const outcomes = await Promise.all([1, 2].map(() => bar(order, 'deliver', { code: ready.code, ageVerified: true })));
  assert.deepEqual(outcomes.map(o => o.status).sort(), [200, 409]);
  assert.equal((await call('/orders/' + order.token + '/received', {})).data.received, true);
});

test('Telegram accepts only a signed private start and sends one ready alert', async () => {
  const order = await make();
  const path = '/orders/' + order.token;
  const url = (await call(path + '/notify', { channel: 'telegram' })).data.url;
  const start = new URL(url).searchParams.get('start');
  assert.notEqual(start, order.token);
  const update = { message: { text: '/start ' + start, chat: { type: 'private', id: 3456 } } };
  assert.equal((await call('/hooks/telegram', update)).status, 401);
  const header = { 'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET };
  await call('/hooks/telegram', update, undefined, header);
  await call('/hooks/telegram', update, undefined, header);
  await call(path + '/demo', { approved: true });
  await bar(order, 'prepare');
  await bar(order, 'ready');
  await bar(order, 'ready');
  const ready = (await call(path)).data;
  assert.equal(ready.notification, 'sent');
  const sent = messages.filter(m => m.url.endsWith('/sendMessage'));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.chat_id, '3456');
  assert.ok(sent[0].payload.text.includes(ready.code.split('').join(' ')));
});

test('WhatsApp requires consent and sends the configured template with the pickup code', async () => {
  const order = await make();
  const path = '/orders/' + order.token;
  assert.equal((await call(path + '/notify', { channel: 'whatsapp', phone: '099123456' })).status, 400);
  assert.equal((await call(path + '/notify', { channel: 'whatsapp', phone: '099123456', consent: true })).status, 200);
  await call(path + '/demo', { approved: true });
  await bar(order, 'prepare');
  await bar(order, 'ready');
  const sent = messages.find(m => m.url.includes('graph.facebook.com'));
  assert.equal(sent.payload.to, '59899123456');
  assert.equal(sent.payload.template.name, 'pedido_listo');
  assert.equal(sent.payload.template.components[0].parameters[0].text, (await call(path)).data.code.split('').join(' '));
});

test('payment is verified server-side and duplicate webhooks cannot reset the bar workflow', async () => {
  const order = await make();
  assert.equal((await call('/orders/' + order.token + '/pay', { email: 'buyer@example.test' })).status, 200);
  const endpoint = '/hooks/mercadopago?data.id=ORDTST123';
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', env.MP_WEBHOOK_SECRET)
    .update('id:ordtst123;request-id:hook-id;ts:' + ts + ';').digest('hex');
  assert.equal((await call(endpoint, {})).status, 401);
  const signed = { 'x-request-id': 'hook-id', 'x-signature': 'ts=' + ts + ',v1=' + v1 };
  const event = { type: 'order', data: { id: 'ORDTST123' } };
  assert.equal((await call(endpoint, event, undefined, signed)).status, 200);
  assert.equal((await bar(order, 'prepare')).status, 200);
  assert.equal((await call(endpoint, event, undefined, signed)).status, 200);
  assert.equal((await call('/orders/' + order.token)).data.status, 'preparing');
});

test('sector is validated, printed on the order and preserved during pickup', async () => {
  const order = await make(undefined, { sector: 'vip' });
  assert.equal(order.sector, 'vip');
  assert.equal(order.pickup, 'Barra principal');
  assert.equal((await call('/orders', { ...draft(), sector: 'unknown' })).status, 400);
  assert.equal((await call('/menu')).data.sectors.find(sector => sector.id === 'vip').name, 'VIP');
  const qr = await fetch(base + '/api/qr?sector=vip');
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  assert.equal((await fetch(base + '/api/qr?sector=unknown')).status, 404);
  await call('/orders/' + order.token + '/demo', { approved: true });
  assert.equal((await call('/bar/orders', undefined, staff)).data.orders.find(item => item.id === order.id).sector, 'vip');
});

test('combo keeps the account discount and becomes unavailable if a component is exhausted', async () => {
  const combo = await make(member, { items: [{ id: 'combo-fernet-lager', quantity: 1 }] });
  assert.equal(combo.discount, 2200);
  assert.equal(combo.total, 41800);
  assert.deepEqual(combo.items[0].contents, ['Fernet con cola', 'Lager tirada']);
  const menu = (await call('/menu')).data.products;
  const lager = menu.find(product => product.id === 'lager');
  const product = { ...lager, alcohol: true, available: false };
  await call('/bar/products/lager', product, staff);
  assert.equal((await call('/menu')).data.products.find(item => item.id === 'combo-fernet-lager').available, 0);
  assert.equal((await call('/orders', {
    ...draft(), items: [{ id: 'combo-fernet-lager', quantity: 1 }],
  }, member)).status, 409);
  await call('/bar/products/lager', { ...product, available: true }, staff);
});

test('owner report requires a separate session and records collected sales, sector and preparation', async () => {
  assert.equal((await call('/owner/report', undefined, staff)).status, 401);
  const owner = (await call('/owner/login', { password: env.OWNER_PASSWORD })).cookie;
  assert.ok(owner);
  assert.equal((await call('/bar/orders', undefined, owner)).status, 401);
  const before = (await call('/owner/report', undefined, owner)).data;
  const order = await make(undefined, { sector: 'terraza' });
  await call('/orders/' + order.token + '/demo', { approved: true });
  assert.ok((await bar(order, 'prepare')).data.preparingAt);
  const ready = (await bar(order, 'ready')).data;
  assert.ok(ready.paidAt <= ready.preparingAt && ready.preparingAt <= ready.readyAt);
  const after = (await call('/owner/report?night=' + before.night, undefined, owner)).data;
  assert.equal(after.orders, before.orders + 1);
  assert.equal(after.total, before.total + 20000);
  assert.equal(after.sectors.find(sector => sector.id === 'terraza').orders, 1);
  assert.ok(after.averageWaitMinutes >= after.averagePrepMinutes);
  assert.equal((await call('/owner/report?night=2026-02-30', undefined, owner)).status, 400);
});
