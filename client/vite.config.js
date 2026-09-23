import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Domaine public du site, utilisé pour index.html (canonical, og:url, og:image).
// Piloté par VITE_SITE_URL (défini sur Vercel) avec repli sur le domaine actuel :
// un build sans la variable reste strictement identique à aujourd'hui.
const FALLBACK_SITE_URL = 'https://www.mboppishop.com';
const SITE_URL = String(process.env.VITE_SITE_URL || FALLBACK_SITE_URL).replace(/\/+$/, '');

function htmlSiteUrlPlugin() {
  return {
    name: 'mboppi-html-site-url',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('__SITE_URL__', SITE_URL);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), htmlSiteUrlPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    sourcemap: true,
  },
});
