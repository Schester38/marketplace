import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import { getCategoryIcon } from './icons.jsx';

function MegaMenuItem({ sub, cat, t, closeMegaMenu }) {
  return (
    <Link
      to={`/?cat=${encodeURIComponent(sub)}`}
      onClick={closeMegaMenu}
      className="mega-menu-item"
      role="menuitem"
    >
      <span className="mega-item-icon">{getCategoryIcon(sub, 16)}</span>
      <span className="mega-item-label">{t(sub)}</span>
    </Link>
  );
}

function MegaMenuGrid({ cat, t, closeMegaMenu }) {
  return (
    <div className="mega-menu-grid">
      {cat.subcategories.map((sub) => (
        <MegaMenuItem
          key={sub}
          sub={sub}
          cat={cat}
          t={t}
          closeMegaMenu={closeMegaMenu}
        />
      ))}
    </div>
  );
}

function MegaMenuContent({ cat, t, closeMegaMenu }) {
  return (
    <div className="mega-menu-content">
      <div className="mega-menu-header">
        <Link
          to={`/?cat=${encodeURIComponent(cat.main || cat.label)}`}
          onClick={closeMegaMenu}
          className="mega-menu-title-link"
        >
          <span className="mega-item-icon mega-title-icon">{getCategoryIcon(cat.main || cat.label, 18)}</span>
          <span className="mega-menu-title">{cat.label}</span>
          <span className="mega-see-all">{t('Voir tout')} →</span>
        </Link>
      </div>
      <MegaMenuGrid cat={cat} t={t} closeMegaMenu={closeMegaMenu} />
    </div>
  );
}

function MegaMenuTrigger({ cat, megaMenuOpen, handleMegaMenuEnter, handleMegaMenuLeave, close, t, closeMegaMenu, activeCat }) {
  const triggerRef = useRef(null);
  const [pos, setPos] = useState(null);
  const isOpen = megaMenuOpen === cat.label;

  // Panneau PORTALÉ vers <body> en fixed : l'overflow-x du conteneur de la
  // barre rognerait sinon le panneau verticalement (clip Y forcé).
  useEffect(() => {
    if (!isOpen) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 360;
      const width = Math.min(380, vw - 24);
      const rtl = document.documentElement.getAttribute('dir') === 'rtl';
      let left = rtl ? r.right - width : r.left;
      left = Math.max(12, Math.min(left, vw - width - 12));
      setPos({ top: Math.round(r.bottom + 6), left: Math.round(left), width });
    };
    update();
    const closeOnMove = () => handleMegaMenuLeave();
    window.addEventListener('resize', closeOnMove);
    window.addEventListener('scroll', closeOnMove, true);
    return () => {
      window.removeEventListener('resize', closeOnMove);
      window.removeEventListener('scroll', closeOnMove, true);
    };
  }, [isOpen, handleMegaMenuLeave]);

  const mainTarget = cat.main || cat.label;

  return (
    <>
      <div
        key={cat.label}
        className="mega-menu-trigger"
        onMouseEnter={() => handleMegaMenuEnter(cat.label)}
        onMouseLeave={handleMegaMenuLeave}
      >
        <Link
          ref={triggerRef}
          to={`/?cat=${encodeURIComponent(mainTarget)}`}
          onClick={close}
          data-cat={mainTarget}
          className={`cat-link mega-link${activeCat === mainTarget ? ' cat-active' : ''}`}
          role="tab"
          aria-selected={false}
          aria-haspopup="true"
          aria-expanded={isOpen}
          onFocus={() => handleMegaMenuEnter(cat.label)}
          onBlur={() => setTimeout(() => handleMegaMenuLeave(), 100)}
        >
          <span className="cat-icon" aria-hidden="true">{cat.icon}</span>
          <span className="cat-label">{cat.label}</span>
          <svg className="mega-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </Link>
      </div>
      {isOpen && pos && createPortal(
        <div
          className="mega-menu open"
          role="menu"
          aria-label={cat.label}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            borderRadius: 14,
          }}
          onMouseEnter={() => handleMegaMenuEnter(cat.label)}
          onMouseLeave={handleMegaMenuLeave}
        >
          <MegaMenuContent cat={cat} t={t} closeMegaMenu={closeMegaMenu} />
        </div>,
        document.body
      )}
    </>
  );
}

export function MegaMenu({
  megaMenuItems,
  megaMenuOpen,
  handleMegaMenuEnter,
  handleMegaMenuLeave,
  close,
  closeMegaMenu,
  t,
  activeCat,
}) {
  return (
    <>
      {megaMenuItems.map((cat) => (
        <MegaMenuTrigger
          key={cat.label}
          cat={cat}
          megaMenuOpen={megaMenuOpen}
          handleMegaMenuEnter={handleMegaMenuEnter}
          handleMegaMenuLeave={handleMegaMenuLeave}
          close={close}
          closeMegaMenu={closeMegaMenu}
          t={t}
          activeCat={activeCat}
        />
      ))}
    </>
  );
}

export default MegaMenu;