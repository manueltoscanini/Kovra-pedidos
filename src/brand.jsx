import React, { useEffect, useRef, useState } from 'react';
import { Header } from './shared.jsx';
import { industries } from './industries.js';
import BrandContact from './BrandContact.jsx';
import './brand.css';
import './brand-story.css';

const videos = import.meta.glob('./brand-media/*.mp4', {
  eager: true, query: '?url&no-inline', import: 'default',
});
const posters = import.meta.glob('./brand-media/*.webp', {
  eager: true, query: '?url&no-inline', import: 'default',
});

const industryUrl = industry => '/marca/' + industry.slug;

function IndustryHero({ industry, landing = false }) {
  const poster = posters[`./brand-media/${industry.slug}.webp`] ?? `/marca-imagenes/${industry.slug}.webp`;
  const video = videos['./brand-media/' + industry.slug + '.mp4'];
  const player = useRef(null);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    element.defaultMuted = true;
    element.muted = true;
    element.playsInline = true;
    element.play().catch(() => {});
  }, [video]);

  function shiftMedia(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const stage = event.currentTarget;
    const frame = stage.getBoundingClientRect();
    stage.style.setProperty('--hero-x', `${(event.clientX - frame.left - frame.width / 2) / frame.width * 24}px`);
    stage.style.setProperty('--hero-y', `${(event.clientY - frame.top - frame.height / 2) / frame.height * 16}px`);
  }

  function shiftWordmark(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const mark = event.currentTarget;
    const frame = mark.getBoundingClientRect();
    const dx = (event.clientX - frame.left - frame.width / 2) / (frame.width / 2);
    const dy = (event.clientY - frame.top - frame.height / 2) / (frame.height / 2);
    mark.style.setProperty('--mark-x', `${dx * 14}px`);
    mark.style.setProperty('--mark-y', `${dy * 9 - 4}px`);
    mark.style.setProperty('--mark-rot', `${dx * 1.4}deg`);
    mark.style.setProperty('--mark-scale', '1.03');
  }

  function resetWordmark(event) {
    const mark = event.currentTarget;
    mark.style.removeProperty('--mark-x');
    mark.style.removeProperty('--mark-y');
    mark.style.removeProperty('--mark-rot');
    mark.style.removeProperty('--mark-scale');
  }

  return <section className="industry-hero" aria-labelledby="brand-title"
    data-industry={industry.slug}
    onPointerMove={shiftMedia} onPointerLeave={event => {
      event.currentTarget.style.removeProperty('--hero-x');
      event.currentTarget.style.removeProperty('--hero-y');
    }}>
    <div className="industry-frame" aria-hidden="true">
      {video
        ? <video key={video} ref={player} className="industry-media" src={video} poster={poster}
            autoPlay muted loop playsInline preload="metadata" />
        : <img className="industry-media" src={poster} alt="" width="512" height="512" />}
    </div>
    <div className="industry-hero-copy">
      {landing && <img className="industry-wordmark" src="/kovra-mark.svg" width="499" height="90" alt=""
        onPointerEnter={shiftWordmark} onPointerMove={shiftWordmark} onPointerLeave={resetWordmark} />}
      <h1 id="brand-title">{landing ? 'Los pedidos de tu negocio, en un solo lugar.' : industry.title}</h1>
    </div>
  </section>;
}

function IndustryShowcase({ contact }) {
  const [selected, setSelected] = useState(industries[0]);
  return <>
    <IndustryHero industry={selected} landing />
    <section id="rubros" className="industry-showcase wrap" aria-labelledby="industry-title">
      <h2 id="industry-title">Todos los rubros</h2>
      <div className="industry-selector" aria-label="Elegí un rubro">
        {industries.map(industry => <button key={industry.slug} type="button"
          aria-pressed={selected.slug === industry.slug} onClick={() => setSelected(industry)}>
          {industry.title}
        </button>)}
      </div>
      <div className="industry-copy" aria-live="polite">
        <h2>{selected.title}</h2>
        <div>
          <p>{selected.intro}</p>
          <a className="industry-link" href={industryUrl(selected)}>Ver cómo funciona <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <a className="primary brand-cta" href={contact || '#contacto'}>
        {contact ? 'Hablemos de tu negocio' : 'Pedí una demo'}
      </a>
    </section>
  </>;
}

