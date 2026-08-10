import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App, { AuthProvider } from './App.jsx';
import './styles.css';

const pathname = window.location.pathname;

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
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW error:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
