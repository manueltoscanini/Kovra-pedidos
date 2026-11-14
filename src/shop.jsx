import React, { useRef, useState } from 'react';
import { api, ErrorText, groups, Header, money, Sheet, useAction, usePoll } from './shared.jsx';

const cartKey = 'entrepista-cart';
export const lastOrderKey = 'entrepista-last-order';

function savedCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey)) || {};
  } catch {
    return {};
  }
}

function AccountForm({ menu, onEmail, onBack }) {
  const [mode, setMode] = useState('register');
  const action = useAction();
  function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    action.run(async () => {
      const data = await api('/account/' + mode, fields);
      onEmail(data.email);
    });
  }

  if (menu.email) return <div className="stack">
    <p className="muted">Tu cuenta tiene un 5 % de descuento.</p>
    <strong>{menu.email}</strong>
    <ErrorText>{action.error}</ErrorText>
    <button className="secondary" onClick={() => action.run(async () => {
      await api('/account/logout', {});
      onEmail(null);
    })}>Cerrar sesión</button>
  </div>;

  return <div className="stack">
    <p className="muted">Ahorrá 5 % en tus pedidos cuando entrás con tu cuenta.</p>
    <form onSubmit={submit} className="stack">
      <label>Correo electrónico<input autoComplete="email" name="email" type="email" required /></label>
      <label>Contraseña<input autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        name="password" type="password" required minLength={10} maxLength={128} /></label>
      <ErrorText>{action.error}</ErrorText>
      <button className="primary" disabled={action.busy}>{mode === 'register' ? 'Crear cuenta y ahorrar 5 %' : 'Iniciar sesión'}</button>
    </form>
    <button className="text-button" onClick={() => {
      action.setError('');
      setMode(mode === 'register' ? 'login' : 'register');
    }}>{mode === 'register' ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button>
    {onBack && <button className="secondary" onClick={onBack}>Seguir como invitado</button>}
  </div>;
}

