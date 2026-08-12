import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App, { AuthProvider } from './App.jsx';
import { LangProvider } from './i18n.jsx';
import { StoreProvider } from './store.jsx';
import './styles.css';

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

const pathname = window.location.pathname;

try {
  const t = localStorage.getItem('theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch {
  /* stockage indisponible */
}

if (pathname.startsWith('/verone')) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = '/manifest-verone.webmanifest';
  document.title = 'Verone';
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = '#4f46e5';
} else if (pathname.startsWith('/livreur')) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = '/manifest-livreur.webmanifest';
  document.title = 'Mboppi Livreur';
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = '#4f46e5';
} else if (pathname.startsWith('/admin')) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = '/manifest-admin.webmanifest';
  document.title = 'Mboppi Admin';
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = '#4f46e5';
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW error:', err));
  });
}

const Root = () => (
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <LangProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LangProvider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);