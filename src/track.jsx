import React, { useState } from 'react';
import { api, ErrorText, Header, money, orderNumber, useAction, usePoll } from './shared.jsx';

const statuses = {
  pending: ['Completá el pago', 'Cuando se apruebe, la barra recibe tu pedido.'],
  rejected: ['Pago rechazado', 'Probá con otro medio de pago o volvé a la carta.'],
  paid: ['Pedido recibido', 'La barra ya tiene tu pedido.'],
  preparing: ['En preparación', 'Te avisamos acá cuando esté listo.'],
  ready: ['Tu pedido está listo', 'Mostrá este código cuando llegues a la barra.'],
  delivered: ['Pedido entregado', 'Confirmá si recibiste tu pedido.'],
  review: ['La barra está revisando tu pedido', 'Acercate a la barra con el número de pedido para resolverlo.'],
};

function Alerts({ order, menu, path, onOrder }) {
  const action = useAction();
  const [whatsapp, setWhatsapp] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState('');
  const sent = order.notification === 'sent';
  const linked = ['queued', 'sending', 'sent'].includes(order.notification);

  async function connect(channel, fields = {}) {
    const data = await api(path + '/notify', { channel, ...fields });
    if (data.order) onOrder(data.order);
    if (data.url) setTelegramUrl(data.url);
    if (channel === 'web') setTelegramUrl('');
    setWhatsapp(false);
  }

  return <section className="panel stack">
    <h2>{order.status === 'ready' ? 'Aviso de retiro' : 'Avisame cuando esté listo'}</h2>
    {!menu.telegram && !menu.whatsapp && <p className="muted">En esta demo el estado se actualiza acá automáticamente.</p>}
    {linked && <p className="notice" role="status">
      {sent ? 'Aviso enviado por ' : 'Aviso activado por '}{order.channel === 'telegram' ? 'Telegram' : 'WhatsApp'}.
    </p>}
    {order.notification === 'failed' && <p className="error" role="status">No pudimos enviar el aviso. Podés usar el código de esta pantalla.</p>}
    {order.notification === 'linking' && <p className="muted">Abrí el bot y tocá «Iniciar» para vincular el pedido.</p>}
    {!linked && <div className="button-row">
      {menu.telegram && <button className="secondary" disabled={action.busy}
        onClick={() => action.run(() => connect('telegram'))}>{telegramUrl ? 'Renovar enlace' : 'Vincular Telegram'}</button>}
      {menu.telegram && telegramUrl && order.notification === 'linking' &&
        <a className="primary" href={telegramUrl} target="_blank" rel="noreferrer">Abrir Telegram ↗</a>}
      {menu.whatsapp && <button className="secondary" onClick={() => setWhatsapp(!whatsapp)}>Usar WhatsApp</button>}
    </div>}
    {whatsapp && !linked && <form className="stack" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      action.run(() => connect('whatsapp', { phone: fields.get('phone'), consent: fields.has('consent') }));
    }}>
      <label>Tu número de WhatsApp<input name="phone" type="tel" placeholder="099 123 456" autoComplete="tel" required /></label>
      <label className="check"><input name="consent" type="checkbox" required />Quiero recibir por WhatsApp un aviso de este pedido.</label>
      <button className="primary" disabled={action.busy}>Activar aviso</button>
    </form>}
    {order.channel && !sent && order.notification !== 'sending' && <button className="text-button"
      onClick={() => action.run(() => connect('web'))}>Seguir el pedido solo en esta página</button>}
    <ErrorText>{action.error}</ErrorText>
  </section>;
}

export default function Track({ token, menu }) {
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState('');
  const action = useAction();
  const path = '/orders/' + encodeURIComponent(token);
  usePoll(path, value => { setOrder(value); setLoadError(''); }, error => setLoadError(
    error.status === 404 ? 'No encontramos ese pedido.' : 'Se perdió la conexión. Volvemos a intentar.',
  ));

  let title = order ? statuses[order.status][0] : 'Buscando tu pedido…';
  let detail = order ? statuses[order.status][1] : '';
  if (order?.received) { title = '¡Que disfrutes!'; detail = 'Confirmaste que recibiste tu pedido.'; }

  return <>
    <Header venue={menu.venue}><a className="subtle-link" href="/">Volver a la carta</a></Header>
    <main className="wrap narrow page">
      <ErrorText>{loadError}</ErrorText>
      <section className={'panel tracking' + (order?.status === 'ready' ? ' ready-panel' : '')} aria-labelledby="tracking-title">
        {order && <div className="total-row">
          <span className="ticket-id">Pedido {orderNumber(order.id)}</span>
          {order.sector !== 'general' && <small>{menu.sectors.find(sector => sector.id === order.sector)?.name}</small>}
        </div>}
        <div aria-live="polite">
          <h1 id="tracking-title">{title}</h1>
          <p className="muted">{detail}</p>
        </div>
        {order?.code && <div className="pickup">
          <span>{order.pickup || menu.pickup}</span>
          <strong aria-label={'Código ' + order.code.split('').join(' ')}>{order.code.split('').join(' ')}</strong>
        </div>}
        {order?.status === 'delivered' && !order.received && <button className="primary" disabled={action.busy}
          onClick={() => action.run(async () => setOrder(await api(path + '/received', {})))}>Recibí mi pedido</button>}
        {order && <ErrorText>{action.error}</ErrorText>}
      </section>
      {order && ['pending', 'rejected'].includes(order.status) && <section className="panel stack">
        <h2>Pago</h2>
        {menu.demo && order.provider !== 'mercadopago' && <>
          <p className="muted">Modo demo. Podés probar ambos resultados sin pagar.</p>
          <div className="button-row">
            <button className="primary" disabled={action.busy}
              onClick={() => action.run(async () => setOrder(await api(path + '/demo', { approved: true })))}>Simular pago aprobado</button>
            <button className="secondary" disabled={action.busy || order.status === 'rejected'}
              onClick={() => action.run(async () => setOrder(await api(path + '/demo', { approved: false })))}>Simular rechazo</button>
          </div>
        </>}
        {menu.payments && order.status === 'pending' && order.provider !== 'demo' && <form className="stack" onSubmit={event => {
          event.preventDefault();
          const email = new FormData(event.currentTarget).get('email');
          action.run(async () => window.location.assign((await api(path + '/pay', { email })).url));
        }}>
          {!menu.email && !order.checkoutUrl && <label>Correo para el pago<input type="email" name="email" required autoComplete="email" /></label>}
          <button className={menu.demo ? 'secondary' : 'primary'} disabled={action.busy}>Ir a Mercado Pago ↗</button>
        </form>}
        {order.status === 'rejected' && <a className="text-button" href="/">Volver a la carta</a>}
      </section>}
      {order && (['pending', 'paid', 'preparing'].includes(order.status) ||
        (order.status === 'ready' && (menu.telegram || menu.whatsapp))) &&
        <Alerts order={order} menu={menu} path={path} onOrder={setOrder} />}
      {order && <section className="panel stack">
        <h2>Resumen</h2>
        <ul className="order-items">{order.items.map(item => <li key={item.id}><span>{item.quantity} × {item.name}</span><span>{money(item.price * item.quantity)}</span></li>)}</ul>
        {order.discount > 0 && <div className="total-row savings"><span>Descuento del 5 %</span><span>−{money(order.discount)}</span></div>}
        <div className="total-row"><strong>Total</strong><strong>{money(order.total)}</strong></div>
      </section>}
    </main>
  </>;
}
