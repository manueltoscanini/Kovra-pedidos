import React, { useState } from 'react';
import { api, ErrorText, groups, Header, money, orderNumber, useAction, usePoll } from './shared.jsx';

const columns = [
  ['paid', 'Por preparar'], ['preparing', 'En preparación'],
  ['ready', 'Para retirar'], ['delivered', 'Entregados'],
];

function Ticket({ order, onChange, sector }) {
  const action = useAction();
  const minutes = Math.max(0, Math.floor((Date.now() - order.created) / 60000));
  const submit = (state, extra = {}) => action.run(async () => onChange(await api('/bar/orders/' + order.id, { action: state, ...extra })));
  return <article className="ticket stack">
    <div className="total-row"><h3>Pedido {orderNumber(order.id)}</h3><small>{minutes ? 'Hace ' + minutes + ' min' : 'Recién'}</small></div>
    {sector && <small>{sector}</small>}
    <ul className="order-items">{order.items.map(item => <li key={item.id}><span>
      <b>{item.quantity} ×</b> {item.name}
      {item.contents && <small className="ticket-contents">{item.contents.join(' + ')}</small>}
    </span></li>)}</ul>
    <div className="total-row"><strong>{money(order.total)}</strong>
      {order.notification === 'failed' && <small>Aviso fallido</small>}
    </div>
    <ErrorText>{action.error}</ErrorText>
    {order.status === 'paid' && <button className="primary" disabled={action.busy} onClick={() => submit('prepare')}>Tomar pedido</button>}
    {order.status === 'preparing' && <button className="primary" disabled={action.busy} onClick={() => submit('ready')}>Marcar listo</button>}
    {order.status === 'ready' && <form className="stack" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      submit('deliver', { code: fields.get('code'), ageVerified: fields.has('ageVerified') });
    }}>
      <label>Código de retiro<input name="code" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required /></label>
      {order.alcohol && <label className="check"><input name="ageVerified" type="checkbox" required />Mayoría de edad verificada</label>}
      <button className="secondary" disabled={action.busy}>Registrar entrega</button>
    </form>}
    {order.status === 'review' && <p className="muted">Revisá el pago en la pasarela y resolvé con el cliente en barra.</p>}
    {order.status === 'delivered' && <small className={order.received ? 'savings' : 'muted'}>
      {order.received ? 'Recepción confirmada' : 'Recepción sin confirmar'}
    </small>}
  </article>;
}

function ProductEditor({ product, onChange }) {
  const action = useAction();
  return <form className="panel stack" onSubmit={event => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    action.run(async () => {
      const updated = await api('/bar/products/' + product.id, {
        name: fields.get('name'), description: fields.get('description'), category: fields.get('category'),
        price: Math.round(Number(fields.get('price')) * 100), available: fields.has('available'), alcohol: fields.has('alcohol'),
      });
      await onChange(updated);
    });
  }}>
    <label>Nombre<input name="name" required maxLength={60} defaultValue={product.name} /></label>
    <label>Descripción<input name="description" maxLength={160} defaultValue={product.description} /></label>
    <div className="button-row">
      <label>Categoría<select name="category" defaultValue={product.category}>{groups.map(group => <option key={group}>{group}</option>)}</select></label>
      <label>Precio en UYU<input name="price" type="number" required step="0.01" min="1" max="10000" defaultValue={product.price / 100} /></label>
    </div>
    <label className="check"><input name="available" type="checkbox" defaultChecked={Boolean(product.listed ?? product.available)} />Disponible</label>
    {product.contents && !product.available && <small>El combo también depende del stock de sus bebidas.</small>}
    <label className="check"><input name="alcohol" type="checkbox" defaultChecked={Boolean(product.alcohol)} />Contiene alcohol</label>
    <ErrorText>{action.error}</ErrorText>
    <button className="secondary" disabled={action.busy}>Guardar {product.name}</button>
  </form>;
}

