import React, { useEffect, useRef } from 'react';
import ProductCard from './ProductCard.jsx';
import { useLang } from '../i18n.jsx';
import { IconChevronLeft, IconChevronRight } from './icons.jsx';

/**
 * Enveloppe de rail horizontal avec flèches visibles au survol (desktop)
 * et apparition progressive au scroll (IntersectionObserver).
 * Réutilisée par ProductRail et le rail des promotions éclair.
 */
export function RailShell({ title, hint, emoji, children, ariaLabel }) {
  const { t } = useLang();
  const scroller = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('revealed');
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const scrollByDir = (dir) => {
    const el = scroller.current;
    if (!el) return;
    let d = dir;
    try {
      if (document.documentElement.getAttribute('dir') === 'rtl') d = -dir;
    } catch {
      /* ignore */
    }
    el.scrollBy({ left: d * Math.max(260, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section
      ref={sectionRef}
      aria-label={ariaLabel || title}
      className="product-rail rail-shell reveal"
    >
      <div className="section-head">
        <h2 className="section-title">{emoji ? `${emoji} ` : ''}{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="rail-frame">
        <button
          type="button"
          className="rail-arrow rail-arrow-prev"
          aria-label={t('Défiler vers la gauche')}
          onClick={() => scrollByDir(-1)}
        >
          <IconChevronLeft size={20} />
        </button>
        <div className="rail-scroll" ref={scroller}>
          {children}
        </div>
        <button
          type="button"
          className="rail-arrow rail-arrow-next"
          aria-label={t('Défiler vers la droite')}
          onClick={() => scrollByDir(1)}
        >
          <IconChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}

export default function ProductRail({ title, hint, emoji, products, badge }) {
  if (!products || products.length === 0) return null;
  return (
    <RailShell title={title} hint={hint} emoji={emoji}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} badge={badge} />
      ))}
    </RailShell>
  );
}
