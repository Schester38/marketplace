import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import { IconChevronLeft, IconChevronRight, IconBolt, IconStore, IconGift, IconUsers } from './icons.jsx';

const AUTOPLAY_MS = 6000;
const SWIPE_PX = 42;

/**
 * Bandeau carrousel de la page d'accueil : mise en avant boutiques,
 * promotions éclair, parrainage 2 %, devenir vendeur.
 * Indicateurs de pagination + flèches + défilement tactile, compatible RTL.
 */
export default function HeroCarousel({ onExplore }) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const timer = useRef(null);

  const slides = [
    {
      id: 'welcome',
      cls: 'hc-orange',
      kicker: t('BIENVENUE SUR MBOPPI'),
      title: t('Le marché de votre quartier, en ligne'),
      text: t('Produits des boutiques, créations des créateurs, livraison près de chez vous.'),
      cta: t('Découvrir les produits'),
      to: '#produits',
      icon: <IconUsers size={26} />,
    },
    {
      id: 'flash',
      cls: 'hc-navy',
      kicker: t('PROMOTIONS DU JOUR'),
      title: t('Offres éclair à durée limitée'),
      text: t('Jusqu\'à -50 % sur une sélection de produits. Une seule semaine par boutique : unique !'),
      cta: t('Voir les promotions'),
      to: '/?rail=promos',
      icon: <IconBolt size={26} />,
    },
    {
      id: 'seller',
      cls: 'hc-green',
      kicker: t('VENDEURS & BOUTIQUES'),
      title: t('Vendez près de chez vous, sans frais de plateforme'),
      text: t('Publiez vos produits en quelques minutes et recevez vos commandes par téléphone ou WhatsApp.'),
      cta: t('Devenir vendeur'),
      to: '/register',
      icon: <IconStore size={26} />,
    },
    {
      id: 'referral',
      cls: 'hc-violet',
      kicker: t('PROGRAMME DE PARRAINAGE'),
      title: t('Gagnez 2 % sur chaque achat de vos clients affiliés'),
      text: t('Partagez votre code vendeur : vos clients achètent, vous touchez 2 % automatiquement.'),
      cta: t('Créer mon compte gratuit'),
      to: '/register',
      icon: <IconGift size={26} />,
    },
  ];

  const count = slides.length;
  const rtlMult = (() => {
    try {
      return (document.documentElement.getAttribute('dir') === 'rtl') ? -1 : 1;
    } catch {
      return 1;
    }
  })();

  const go = useCallback((i) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    timer.current = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer.current);
  }, [index, paused, count, go]);

  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchEnd = (e) => {
    if (touchX.current != null) {
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
    }
    touchX.current = null;
    setPaused(false);
  };

  return (
    <section
      className={`hero-carousel hc-${slides[index]?.cls || ''}`}
      role="region"
      aria-roledescription="carrousel"
      aria-label={t('À la une sur Mboppi')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="hero-carousel-track"
        style={{ transform: `translateX(${rtlMult * -index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div
            className="hero-slide"
            key={s.id}
            aria-hidden={i !== index || undefined}
            aria-label={`${i + 1} / ${count}`}
          >
            <span className="hero-slide-icon" aria-hidden="true">{s.icon}</span>
            <div className="hero-slide-body">
              <span className="hero-slide-kicker">{s.kicker}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
            {s.to.startsWith('#') ? (
              <button type="button" className="btn btn-light hero-slide-cta" tabIndex={i === index ? 0 : -1} onClick={onExplore}>
                {s.cta} →
              </button>
            ) : (
              <Link className="btn btn-light hero-slide-cta" to={s.to} tabIndex={i === index ? 0 : -1}>
                {s.cta} →
              </Link>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="hc-arrow hc-arrow-prev"
        aria-label={t('Diapositive précédente')}
        onClick={() => go(index - 1)}
      >
        <IconChevronLeft size={20} />
      </button>
      <button
        type="button"
        className="hc-arrow hc-arrow-next"
        aria-label={t('Diapositive suivante')}
        onClick={() => go(index + 1)}
      >
        <IconChevronRight size={20} />
      </button>

      <div className="hc-dots" role="tablist" aria-label={t('Choisir une diapositive')}>
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${t('Diapositive')} ${i + 1} : ${s.kicker}`}
            className={`hc-dot ${i === index ? 'active' : ''}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
}