export default function Shop({ menu, setMenu }) {
  const [cart, setCart] = useState(savedCart);
  const [filter, setFilter] = useState('Todo');
  const [sheet, setSheet] = useState('');
  const [returnToCart, setReturnToCart] = useState(false);
  const [adult, setAdult] = useState(false);
  const requestId = useRef(null);
  const action = useAction();
  const sectorId = new URLSearchParams(window.location.search).get('sector');
  const sector = menu.sectors.find(item => item.id === sectorId) ?? menu.sectors[0];
  usePoll('/catalog', catalog => setMenu(current => ({ ...current, ...catalog })), () => {}, 3000);
  const products = menu.products;
  const chosen = products.filter(product => cart[product.id] > 0);
  const visible = products.filter(product => filter === 'Todo' || product.category === filter);
  const count = chosen.reduce((sum, product) => sum + cart[product.id], 0);
  const subtotal = chosen.reduce((sum, product) => sum + cart[product.id] * product.price, 0);
  const discount = menu.email ? Math.round(subtotal * .05) : 0;
  const alcohol = chosen.some(product => product.alcohol);
  const unavailable = chosen.some(product => !product.available);
  const lastOrder = localStorage.getItem(lastOrderKey);

  function quantity(id, value) {
    const next = { ...cart };
    if (value > 0) next[id] = value;
    else delete next[id];
    localStorage.setItem(cartKey, JSON.stringify(next));
    requestId.current = null;
    setCart(next);
  }

  function openAccount(fromCart) {
    setReturnToCart(fromCart);
    setSheet('account');
  }

  function order(event) {
    event.preventDefault();
    action.run(async () => {
      requestId.current ??= crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)),
        byte => byte.toString(16).padStart(2, '0')).join('');
      const created = await api('/orders', {
        requestId: requestId.current, adult, sector: sector.id,
        items: chosen.map(product => ({ id: product.id, quantity: cart[product.id] })),
      });
      localStorage.setItem(lastOrderKey, created.token);
      localStorage.removeItem(cartKey);
      window.location.assign('/pedido/' + created.token);
    });
  }

  return <>
    <Header venue={menu.venue}>
      {lastOrder && <a className="subtle-link" href={'/pedido/' + lastOrder}>Mi pedido</a>}
      <button className="secondary head-button" onClick={() => openAccount(false)}>{menu.email ? 'Mi cuenta' : 'Mi cuenta · −5 %'}</button>
    </Header>
    <main className="wrap shop">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <div className={'bar-status' + (menu.accepting ? '' : ' paused')}>
            <span aria-hidden="true" />{menu.accepting ? 'Barra abierta' : 'Pedidos en pausa'}
          </div>
          <h1 id="hero-title">La carta<span>.</span></h1>
          <p>Pedí desde la pista. Retirá en la barra.</p>
        </div>
      </section>
      {sector.id !== 'general' && <p className="sector-location"><strong>{sector.name}</strong><span>Retiro en {menu.pickup}</span></p>}
      <section className="catalog" aria-label="Bebidas">
        <div className="section-head">
          <h2>¿Qué tomás?</h2>
          <div className="filters" aria-label="Filtrar bebidas">
            {['Todo', ...groups].map(group => <button type="button" key={group} aria-pressed={filter === group}
              onClick={() => setFilter(group)}>{group}</button>)}
          </div>
        </div>
        <div className="drinks">
          {visible.map((product, index) => <article key={product.id} className="drink">
            <img className="drink-image" src={'/drinks/' + product.id + '.webp'} alt="" loading={index < 3 ? 'eager' : 'lazy'} width="540" height="540" />
            <div className="drink-detail">
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="drink-bottom">
                <strong>{money(product.price)}</strong>
                {product.available ? <button className="add" disabled={!menu.accepting || cart[product.id] >= 12}
                  aria-label={'Agregar ' + product.name} onClick={() => quantity(product.id, (cart[product.id] || 0) + 1)}>
                  {cart[product.id] ? <span>{cart[product.id]}</span> : null}<b aria-hidden="true">+</b>
                </button> : <span className="muted">Agotado</span>}
              </div>
            </div>
          </article>)}
        </div>
      </section>
      <footer className="site-footer">
        <span>Prohibida la venta a menores de 18 años de edad.</span>
        <a href="/marca">Conocé KOVRA</a>
        <a href="/barra">Panel de barra</a>
      </footer>
    </main>
    {count > 0 && <div className="dock">
      <button className="primary cart-button" onClick={() => setSheet('cart')}>
        <span><b>{count}</b> Ver pedido</span><strong>{money(subtotal - discount)}</strong>
      </button>
    </div>}
    {sheet === 'account' && <Sheet title="Mi cuenta" onClose={() => setSheet(returnToCart ? 'cart' : '')}>
      <AccountForm menu={menu} onBack={returnToCart ? () => setSheet('cart') : null} onEmail={email => {
        requestId.current = null;
        setMenu(current => ({ ...current, email }));
        setSheet(returnToCart ? 'cart' : '');
      }} />
    </Sheet>}
    {sheet === 'cart' && <Sheet title="Tu pedido" onClose={() => setSheet('')}>
      <form className="stack" onSubmit={order}>
        <ul className="cart-list">
          {chosen.map(product => <li key={product.id}>
            <div><strong>{product.name}</strong><small>{product.available ? money(product.price) : 'Agotado'}</small></div>
            <div className="quantity">
              <button className="icon-button" aria-label={'Quitar ' + product.name} type="button"
                onClick={() => quantity(product.id, cart[product.id] - 1)}>−</button>
              <span>{cart[product.id]}</span>
              <button className="icon-button" aria-label={'Agregar ' + product.name} type="button"
                disabled={!product.available || cart[product.id] >= 12} onClick={() => quantity(product.id, cart[product.id] + 1)}>+</button>
            </div>
          </li>)}
        </ul>
        {chosen.length === 0 && <p className="muted">Tu carrito está vacío.</p>}
        {count > 0 && <>
          {!menu.email && <div className="offer">
            <div><strong>5 % menos con tu cuenta</strong><small>También podés seguir como invitado.</small></div>
            <button type="button" className="text-button" onClick={() => openAccount(true)}>Mi cuenta →</button>
          </div>}
          {discount > 0 && <div className="total-row savings"><span>Descuento de cuenta</span><span>−{money(discount)}</span></div>}
          <div className="total-row"><strong>Total</strong><strong>{money(subtotal - discount)}</strong></div>
          {alcohol && <label className="check"><input type="checkbox" checked={adult} required onChange={event => setAdult(event.target.checked)} />
            Confirmo que tengo 18 años o más.</label>}
          {!menu.accepting && <p className="muted">La barra pausó los pedidos.</p>}
          {unavailable && <p className="error" role="status">Quitá los productos agotados para seguir.</p>}
          <ErrorText>{action.error}</ErrorText>
          <button className="primary" disabled={action.busy || !menu.accepting || unavailable}>
            {action.busy ? 'Guardando pedido…' : menu.email ? 'Continuar al pago' : 'Continuar como invitado'}
          </button>
        </>}
      </form>
    </Sheet>}
  </>;
}
