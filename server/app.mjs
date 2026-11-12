import express from 'express';
import qr from 'qrcode-generator';
import { randomBytes, randomInt, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sqliteStore } from './sqlite.mjs';
import { availableCatalog, categories, sectors } from './catalog.mjs';
import { nightAt, nightBounds, nightReport } from './night.mjs';
import { equal, phoneNumber, requestJSON, verifyMercadoPago } from './integrations.mjs';

const derive = promisify(scrypt);
const cookies = ['ep_account', 'ep_staff', 'ep_owner'];
const secret = () => randomBytes(24).toString('base64url');
const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const demoPassword = 'barra-demo-2026';
const demoOwnerPassword = 'dueno-demo-2026';

async function hash(password, salt = randomBytes(16).toString('hex')) {
  const digest = await derive(password, salt, 64);
  return salt + ':' + digest.toString('hex');
}

function summary(order) {
  const { items } = order;
  return {
    id: order.id, items, subtotal: order.subtotal, discount: order.discount, total: order.total,
    status: order.status, created: order.created, delivered: order.delivered,
    received: Boolean(order.received), alcohol: items.some(item => item.alcohol),
    channel: order.channel, notification: order.notification,
    sector: order.sector ?? 'general', pickup: order.pickup ?? null,
    paidAt: order.paid_at ?? null, preparingAt: order.preparing_at ?? null, readyAt: order.ready_at ?? null,
  };
}

function customerOrder(order) {
  return {
    ...summary(order), token: order.token, provider: order.provider,
    checkoutUrl: order.checkout_url,
    code: order.status === 'ready' ? order.code : null,
  };
}

