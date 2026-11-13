import React, { useEffect, useRef, useState } from 'react';

export const groups = ['Tragos', 'Cervezas', 'Sin alcohol', 'Combos'];
export const money = cents => '$ ' + new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2,
}).format(cents / 100);
export const orderNumber = id => '#' + String(id).padStart(3, '0');

export async function api(path, body) {
  const response = await fetch('/api' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  async function run(callback) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await callback();
    } catch (failure) {
      setError(failure.message === 'Failed to fetch' ? 'Se perdió la conexión. Probá de nuevo.' : failure.message);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  return { busy, error, run, setError };
}

export function usePoll(path, onValue, onError, delay = 2600) {
  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    let timer;
    async function refresh() {
      try {
        const result = await api(path);
        if (active) onValue(result);
      } catch (error) {
        if (active) onError(error);
      } finally {
        if (active) timer = setTimeout(refresh, delay);
      }
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [path, delay]);
}

export function ErrorText({ children }) {
  return children ? <p className="error" role="alert">{children}</p> : null;
}

export function Header({ venue, children }) {
  return <header className="site-head">
    <div className="wrap head-inner">
      <a className="brand" href="/" aria-label={venue + ', volver a la carta'}>
        {venue === 'KOVRA' ? <img className="brand-mark" src="/kovra-mark.png" width="200" height="36" alt="" /> : <span>{venue}</span>}
      </a>
      <nav aria-label="Navegación">{children}</nav>
    </div>
  </header>;
}

export function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; dialog.close(); };
  }, []);
  return <dialog ref={ref} className="sheet" aria-labelledby="sheet-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-body">
      <div className="sheet-head">
        <h2 id="sheet-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  </dialog>;
}
