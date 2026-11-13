import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans/wght.css';
import './style.css';
import Shop from './shop.jsx';
import Track from './track.jsx';
import Bar from './bar.jsx';
import Owner from './owner.jsx';
import { api } from './shared.jsx';

function App() {
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { api('/menu').then(setMenu).catch(() => setError(true)); }, []);
  if (!menu) return <main className="wrap page"><p role="status">
    {error ? 'No pudimos cargar la carta. Recargá la página para volver a intentar.' : 'Cargando la carta…'}
  </p></main>;
  const pathname = window.location.pathname;
  if (pathname === '/barra') return <Bar menu={menu} setMenu={setMenu} />;
  if (pathname === '/dueno') return <Owner menu={menu} setMenu={setMenu} />;
  if (pathname.startsWith('/pedido/')) return <Track token={pathname.slice(8)} menu={menu} />;
  return <Shop menu={menu} setMenu={setMenu} />;
}

createRoot(document.getElementById('root')).render(<App />);
