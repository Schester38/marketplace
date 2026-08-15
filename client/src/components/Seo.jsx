import { useEffect } from 'react';

const OG_DEFAULT = `${window.location.origin}/og-image.png`;

const ensureMeta = (selector, create) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
};

const setMetaContent = (selector, create, value) => {
  const el = ensureMeta(selector, create);
  if (value) el.setAttribute('content', value);
};

export default function Seo({ title, description, noindex, ogImage }) {
  useEffect(() => {
    if (title) document.title = title;
    const robots = ensureMeta('meta[name="robots"]', () => {
      const m = document.createElement('meta');
      m.name = 'robots';
      return m;
    });
    if (noindex) {
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (!noindex && robots.getAttribute('content') !== 'index, follow') {
      robots.setAttribute('content', 'index, follow');
    }
    if (description) {
      setMetaContent('meta[name="description"]', () => {
        const m = document.createElement('meta');
        m.name = 'description';
        return m;
      }, description);
    }
    const canonical = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    const ogTitle = title || document.title || 'Mboppi';
    const ogDesc = description || '';
    const img = ogImage && !String(ogImage).startsWith('data:') ? ogImage : OG_DEFAULT;

    setMetaContent('meta[property="og:title"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:title');
      return m;
    }, ogTitle);
    setMetaContent('meta[property="og:description"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:description');
      return m;
    }, ogDesc);
    setMetaContent('meta[property="og:url"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:url');
      return m;
    }, canonical);
    setMetaContent('meta[property="og:image"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('property', 'og:image');
      return m;
    }, img);
    setMetaContent('meta[name="twitter:title"]', () => {
      const m = document.createElement('meta');
      m.name = 'twitter:title';
      return m;
    }, ogTitle);
    setMetaContent('meta[name="twitter:description"]', () => {
      const m = document.createElement('meta');
      m.name = 'twitter:description';
      return m;
    }, ogDesc);
    setMetaContent('meta[name="twitter:image"]', () => {
      const m = document.createElement('meta');
      m.name = 'twitter:image';
      return m;
    }, img);
  }, [title, description, noindex, ogImage]);
  return null;
}