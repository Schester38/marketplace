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
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  const isOpen = megaMenuOpen === cat.label;
  const leaveTimer = useRef(null);
  const lastTouchAt = useRef(0);
  // Appareils SANS survol (téléphone/tablette) : piloter le panneau au
  // toucher, pas au mouseenter (événements souris synthétiques sur tactile).
  const [touchMode] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
    } catch {
      return false;
    }
  });

  // Petite grâce avant fermeture : laisse descendre le curseur vers le panneau
  const cancelLeave = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };
  const delayedLeave = () => {
    cancelLeave();
    leaveTimer.current = setTimeout(() => handleMegaMenuLeave(), 220);
  };
  useEffect(() => () => cancelLeave(), []);

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
      setPos({ top: Math.round(r.bottom - 1), left: Math.round(left), width });
    };
    update();
    if (touchMode) {
      // Tactile : PAS de fermeture sur scroll (le scrollIntoView automatique
      // de la catégorie active et les swipes de la barre fermaient le panneau
      // aussitôt ouvert). À la place : fermeture au tap à l'extérieur,
      // et simple repositionnement au redimensionnement/rotation.
      const onDocDown = (e) => {
        const tgt = e.target;
        if (panelRef.current && panelRef.current.contains(tgt)) return;
        if (triggerRef.current && triggerRef.current.contains(tgt)) return;
        handleMegaMenuLeave();
      };
      window.addEventListener('resize', update);
      document.addEventListener('pointerdown', onDocDown);
      return () => {
        window.removeEventListener('resize', update);
        document.removeEventListener('pointerdown', onDocDown);
      };
    }
    const closeOnMove = () => handleMegaMenuLeave();
    window.addEventListener('resize', closeOnMove);
    window.addEventListener('scroll', closeOnMove, true);
    return () => {
      window.removeEventListener('resize', closeOnMove);
      window.removeEventListener('scroll', closeOnMove, true);
    };
  }, [isOpen, touchMode, handleMegaMenuLeave]);

  const mainTarget = cat.main || cat.label;

  return (
    <>
      <div
        key={cat.label}
        className="mega-menu-trigger"
        onTouchStart={() => { lastTouchAt.current = Date.now(); }}
        onMouseEnter={() => {
          // Ignorer les événements souris SYNTHÉTIQUES qui suivent un tap tactile
          if (Date.now() - lastTouchAt.current < 800) return;
          cancelLeave();
          handleMegaMenuEnter(cat.label);
        }}
        onMouseLeave={delayedLeave}
      >
        <Link
          ref={triggerRef}
          to={`/?cat=${encodeURIComponent(mainTarget)}`}
          data-cat={mainTarget}
          className={`cat-link mega-link${activeCat === mainTarget ? ' cat-active' : ''}`}
          role="tab"
          aria-selected={false}
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={(e) => {
            if (!touchMode) { close(); return; } // Desktop : navigation directe
            // Tactile : 1ᵉʳ appui = OUVRIR le panneau (sans naviguer),
            // 2ᵉ appui = refermer. La navigation passe par les sous-catégories
            // ou le lien « Voir tout » du panneau.
            e.preventDefault();
            if (isOpen) {
              handleMegaMenuLeave();
            } else {
              cancelLeave();
              handleMegaMenuEnter(cat.label);
            }
          }}
          onFocus={() => { cancelLeave(); handleMegaMenuEnter(cat.label); }}
          onBlur={delayedLeave}
        >
          <span className="cat-icon" aria-hidden="true">{cat.icon}</span>
          <span className="cat-label">{cat.label}</span>
          <svg className="mega-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </Link>
      </div>
      {isOpen && pos && createPortal(
        <div
          ref={panelRef}
          className="mega-menu open"
          role="menu"
          aria-label={cat.label}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            borderRadius: 14,
            maxHeight: 'min(70vh, 520px)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
          onMouseEnter={() => {
            if (Date.now() - lastTouchAt.current < 800) return;
            cancelLeave();
            handleMegaMenuEnter(cat.label);
          }}
          onMouseLeave={delayedLeave}
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