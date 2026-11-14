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

function OrderProgress() {
  return <div className="brand-order-progress">
    <ol aria-label="Estados de un pedido">
      <li>Pedido recibido</li>
      <li>En preparación</li>
      <li>Listo</li>
    </ol>
  </div>;
}

function MissionMedia({ src, poster }) {
  const player = useRef(null);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    let frame = 0;

    function updateTime() {
      frame = 0;
      const duration = element.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const rect = element.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const center = rect.top + rect.height / 2;
      const start = vh * 0.88;
      const end = vh * 0.15;
      const progress = Math.min(1, Math.max(0, (start - center) / (start - end)));
      const target = Math.min(duration - 0.04, Math.max(0, progress * duration));
      if (Math.abs(element.currentTime - target) > 0.015) {
        element.currentTime = target;
      }
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(updateTime);
    }

    function onLoaded() {
      element.pause();
      updateTime();
    }

    element.addEventListener('loadedmetadata', onLoaded);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (element.readyState >= 1) onLoaded();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      element.removeEventListener('loadedmetadata', onLoaded);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [src]);

  return <video ref={player} className="brand-mission-media" src={src} poster={poster}
    muted playsInline preload="auto"
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
  const missionVideo = videos['./brand-media/nuestra-mision.mp4'];
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
        {missionVideo
          ? <MissionMedia src={missionVideo} poster={posters['./brand-media/nuestra-mision.webp']} />
          : <img className="brand-mission-media" src="/marca-imagenes/restaurantes-y-cafeterias.webp" width="512" height="512" loading="lazy" alt="Un mozo lleva un plato a la mesa" />}
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
