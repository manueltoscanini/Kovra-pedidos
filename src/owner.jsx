import React, { useState } from 'react';
import { api, ErrorText, Header, money, useAction, usePoll } from './shared.jsx';

const number = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 });
const minutes = value => value === null ? '—' : number.format(value) + ' min';

function Report({ report }) {
  const largest = Math.max(1, ...report.hourly.map(row => row.total));
  return <>
    <dl className="night-kpis" aria-label="Resumen de la noche">
      <div><dt>Total cobrado</dt><dd>{money(report.total)}</dd></div>
      <div><dt>Pedidos cobrados</dt><dd>{number.format(report.orders)}</dd></div>
      <div><dt>Ticket promedio</dt><dd>{report.averageTicket === null ? '—' : money(report.averageTicket)}</dd></div>
      <div><dt>De pago a listo</dt><dd>{minutes(report.averageWaitMinutes)}</dd><small>{report.measured} {report.measured === 1 ? 'pedido medido' : 'pedidos medidos'}</small></div>
      <div><dt>De toma a listo</dt><dd>{minutes(report.averagePrepMinutes)}</dd><small>{report.prepared} {report.prepared === 1 ? 'pedido medido' : 'pedidos medidos'}</small></div>
    </dl>
    {report.reversals > 0 && <p className="muted">Pagos revertidos en esta noche: {money(report.reversals)}.</p>}
    {report.orders === 0 ? <p className="panel muted">Todavía no hay cobros registrados para esta noche.</p> :
      <div className="night-details">
        <section className="panel stack">
          <h2>Ventas por hora</h2>
          <ul className="hourly-sales">
            {report.hourly.map(row => {
              const label = String(row.hour).padStart(2, '0') + ':00';
              return <li key={row.hour}>
                <div><strong>{label}</strong><small>{row.orders} {row.orders === 1 ? 'pedido' : 'pedidos'}</small></div>
                <meter min={0} max={largest} value={row.total} aria-label={'Ventas a las ' + label} />
                <strong>{money(row.total)}</strong>
              </li>;
            })}
          </ul>
        </section>
        <section className="panel stack">
          <h2>Más vendidos</h2>
          <ol className="report-list">
            {report.products.map(product => <li key={product.id}><span>{product.name}</span><strong>{product.quantity} u.</strong></li>)}
          </ol>
        </section>
        <section className="panel stack">
          <h2>Pedidos por sector</h2>
          <ul className="report-list">
            {report.sectors.map(sector => <li key={sector.id}>
              <span>{sector.name}<small>{sector.orders} {sector.orders === 1 ? 'pedido' : 'pedidos'}</small></span>
              <strong>{money(sector.total)}</strong>
            </li>)}
          </ul>
        </section>
      </div>}
  </>;
}

export default function Owner({ menu, setMenu }) {
  const [date, setDate] = useState('');
  const [report, setReport] = useState(null);
  const [network, setNetwork] = useState('');
  const action = useAction();
  const path = menu.owner ? '/owner/report' + (date ? '?night=' + encodeURIComponent(date) : '') : null;
  usePoll(path, data => { setReport(data); setNetwork(''); }, error => {
    if (error.status === 401) setMenu(current => ({ ...current, owner: false }));
    else setNetwork(error.message);
  }, 10000);

  return <>
    <Header venue={menu.venue}>
      <a className="subtle-link" href="/barra">Barra</a>
      {menu.owner && <button className="secondary head-button" onClick={() => action.run(async () => {
        await api('/owner/logout', {});
        setReport(null);
        setMenu(current => ({ ...current, owner: false }));
      })}>Salir</button>}
    </Header>
    {!menu.owner ? <main className="wrap narrow page">
      <form className="panel stack" onSubmit={event => {
        event.preventDefault();
        const password = new FormData(event.currentTarget).get('password');
        action.run(async () => {
          await api('/owner/login', { password });
          setMenu(current => ({ ...current, owner: true }));
        });
      }}>
        <h1>Cierre de noche</h1>
        {menu.ownerEnabled ? <>
          <label>Clave del dueño<input type="password" name="password" autoComplete="current-password" required /></label>
          <ErrorText>{action.error}</ErrorText>
          <button className="primary" disabled={action.busy}>Entrar</button>
        </> : <p className="muted">El acceso del dueño todavía no está configurado.</p>}
      </form>
    </main> : <main className="wrap page board night">
      <div className="board-head">
        <div>
          <h1>Cierre de noche</h1>
          <p className="muted">De 06:00 a 06:00 del día siguiente, hora de Uruguay.</p>
        </div>
        <label>Noche que empezó el
          <input type="date" value={date || report?.night || ''} onChange={event => {
            setReport(null);
            setDate(event.target.value);
          }} />
        </label>
      </div>
      {menu.demo && <p className="notice">Modo demo. El cierre incluye los cobros simulados.</p>}
      <ErrorText>{network || action.error}</ErrorText>
      {report ? <Report report={report} /> : !network && <p className="muted" role="status">Cargando cierre…</p>}
    </main>}
  </>;
}