function BrandHeader({ overlay = false }) {
  if (!overlay) return <Header venue="KOVRA" home="/marca">
    <a className="subtle-link" href="/marca#rubros">Rubros</a>
    <a className="subtle-link" href="/marca#equipo">Quiénes somos</a>
  </Header>;
  return <header className="brand-overlay">
    <nav aria-label="Navegación de KOVRA">
      <a href="/marca#rubros">Rubros</a>
      <a href="/marca" aria-label="KOVRA">
        <img src="/kovra-icon.svg" alt="" width="36" height="36" />
      </a>
      <a href="/marca#equipo">Quiénes somos</a>
    </nav>
  </header>;
}

function BrandFooter() {
  return <footer className="brand-footer">
    <div className="wrap">Hecho por <strong>KOVRA Engineering</strong></div>
  </footer>;
}

function IndustryPage({ industry }) {
  return <>
    <BrandHeader overlay />
    <main className="brand-page">
      <section className="brand-dark">
        <IndustryHero industry={industry} />
        <div className="wrap industry-detail">
          <a className="brand-back" href="/marca#rubros">← Todos los rubros</a>
          <p>{industry.intro}</p>
        </div>
      </section>
      <section className="wrap brand-section industry-flow" aria-labelledby="flow-title">
        <h2 id="flow-title">Así podría funcionar</h2>
        <ol>
          <li><h3>El pedido entra</h3><p>{industry.origin}</p></li>
          <li><h3>El equipo lo prepara</h3><p>{industry.team}</p></li>
          <li><h3>El pedido llega</h3><p>{industry.handoff}</p></li>
        </ol>
      </section>
      <nav className="wrap brand-related" aria-label="Otros rubros">
        <h2>Otros rubros</h2>
        {industries.filter(item => item !== industry).map(item =>
          <a key={item.slug} href={industryUrl(item)}>{item.title} <span aria-hidden="true">↗</span></a>,
        )}
      </nav>
      <BrandContact />
    </main>
    <BrandFooter />
  </>;
}

const ORDER_STEPS = [
  { label: 'Pedido recibido', detail: 'Entra desde el QR' },
  { label: 'En preparación', detail: 'El equipo lo toma' },
  { label: 'Listo', detail: 'Aviso para entregar' },
];

function OrderProgress() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive(current => (current + 1) % ORDER_STEPS.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="brand-order-progress" data-step={active}>
    <div className="brand-order-bar" aria-hidden="true">
      <span style={{ transform: `scaleX(${(active + 1) / ORDER_STEPS.length})` }} />
    </div>
    <ol aria-label="Estados de un pedido">
      {ORDER_STEPS.map((step, index) => (
        <li key={step.label}
          data-active={active === index ? 'true' : 'false'}
          data-done={index < active ? 'true' : 'false'}
          onClick={() => setActive(index)}>
          <span className="brand-order-label">{step.label}</span>
          <span className="brand-order-meta">{step.detail}</span>
        </li>
      ))}
    </ol>
  </div>;
}

const SPRITE_COLS = 5;
const SPRITE_ROWS = 8;
const SPRITE_FRAMES = SPRITE_COLS * SPRITE_ROWS;
const FRAME_W = 768;
const FRAME_H = 432;

function MissionMedia({ sprite, poster }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameReq = 0;
    let lastIndex = -1;
    let spriteReady = false;

    const posterImg = new Image();
    const spriteImg = new Image();

    function getProgress() {
      const rect = canvas.getBoundingClientRect();
      const vh = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 1;
      const center = rect.top + rect.height / 2;
      const start = vh * 0.9;
      const end = vh * 0.12;
      return Math.min(1, Math.max(0, (start - center) / (start - end)));
    }

    function renderFrame(force = false) {
      frameReq = 0;
      if (!spriteReady) {
        if (posterImg.complete && posterImg.naturalWidth > 0) {
          ctx.drawImage(posterImg, 0, 0, FRAME_W, FRAME_H);
        }
        return;
      }
      const progress = getProgress();
      const index = Math.min(SPRITE_FRAMES - 1, Math.max(0, Math.round(progress * (SPRITE_FRAMES - 1))));
      if (!force && index === lastIndex) return;
      lastIndex = index;
      const col = index % SPRITE_COLS;
      const row = Math.floor(index / SPRITE_COLS);
      ctx.drawImage(
        spriteImg,
        col * FRAME_W,
        row * FRAME_H,
        FRAME_W,
        FRAME_H,
        0,
        0,
        FRAME_W,
        FRAME_H,
      );
    }

    function onScroll() {
      if (!frameReq) frameReq = window.requestAnimationFrame(() => renderFrame(false));
    }

    posterImg.onload = () => {
      if (!spriteReady) renderFrame(true);
    };
    spriteImg.onload = () => {
      spriteReady = true;
      renderFrame(true);
    };

    if (poster) posterImg.src = poster;
    if (sprite) spriteImg.src = sprite;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', onScroll);
    renderFrame(true);

    return () => {
      if (frameReq) window.cancelAnimationFrame(frameReq);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.visualViewport?.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onScroll);
    };
  }, [sprite, poster]);

  return <canvas ref={canvasRef} className="brand-mission-media"
    width={FRAME_W} height={FRAME_H} role="img"
    aria-label="Un pedido pasa de las manos de quien lo prepara a quien lo entrega" />;
}

