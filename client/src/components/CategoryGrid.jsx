import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import { getCategoryIcon } from './icons.jsx';

/**
 * Grille de catégories illustrées (icônes vectorielles, pas d'emoji),
 * façon page d'accueil Alibaba : 8 tuiles cliquables vers /?cat=…
 */
const TILES = [
  { label: 'Téléphones & Tablettes' },
  { label: 'Mode & Vêtements' },
  { label: 'Maison & Déco' },
  { label: 'Cuisine & Ustensiles' },
  { label: 'Sport & Fitness' },
  { label: 'Auto & Moto' },
  { label: 'Jouets & Jeux' },
  { label: 'Livres & Formation' },
];

export default function CategoryGrid() {
  const { t } = useLang();
  return (
    <section className="category-grid-section" aria-label={t('Catégories populaires')}>
      <div className="category-grid">
        {TILES.map((tile, i) => (
          <Link
            key={tile.label}
            to={`/?cat=${encodeURIComponent(tile.label)}`}
            className={`cat-tile ctone-${(i % 8) + 1}`}
            aria-label={t(tile.label)}
          >
            <span className="cat-tile-icon" aria-hidden="true">
              {getCategoryIcon(tile.label, 26)}
            </span>
            <span className="cat-tile-label">{t(tile.label)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