export async function createApp({ dbPath = 'data/entrepista.sqlite', env = process.env, provider = fetch, database } = {}) {
  const demo = env.DEMO !== '0';
  const base = new URL(env.PUBLIC_URL || 'http://localhost:' + (env.PORT || 3000));
  const telegram = Boolean(env.TELEGRAM_TOKEN && /^[\w]{5,32}$/.test(env.TELEGRAM_BOT || '') && env.TELEGRAM_WEBHOOK_SECRET);
  const whatsapp = Boolean(env.WHATSAPP_TOKEN && /^\d+$/.test(env.WHATSAPP_PHONE_ID || '') &&
    env.WHATSAPP_TEMPLATE && /^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION || ''));
  const payments = Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) &&
    (!env.HOST || ['localhost', '127.0.0.1', '::1'].includes(env.HOST));
  const pickup = env.PICKUP_NAME || 'Barra principal';
  const staffPassword = env.STAFF_PASSWORD || demoPassword;
  const ownerPassword = env.OWNER_PASSWORD || (local && demo ? demoOwnerPassword : null);
  if ((!local || !demo) && (!env.STAFF_PASSWORD || env.STAFF_PASSWORD.length < 12 || env.STAFF_PASSWORD === demoPassword)) {
    throw new Error('Configurá una clave de barra propia de 12 caracteres como mínimo.');
  }
  if (!demo && (!payments || base.protocol !== 'https:')) {
    throw new Error('Para desactivar la demo configurá PUBLIC_URL con HTTPS y las credenciales de Mercado Pago.');
  }
  if (ownerPassword && (ownerPassword.length < 12 || ownerPassword === staffPassword ||
    (!local && ownerPassword === demoOwnerPassword))) {
    throw new Error('Configurá una clave propia para el dueño, distinta de la clave de barra.');
  }

  const store = database ?? sqliteStore(dbPath);
  await store.recoverNotifications(Date.now() - 60000);
  const app = express();
  app.disable('x-powered-by');
  app.locals.store = store;
  app.use(express.json({ limit: '24kb' }));
  app.use((req, res, next) => {
    res.set({
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
    });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.path.startsWith('/api/hooks/')) {
      const origin = req.get('origin');
      const localOrigin = req.protocol + '://' + req.get('host');
      if (!req.is('application/json') || (origin && origin !== base.origin && origin !== localOrigin)) {
        return next(Object.assign(new Error('Solicitud no válida.'), { status: 403 }));
      }
    }
    next();
  });

  const limits = new Map();
  function limit(bucket, max) {
    return (req, res, next) => {
      const now = Date.now();
      if (limits.size > 1000) {
        for (const [key, entry] of limits) if (entry.expires < now) limits.delete(key);
      }
      const key = bucket + ':' + req.ip;
      const old = limits.get(key);
      const entry = old && old.expires > now ? old : { count: 0, expires: now + 60000 };
      limits.set(key, entry);
      if (++entry.count > max) fail(429, 'Demasiados intentos. Esperá un minuto y probá de nuevo.');
      next();
    };
  }

  function session(req, role = 0) {
    const name = cookies[role];
    const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1);
    return token ? store.session(token, role, Date.now()) : null;
  }

  async function issue(req, res, role, account = null) {
    const previous = await session(req, role);
    const token = secret();
    const ttl = role ? 12 * 3600000 : 30 * 86400000;
    await store.putSession({ token, account, staff: role, expires: Date.now() + ttl }, previous?.token);
    res.cookie(cookies[role], token, {
      httpOnly: true, sameSite: 'lax', secure: base.protocol === 'https:', maxAge: ttl,
    });
  }

  function requireRole(role, message) {
    return async (req, res, next) => {
      const current = await session(req, role);
      if (!current) fail(401, message);
      req.operator = current;
      next();
    };
  }
  const requireStaff = requireRole(1, 'Iniciá sesión en la barra.');
  const requireOwner = requireRole(2, 'Iniciá sesión como dueño.');

  async function getOrder(token) {
    const order = await store.order({ token });
    if (!order) fail(404, 'No encontramos ese pedido.');
    return order;
  }

  async function liveCatalog() {
    const [products, accepting] = await Promise.all([store.products(), store.accepting()]);
    return { products: availableCatalog(products), accepting };
  }

  async function notifyReady(id) {
    const claimTime = Date.now();
    const order = await store.updateOrder(
      { id, status: 'ready', notification: 'queued', recipient: { $ne: null } },
      { notification: 'sending', notified: claimTime },
    );
    if (!order) return;
    const spaced = order.code.split('').join(' ');
    let notification = 'sent';
    try {
      if (order.channel === 'telegram') {
        await requestJSON(provider, 'https://api.telegram.org/bot' + env.TELEGRAM_TOKEN + '/sendMessage', {
          body: { chat_id: order.recipient, text: 'Tu pedido está listo. Tu código es ' + spaced + '. Mostralo en ' + (order.pickup || pickup) + '.' },
        });
      } else {
        const payload = await requestJSON(provider,
          'https://graph.facebook.com/' + env.WHATSAPP_GRAPH_VERSION + '/' + env.WHATSAPP_PHONE_ID + '/messages', {
            token: env.WHATSAPP_TOKEN,
            body: {
              messaging_product: 'whatsapp', to: order.recipient, type: 'template',
              template: {
                name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_LANGUAGE || 'es' },
                components: [{ type: 'body', parameters: [{ type: 'text', text: spaced }] }],
              },
            },
          });
        if (!payload.messages?.[0]?.id) throw new Error('Meta no devolvió un identificador de mensaje.');
      }
    } catch {
      notification = 'failed';
    }
    await store.updateOrder({ id, notification: 'sending', notified: claimTime },
      { notification, notified: Date.now(), recipient: null });
  }

  for (const order of await store.queuedOrders()) {
    void notifyReady(order.id).catch(() => console.error('No se pudo recuperar un aviso de retiro.'));
  }

  app.get('/api/catalog', async (req, res) => res.json(await liveCatalog()));
  app.get('/api/menu', async (req, res) => {
    const [catalog, account, staff, owner] = await Promise.all([
      liveCatalog(), session(req), session(req, 1), session(req, 2),
    ]);
    res.json({
      ...catalog, demo, payments, telegram, whatsapp,
      email: account?.email ?? null, staff: Boolean(staff), owner: Boolean(ownerPassword && owner),
      ownerEnabled: Boolean(ownerPassword), venue: env.VENUE_NAME || 'KOVRA', pickup, sectors,
    });
  });

  app.get('/api/qr', (req, res) => {
    const sector = req.query.sector ?? 'general';
    if (!sectors.some(item => item.id === sector)) fail(404, 'Sector desconocido.');
    const url = new URL(base.href);
    if (sector !== 'general') url.searchParams.set('sector', sector);
    const image = qr(0, 'M');
    image.addData(url.href);
    image.make();
    res.type('image/svg+xml').send(image.createSvgTag({ cellSize: 6, margin: 24, scalable: true }));
  });

  app.post('/api/account/:mode', limit('account', 20), async (req, res) => {
    if (req.params.mode === 'logout') {
      const current = await session(req);
      if (current) await store.deleteSession(current.token);
      return res.clearCookie('ep_account').json({ email: null });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string' || password.length < 10 || password.length > 128) {
      fail(400, 'Ingresá un correo válido y una contraseña de 10 a 128 caracteres.');
    }
    if (req.params.mode === 'register') {
      const passwordHash = await hash(password);
      const result = await store.addAccount(email, passwordHash);
      if (!result) fail(409, 'Ya hay una cuenta con ese correo. Iniciá sesión.');
      await issue(req, res, 0, result.id);
    } else if (req.params.mode === 'login') {
      const account = await store.account(email);
      const candidate = await hash(password, account?.password.split(':')[0]);
      if (!equal(candidate, account?.password)) fail(401, 'El correo o la contraseña no coinciden.');
      await issue(req, res, 0, account.id);
    } else {
      fail(404, 'Acción desconocida.');
    }
    res.json({ email });
  });

  app.post('/api/bar/login', limit('bar-login', 8), async (req, res) => {
    if (!equal(req.body?.password, staffPassword)) fail(401, 'La clave de barra no coincide.');
    await issue(req, res, 1);
    res.json({ staff: true });
  });

  app.post('/api/bar/logout', requireStaff, async (req, res) => {
    await store.deleteSession(req.operator.token);
    res.clearCookie('ep_staff').json({ staff: false });
  });

  app.post('/api/owner/login', limit('owner-login', 8), async (req, res) => {
    if (!ownerPassword) fail(404, 'Configurá la clave del dueño para habilitar el cierre de noche.');
    if (!equal(req.body?.password, ownerPassword)) fail(401, 'La clave del dueño no coincide.');
    await issue(req, res, 2);
    res.json({ owner: true });
  });

  app.post('/api/owner/logout', requireOwner, async (req, res) => {
    await store.deleteSession(req.operator.token);
    res.clearCookie('ep_owner').json({ owner: false });
  });

  app.get('/api/owner/report', requireOwner, async (req, res) => {
    if (!ownerPassword) fail(404, 'El panel del dueño está desactivado.');
    const night = req.query.night ?? nightAt();
    const bounds = nightBounds(night);
    if (!bounds) fail(400, 'Elegí una fecha de noche válida.');
    res.json(nightReport(night, await store.reportOrders(...bounds, demo), demo));
  });

  app.post('/api/orders', limit('order', 40), async (req, res) => {
    const { items, requestId, adult, sector = 'general' } = req.body ?? {};
    if (typeof requestId !== 'string' || !/^[a-f\d-]{36}$/i.test(requestId) ||
      !Array.isArray(items) || items.length < 1 || items.length > 20) fail(400, 'Revisá el carrito.');
    if (!sectors.some(item => item.id === sector)) fail(400, 'El sector del pedido no existe.');
    const previous = await store.order({ request_id: requestId });
    if (previous) return res.json(customerOrder(previous));
    const { products, accepting } = await liveCatalog();
    if (!accepting) fail(409, 'La barra pausó los pedidos. Probá en unos minutos.');
    const seen = new Set();
    const priced = items.map(item => {
      if (!item || typeof item.id !== 'string' || seen.has(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 12) fail(400, 'Revisá las cantidades.');
      seen.add(item.id);
      const row = products.find(product => product.id === item.id && product.available);
      if (!row) fail(409, 'Un producto del carrito se agotó. Actualizá la carta.');
      return {
        id: row.id, name: row.name, price: row.price, alcohol: Boolean(row.alcohol),
        quantity: item.quantity, ...(row.contents ? { contents: row.contents } : {}),
      };
    });
    if (priced.some(item => item.alcohol) && adult !== true) fail(400, 'Confirmá que sos mayor de 18 años.');
    const member = (await session(req))?.account ?? null;
    const subtotal = priced.reduce((amount, item) => amount + item.price * item.quantity, 0);
    const discount = member ? Math.round(subtotal * 0.05) : 0;
    const order = await store.addOrder({
      token: secret(), request_id: requestId, account: member, items: priced,
      subtotal, discount, total: subtotal - discount, created: Date.now(), sector, pickup,
    });
    res.status(order ? 201 : 200).json(customerOrder(order ?? await store.order({ request_id: requestId })));
  });

  app.get('/api/orders/:token', async (req, res) => {
    const order = await getOrder(req.params.token);
    if (order.notification === 'sending' && (order.notified ?? 0) < Date.now() - 60000) {
      const updated = await store.updateOrder({ id: order.id, notification: 'sending', notified: order.notified ?? null },
        { notification: 'failed', recipient: null });
      return res.json(customerOrder(updated ?? await getOrder(order.token)));
    }
    res.json(customerOrder(order));
  });

  app.post('/api/orders/:token/demo', async (req, res) => {
    if (!demo) fail(404, 'Modo demo desactivado.');
    const order = await getOrder(req.params.token);
    if (typeof req.body?.approved !== 'boolean') fail(400, 'Elegí un resultado de prueba.');
    if (order.provider === 'mercadopago') fail(409, 'Este pedido usa Mercado Pago.');
    if (order.status === 'pending' || order.status === 'rejected') {
      const status = req.body.approved ? (await store.accepting() ? 'paid' : 'review') : 'rejected';
      await store.updateOrder({ id: order.id, status: { $in: ['pending', 'rejected'] }, provider: { $nin: ['mercadopago'] } },
        { status, provider: 'demo', paid_at: req.body.approved ? Date.now() : null });
    }
    res.json(customerOrder(await getOrder(order.token)));
  });

  app.post('/api/orders/:token/pay', limit('pay', 25), async (req, res) => {
    if (!payments) fail(503, 'Mercado Pago todavía no está configurado.');
    const order = await getOrder(req.params.token);
    if (order.status !== 'pending' || order.provider === 'demo') fail(409, 'El pago de este pedido ya se resolvió.');
    if (order.checkout_url) return res.json({ url: order.checkout_url });
    const email = order.payment_email || (await session(req))?.email || req.body?.email;
    if (!validEmail(email)) fail(400, 'Ingresá un correo para el pago.');
    if (!order.provider && !await store.accepting()) fail(409, 'La barra pausó los pedidos.');
    const claimed = await store.updateOrder({
      id: order.id, status: 'pending', provider: order.provider ?? null, payment_email: order.payment_email ?? null,
    }, { provider: 'mercadopago', payment_email: email });
    if (!claimed) fail(409, 'El pago cambió de estado. Volvé a intentar en el mismo pedido.');
    const url = new URL('/pedido/' + order.token, base).href;
    const total = (order.total / 100).toFixed(2);
    let remote;
    try {
      remote = await requestJSON(provider, 'https://api.mercadopago.com/v1/orders', {
        token: env.MP_ACCESS_TOKEN,
        headers: { 'X-Idempotency-Key': order.token },
        body: {
          type: 'online', processing_mode: 'manual', total_amount: total, external_reference: String(order.id),
          payer: { email }, items: [{ title: 'Pedido #' + order.id + ' en barra', unit_price: total, quantity: 1 }],
          expiration_time: 'PT15M',
          config: { online: { success_url: url, pending_url: url, failure_url: url, auto_return: 'all' } },
        },
      });
      if (!remote.id || !remote.checkout_url || new URL(remote.checkout_url).origin !== 'https://www.mercadopago.com.uy') throw new Error();
    } catch {
      fail(502, 'Mercado Pago no respondió. Volvé a intentar en el mismo pedido.');
    }
    await store.updateOrder({ id: order.id }, { external_id: remote.id, checkout_url: remote.checkout_url });
    res.json({ url: remote.checkout_url });
  });

  app.post('/api/hooks/mercadopago', async (req, res) => {
    const id = req.query['data.id'];
    if (!payments || !verifyMercadoPago(id, req.get('x-request-id'), req.get('x-signature'), env.MP_WEBHOOK_SECRET)) fail(401, 'Firma inválida.');
    if (req.body?.type !== 'order' || req.body?.data?.id !== id) return res.json({ ok: true });
    const order = await store.order({ external_id: id, provider: 'mercadopago' });
    if (!order) fail(503, 'Todavía no se registró la referencia del pago.');
    let remote;
    try {
      remote = await requestJSON(provider, 'https://api.mercadopago.com/v1/orders/' + encodeURIComponent(id), { token: env.MP_ACCESS_TOKEN });
    } catch {
      fail(502, 'No se pudo verificar el pago.');
    }
    if (remote.id !== id || String(remote.external_reference) !== String(order.id) ||
      (remote.currency ?? remote.currency_id) !== 'UYU') fail(409, 'El pago no coincide con el pedido.');
    if (remote.status === 'processed' && remote.status_detail === 'accredited') {
      if (Math.round(Number(remote.total_paid_amount) * 100) !== order.total) fail(409, 'El importe no coincide.');
      const status = !await store.accepting() || Date.now() - order.created > 20 * 60000 ? 'review' : 'paid';
      await store.updateOrder({ id: order.id, status: { $in: ['pending', 'rejected'] }, reversed_at: null },
        { status, paid_at: Date.now() });
    } else if (['failed', 'canceled', 'expired'].includes(remote.status)) {
      await store.updateOrder({ id: order.id, status: 'pending' }, { status: 'rejected' });
    } else if (['refunded', 'charged_back'].includes(remote.status)) {
      const reversed_at = Date.now();
      const updated = await store.updateOrder({ id: order.id, status: { $nin: ['delivered', 'rejected'] }, reversed_at: null },
        { status: 'review', code: null, reversed_at });
      if (!updated) await store.updateOrder({ id: order.id, status: 'delivered', reversed_at: null }, { reversed_at });
    }
    res.json({ ok: true });
  });

  app.post('/api/orders/:token/notify', limit('notification', 40), async (req, res) => {
    const order = await getOrder(req.params.token);
    if (order.status === 'delivered' || ['sending', 'sent'].includes(order.notification)) fail(409, 'El aviso ya se procesó.');
    const { channel, phone, consent } = req.body ?? {};
    const filter = { id: order.id, status: { $nin: ['delivered'] }, notification: { $nin: ['sending', 'sent'] } };
    let updated;
    if (channel === 'telegram' && telegram) {
      if (order.channel === 'telegram' && order.recipient) return res.json({ order: customerOrder(order) });
      const link = secret();
      updated = await store.updateOrder(filter, {
        channel, notification: 'linking', link_token: link, link_expires: Date.now() + 20 * 60000,
        recipient: null, consent: null,
      });
      if (!updated) fail(409, 'El aviso ya se procesó.');
      return res.json({ url: 'https://t.me/' + env.TELEGRAM_BOT + '?start=' + link, order: customerOrder(updated) });
    }
    if (channel === 'whatsapp' && whatsapp) {
      const number = phoneNumber(phone);
      if (consent !== true || !number) fail(400, 'Ingresá un número válido y aceptá el aviso por WhatsApp.');
      updated = await store.updateOrder(filter, {
        channel, notification: 'queued', recipient: number, consent: Date.now(), link_token: null, link_expires: null,
      });
      if (updated) await notifyReady(order.id);
    } else if (channel === 'web') {
      updated = await store.updateOrder(filter, {
        channel: null, notification: null, recipient: null, consent: null, link_token: null, link_expires: null,
      });
    } else {
      fail(400, 'Ese canal todavía no está disponible.');
    }
    if (!updated) fail(409, 'El aviso ya se procesó.');
    res.json({ order: customerOrder(await getOrder(order.token)) });
  });

  app.post('/api/hooks/telegram', async (req, res) => {
    if (!telegram || !equal(req.get('x-telegram-bot-api-secret-token'), env.TELEGRAM_WEBHOOK_SECRET)) fail(401, 'Webhook inválido.');
    const message = req.body?.message;
    const link = /^\/start ([A-Za-z0-9_-]{32})$/.exec(message?.text || '')?.[1];
    if (message?.chat?.type === 'private' && Number.isSafeInteger(message.chat.id) && link) {
      const order = await store.updateOrder({
        channel: 'telegram', link_token: link, link_expires: { $gte: Date.now() }, status: { $nin: ['delivered'] },
      }, {
        recipient: String(message.chat.id), consent: Date.now(), notification: 'queued', link_token: null, link_expires: null,
      });
      if (order) await notifyReady(order.id);
    }
    res.json({ ok: true });
  });

  app.post('/api/orders/:token/received', async (req, res) => {
    const order = await getOrder(req.params.token);
    if (order.status !== 'delivered') fail(409, 'La barra todavía no registró la entrega.');
    const updated = await store.updateOrder({ id: order.id, received: null }, { received: Date.now() });
    res.json(customerOrder(updated ?? await getOrder(order.token)));
  });

  app.get('/api/bar/orders', requireStaff, async (req, res) => {
    const orders = await store.barOrders(Date.now() - 12 * 3600000);
    res.json({ orders: orders.map(summary) });
  });

  app.post('/api/bar/orders/:id', requireStaff, async (req, res) => {
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) fail(404, 'Pedido desconocido.');
    const order = await store.order({ id: Number(req.params.id) });
    if (!order) fail(404, 'Pedido desconocido.');
    const action = req.body?.action;
    const transitions = { prepare: ['paid', 'preparing'], ready: ['preparing', 'ready'], deliver: ['ready', 'delivered'] };
    const transition = Object.hasOwn(transitions, action) ? transitions[action] : null;
    if (!transition) fail(400, 'Acción desconocida.');
    const [from, to] = transition;
    if (order.status !== from) fail(409, 'El pedido cambió de estado. Actualizá la barra.');
    if (action === 'deliver') {
      if (!equal(req.body.code, order.code)) fail(400, 'El código de retiro no coincide.');
      if (summary(order).alcohol && req.body.ageVerified !== true) fail(400, 'Verificá la mayoría de edad antes de entregar.');
    }
    const filter = { id: order.id, status: from };
    let changed;
    if (action === 'ready') {
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          changed = await store.updateOrder(filter, {
            status: to, ready_at: Date.now(), code: String(randomInt(10000)).padStart(4, '0'),
          });
          break;
        } catch (error) {
          if (!store.pickupCollision(error)) throw error;
          if (attempt === 11) fail(503, 'No se pudo reservar un código de retiro. Probá de nuevo.');
        }
      }
    } else {
      changed = await store.updateOrder(filter, action === 'prepare' ?
        { status: to, preparing_at: Date.now() } :
        { status: to, delivered: Date.now(), code: null, recipient: null, link_token: null });
    }
    if (!changed) fail(409, 'El pedido ya fue actualizado.');
    if (action === 'ready') await notifyReady(order.id);
    res.json(summary(await store.order({ id: order.id })));
  });

  app.post('/api/bar/settings', requireStaff, async (req, res) => {
    if (typeof req.body?.accepting !== 'boolean') fail(400, 'Estado de barra inválido.');
    await store.setAccepting(req.body.accepting);
    res.json({ accepting: await store.accepting() });
  });

  app.post('/api/bar/products/:id', requireStaff, async (req, res) => {
    const { name, description, category, price, available, alcohol } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.length > 60 || typeof description !== 'string' ||
      description.length > 160 || !categories.includes(category) || !Number.isInteger(price) ||
      price < 100 || price > 1000000 || typeof available !== 'boolean' || typeof alcohol !== 'boolean') fail(400, 'Revisá los datos del producto.');
    const product = await store.editProduct(req.params.id, {
      name: name.trim(), description: description.trim(), category, price, available: Number(available), alcohol: Number(alcohol),
    });
    if (!product) fail(404, 'Producto desconocido.');
    res.json(product);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta desconocida.' }));
  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status === 500) console.error('Error de la aplicación:', error.name);
    res.status(status).json({ error: status === 500 ? 'Ocurrió un error. Probá de nuevo.' : error.message });
  });
  return app;
}
