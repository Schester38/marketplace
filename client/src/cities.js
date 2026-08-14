export const CITIES = [
  { slug: 'douala', name: 'Douala' },
  { slug: 'yaounde', name: 'Yaoundé' },
  { slug: 'bafoussam', name: 'Bafoussam' },
  { slug: 'bamenda', name: 'Bamenda' },
  { slug: 'garoua', name: 'Garoua' },
  { slug: 'maroua', name: 'Maroua' },
  { slug: 'kribi', name: 'Kribi' },
  { slug: 'limbe', name: 'Limbé' },
  { slug: 'buea', name: 'Buéa' },
  { slug: 'nkongsamba', name: 'Nkongsamba' },
  { slug: 'edea', name: 'Edéa' },
  { slug: 'ngaoundere', name: 'Ngaoundéré' },
  { slug: 'kumba', name: 'Kumba' },
];

export function cityFromSlug(slug) {
  const found = CITIES.find((c) => c.slug === slug);
  if (found) return found.name;
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
