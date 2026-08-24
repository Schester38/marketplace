import React from 'react';
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

function MegaMenuTrigger({ cat, megaMenuOpen, handleMegaMenuEnter, handleMegaMenuLeave, close, t, closeMegaMenu }) {
  return (
    <div key={cat.label} className="mega-menu-trigger">
      <Link
        to={`/?cat=${encodeURIComponent(cat.main || cat.label)}`}
        onClick={close}
        className="cat-link mega-link"
        role="tab"
        aria-selected={false}
        aria-haspopup="true"
        aria-expanded={megaMenuOpen === cat.label}
        onMouseEnter={() => handleMegaMenuEnter(cat.label)}
        onMouseLeave={handleMegaMenuLeave}
        onFocus={() => handleMegaMenuEnter(cat.label)}
        onBlur={() => setTimeout(() => handleMegaMenuLeave(), 100)}
      >
        <span className="cat-icon" aria-hidden="true">{cat.icon}</span>
        <span className="cat-label">{cat.label}</span>
        <svg className="mega-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </Link>
      <div
        className={`mega-menu${megaMenuOpen === cat.label ? ' open' : ''}`}
        role="menu"
        aria-label={cat.label}
        onMouseEnter={() => handleMegaMenuEnter(cat.label)}
        onMouseLeave={handleMegaMenuLeave}
      >
        {cat.subcategories && cat.subcategories.length > 0 ? (
          <MegaMenuContent cat={cat} t={t} closeMegaMenu={closeMegaMenu} />
        ) : null}
      </div>
    </div>
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
        />
      ))}
    </>
  );
}

export default MegaMenu;