export default function Bar({ menu, setMenu }) {
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [network, setNetwork] = useState('');
  const [saved, setSaved] = useState('');
  const action = useAction();
  usePoll(menu.staff ? '/bar/orders' : null, data => { setOrders(data.orders); setNetwork(''); }, error => {
    if (error.status === 401) setMenu(current => ({ ...current, staff: false }));
    else setNetwork('Se perdió la conexión con la barra. Volvemos a intentar.');
  });
  const update = value => setOrders(current => current.map(order => order.id === value.id ? value : order));
  const sectorName = id => menu.sectors.find(sector => sector.id === id)?.name;

  return <>
    <Header venue={menu.venue}>
      <a className="subtle-link" href="/">Ver carta</a>
      {menu.ownerEnabled && <a className="subtle-link" href="/dueno">Cierre de noche</a>}
      {menu.staff && <button className="secondary head-button" onClick={() => action.run(async () => {
        await api('/bar/logout', {});
        setMenu(current => ({ ...current, staff: false }));
      })}>Salir</button>}
    </Header>
    {!menu.staff ? <main className="wrap narrow page">
      <form className="panel stack" onSubmit={event => {
        event.preventDefault();
        const password = new FormData(event.currentTarget).get('password');
        action.run(async () => {
          await api('/bar/login', { password });
          setMenu(current => ({ ...current, staff: true }));
        });
      }}>
        <h1>Entrar a la barra</h1>
        <label>Clave de barra<input name="password" type="password" autoComplete="current-password" required /></label>
        <ErrorText>{action.error}</ErrorText>
        <button className="primary" disabled={action.busy}>Entrar</button>
      </form>
    </main> : <main className="wrap page board">
      <div className="board-head">
        <div><p className="muted">{menu.pickup}</p><h1>Panel de barra</h1></div>
        <div className="button-row">
          <button className={menu.accepting ? 'secondary' : 'primary'} disabled={action.busy}
            onClick={() => action.run(async () => {
              const data = await api('/bar/settings', { accepting: !menu.accepting });
              setMenu(current => ({ ...current, accepting: data.accepting }));
            })}>{menu.accepting ? 'Pausar pedidos' : 'Reabrir pedidos'}</button>
        </div>
      </div>
      {!menu.accepting && <p className="notice">Pedidos nuevos en pausa. Podés seguir atendiendo los que ya llegaron.</p>}
      <ErrorText>{network || action.error}</ErrorText>
      <div className="filters" aria-label="Secciones de barra">
        <button aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>Pedidos</button>
        <button aria-pressed={tab === 'products'} onClick={() => setTab('products')}>Editar carta</button>
        <button aria-pressed={tab === 'qr'} onClick={() => setTab('qr')}>QR por sector</button>
      </div>
      {tab === 'orders' ? <>
        {orders.some(order => order.status === 'review') && <section className="review-orders">
          <h2>Revisar pagos</h2>
          {orders.filter(order => order.status === 'review').map(order => <Ticket order={order} key={order.id} onChange={update} sector={sectorName(order.sector)} />)}
        </section>}
        <div className="board-grid">
          {columns.map(([status, label]) => {
            const matching = orders.filter(order => order.status === status);
            return <section key={status} className="board-column">
              <div className="column-title"><h2>{label}</h2><span>{matching.length}</span></div>
              {matching.length ? matching.map(order => <Ticket order={order} key={order.id} onChange={update} sector={sectorName(order.sector)} />) :
                <p className="muted empty">Sin pedidos</p>}
            </section>;
          })}
        </div>
      </> : tab === 'products' ? <>
        <p className="savings" role="status">{saved}</p>
        <div className="product-editors">
          {menu.products.map(product => <ProductEditor product={product} key={product.id} onChange={async updated => {
            const catalog = await api('/catalog');
            setSaved('Guardaste ' + updated.name + '.');
            setMenu(current => ({ ...current, ...catalog }));
          }} />)}
        </div>
      </> : <section className="qr-grid" aria-label="Códigos QR de la carta">
        {menu.sectors.map(sector => {
          const url = '/api/qr?sector=' + sector.id;
          return <article className="panel stack" key={sector.id}>
            <h2>{sector.name}</h2>
            <p className="muted">Retiro en {menu.pickup}</p>
            <img className="sector-qr" src={url} alt={'QR de la carta para ' + sector.name} width="176" height="176" />
            <a className="secondary" href={url} download={'kovra-qr-' + sector.id + '.svg'}>Descargar QR</a>
          </article>;
        })}
      </section>}
    </main>}
  </>;
}