export default function BrandPage() {
  const path = window.location.pathname.replace(/\/$/, '');
  const industry = industries.find(item => industryUrl(item) === path);
  if (industry) return <IndustryPage industry={industry} />;
  if (path !== '/marca') return <>
    <BrandHeader />
    <main className="wrap page">
      <h1>Rubro no encontrado</h1>
      <a className="text-button" href="/marca#rubros">Explorar rubros</a>
    </main>
  </>;

  const overviewVideo = videos['./brand-media/que-hacemos.mp4'];
  const missionSprite = posters['./brand-media/nuestra-mision-frames.webp'];
  const missionPoster = posters['./brand-media/nuestra-mision.webp'];
  const contact = import.meta.env.VITE_BRAND_CONTACT_URL?.trim();
  const hasContact = /^(https:\/\/|mailto:).+/i.test(contact ?? '');
  return <>
    <BrandHeader overlay />
    <main className="brand-page">
      <div className="brand-dark">
        <IndustryShowcase contact={hasContact ? contact : undefined} />
      </div>
      <section className="wrap brand-section" aria-labelledby="about-title">
        <h2 id="about-title">Qué es KOVRA</h2>
        <div className="brand-prose">
          <p>KOVRA es una plataforma para organizar los pedidos de un negocio desde que entran hasta que se retiran o se entregan.</p>
        </div>
      </section>
      <section id="soluciones" className="wrap brand-section" aria-labelledby="solutions-title">
        <h2 id="solutions-title">Qué hacemos</h2>
        <div className="brand-prose">
          <p className="brand-statement">Cada pedido tiene un lugar y un estado claro.</p>
          <p>Tu equipo puede ver qué entró, qué está preparando y qué ya entregó. También puede consultar cobros, disponibilidad y tiempos de preparación.</p>
          {overviewVideo
            ? <video className="brand-overview-media" src={overviewVideo} autoPlay loop muted playsInline preload="metadata" aria-label="Animación de cómo funciona KOVRA" />
            : <OrderProgress />}
        </div>
      </section>
      <section className="brand-mission" aria-labelledby="mission-title">
        <h2 className="wrap" id="mission-title">Nuestra misión</h2>
        {missionSprite
          ? <MissionMedia sprite={missionSprite} poster={missionPoster} />
          : <img className="brand-mission-media" src={missionPoster ?? '/marca-imagenes/restaurantes-y-cafeterias.webp'} width="512" height="512" loading="lazy" alt="Un mozo lleva un plato a la mesa" />}
      </section>
      <section id="equipo" className="wrap brand-section" aria-labelledby="team-title">
        <h2 id="team-title">Quiénes somos</h2>
        <div className="brand-team">
          <article>
            <h3>Julieta Tabares Romano</h3>
            <p className="brand-role">Logística y desarrollo de marca</p>
            <p>Tecnóloga en Logística y estudiante avanzada de Ingeniería Logística. Tiene experiencia en creación de contenido, desarrollo de marca y enseñanza de inglés. Aplica design thinking y metodologías ágiles para resolver problemas reales.</p>
          </article>
          <article>
            <h3>Manuel R. Toscanini</h3>
            <p className="brand-role">Software y gestión de proyectos</p>
            <p>Estudiante avanzado de Tecnólogo en Informática. Trabajó en infraestructura tecnológica en la Universidad Tecnológica del Uruguay (UTEC) y tiene experiencia en relaciones humanas. Cursó formación básica en gestión de proyectos de Google y trabaja con prácticas de ingeniería de software, Agile y Scrum. Le interesan la innovación, el design thinking y la Teoría U.</p>
          </article>
        </div>
      </section>
      <BrandContact />
    </main>
    <BrandFooter />
  </>;
}
