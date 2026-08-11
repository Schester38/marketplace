import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { LANGS, useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';
import { api } from '../api.js';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { urlBase64ToUint8Array } from '../utils.js';

function LangSwitcher() {
  const { lang, setLang, t } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  useEffect(() => {
    if (!langOpen) return;
    const onDoc = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langOpen]);

  return (
    <div className="lang-wrap" ref={langRef}>
      <button
        className="lang-toggle"
        aria-label={t('Changer la langue du site')}
        title={t('Changer la langue du site')}
        onClick={() => setLangOpen(!langOpen)}
      >
        🌐 <span className="lang-current">{lang === 'ar' ? 'ع' : lang === 'en' ? 'EN' : 'FR'}</span>
      </button>
      {langOpen && (
        <ul className="lang-menu">
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                className={l.code === lang ? 'selected' : ''}
                onClick={() => {
                  setLang(l.code);
                  setLangOpen(false);
                }}
              >
                <span className="ss-flag">{l.flag}</span> {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotifBell() {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef(null);
  const seenRef = useRef(new Set());
  const firstLoadRef = useRef(true);

  const loadNotifs = async () => {
    if (!user) return;
    try {
      const d = await api.notifications();
      setNotifs(d.notifications);
      setUnread(d.unread_count);
      const news = d.notifications.filter((n) => !n.read && !seenRef.current.has(n.id));
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        d.notifications.forEach((n) => seenRef.current.add(n.id));
        return;
      }
      news.forEach((n) => seenRef.current.add(n.id));
      if (news.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        news.forEach((n) => {
          try {
            new Notification('Mboppi', {
              body: message(n),
              icon: '/icon-192.png',
              tag: 'mboppi-' + n.id,
              renotify: true,
            });
          } catch {
            /* silencieux */
          }
        });
        if (navigator.vibrate) {
          try { navigator.vibrate([200, 100, 200]); } catch { /* silencieux */ }
        }
      }
    } catch {
      /* silencieux */
    }
  };

  const ensurePermission = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(() => setupPush()).catch(() => {});
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setupPush();
    }
  };

  const setupPush = async () => {
    if (!user || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    try {
      const { public_key } = await api.pushKey();
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      await api.pushSubscribe(sub.toJSON());
    } catch {
      /* silencieux */
    }
  };

  useEffect(() => {
    if (user) loadNotifs();
    const iv = setInterval(loadNotifs, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useRefreshOnFocus(loadNotifs);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  const markRead = async () => {
    try {
      await api.notificationsRead();
      setUnread(0);
      setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
    } catch {
      /* silencieux */
    }
  };

  const removeNotif = async (n) => {
    setNotifs((ns) => ns.filter((x) => x.id !== n.id));
    try {
      await api.deleteNotification(n.id);
    } catch {
      loadNotifs();
    }
  };

  const message = (n) => {
    const buyer = n.buyer_name || t('le client');
    if (n.type === 'sale_order') {
      if (user.id === n.seller_id) {
        return t('Nouvelle commande pour « {product} » — {buyer}. Article en attente de vente.', { product: n.product_name, buyer });
      }
      return t('Nouvelle commande pour « {product} » — vendeur : {seller} ({code}). Article en attente de vente.', {
        product: n.product_name,
        seller: n.seller_name,
        code: n.seller_code || '—',
      });
    }
    if (n.type === 'sale_delivered') {
      if (user.id === n.seller_id) {
        return t('Votre vente de « {product} » a été livrée à {buyer}.', { product: n.product_name, buyer });
      }
      return t('Vente de « {product} » livrée — vendeur : {seller} ({code}), acheteur : {buyer}.', {
        product: n.product_name,
        seller: n.seller_name,
        code: n.seller_code || '—',
        buyer,
      });
    }
    if (n.type === 'sale_paid') {
      return t('Votre commission pour « {product} » a été payée par {shop}.', { product: n.product_name, shop: n.shop_name });
    }
    if (n.type === 'commission_claimed') {
      return t('Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».', {
        seller: n.seller_name,
        product: n.product_name,
      });
    }
    if (user.id === n.seller_id) {
      return t('Votre vente de « {product} » a été achetée par {buyer}.', { product: n.product_name, buyer });
    }
    return t('Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.', {
      product: n.product_name,
      seller: n.seller_name,
      code: n.seller_code || '—',
      buyer,
    });
  };

  const linkFor = (n) => (user.id === n.seller_id ? '/seller' : '/shop');

  return (
    <div className="notif-wrap" ref={boxRef}>
      <button
        className="notif-bell"
        aria-label={t('Notifications')}
        title={t('Notifications')}
        onClick={() => {
          setOpen(!open);
          if (!open && unread > 0) markRead();
          ensurePermission();
        }}
      >
        🔔
        {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <strong>{t('Notifications')}</strong>
            {notifs.length > 0 && (
              <button className="btn btn-small" onClick={markRead}>{t('Tout marquer comme lu')}</button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="empty" style={{ padding: 16 }}>{t('Aucune notification')}</p>
          ) : (
            <ul className="notif-list">
              {notifs.map((n) => (
                <li key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}>
                  <Link to={linkFor(n)} onClick={() => setOpen(false)}>
                    <span className="notif-text">{message(n)}</span>
                    <span className="notif-date">
                      {new Date(n.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </Link>
                  {n.read && (
                    <button
                      className="notif-del"
                      aria-label={t('Supprimer la notification')}
                      title={t('Supprimer la notification')}
                      onClick={() => removeNotif(n)}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ onLogout }) {
  const { user } = useAuth();
  const { t } = useLang();
  const { cartCount } = useCart();
  const { favs } = useFavs();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showGenericHint, setShowGenericHint] = useState(false);
  const [standalone] = useState(() => {
    try {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canInstall = !standalone;

  const close = () => setOpen(false);
  const logout = async () => {
    close();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    } catch {
      /* silencieux */
    }
    onLogout();
  };
  const roleLabel = user
    ? user.role === 'shop' ? t('boutique') : user.role === 'seller' ? t('vendeur') : user.role === 'client' ? t('client') : user.role === 'creator' ? t('créateur') : user.role === 'admin' ? t('admin') : t('livreur')
    : '';

  const themeToggle = (
    <button
      className="theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={t('Basculer le mode sombre ou clair')}
      title={theme === 'dark' ? t('Passer en mode clair') : t('Passer en mode sombre')}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );

  const favLink = (
    <Link to="/favoris" className="nav-icon-link" onClick={close} aria-label={t('Mes favoris')} title={t('Mes favoris')}>
      ❤️{favs.length > 0 && <span className="nav-badge">{favs.length}</span>}
    </Link>
  );

  const cartLink = (
    <Link to="/panier" className="nav-icon-link" onClick={close} aria-label={t('Mon panier')} title={t('Mon panier')}>
      🛒{cartCount > 0 && <span className="nav-badge">{cartCount}</span>}
    </Link>
  );

  const userIcon = user ? null : (
    <Link
      to="/login"
      className="nav-icon-link"
      onClick={close}
      aria-label={t('Connexion')}
      title={t('Connexion')}
    >
      👤
    </Link>
  );

  const tools = (
    <div className="drawer-tools">
      <LangSwitcher />
      {themeToggle}
      {favLink}
      {cartLink}
      {userIcon}
    </div>
  );

  const navLinks = (
    <>
      <Link to="/" onClick={close}>{t('Produits')}</Link>
      {user && user.role === 'shop' && <Link to="/shop" onClick={close}>{t('Ma boutique')}</Link>}
      {user && user.role === 'seller' && <Link to="/seller" onClick={close}>{t('Mon espace vendeur')}</Link>}
      {user && user.role === 'seller' && <Link to="/seller/paiements" onClick={close}>{t('Mes moyens de paiement')}</Link>}
      {user && user.role === 'client' && <Link to="/client" onClick={close}>{t('Mon espace client')}</Link>}
      {user && user.role === 'creator' && <Link to="/creator" onClick={close}>{t('Mon espace créateur')}</Link>}
      {user && user.role === 'livreur' && <Link to="/livreur" onClick={close}>🛵 {t('Mes livraisons')}</Link>}
      {user && user.role === 'admin' && <Link to="/admin" onClick={close}>🛡️ {t('Administration')}</Link>}
      {user && (
        <>
          <Link to="/compte" onClick={close}>{t('Mon compte')}</Link>
          <span className="user-chip">
            {user.name} ({roleLabel})
          </span>
        </>
      )}
      {!user && <Link to="/login" onClick={close}>{t('Connexion')}</Link>}
    </>
  );

  const links = (
    <>
      {tools}
      {navLinks}
    </>
  );

  return (
    <header className="navbar">
      <Link to="/" className="brand" onClick={close}>
        <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
        <span>Mboppi</span>
      </Link>

      <nav className="desktop-nav">{links}</nav>

      <div className="navbar-right">
        {!user && (
          <Link to="/login" className="nav-user-btn" onClick={close}>{t('Connexion')}</Link>
        )}
        <NotifBell />

        <button
          className="hamburger"
          aria-label={t('Ouvrir le menu')}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
      </div>

      {open && <div className="drawer-overlay" onClick={close}></div>}
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-header">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
          <button className="drawer-close" aria-label={t('Fermer le menu')} onClick={close}>✕</button>
        </div>
        {tools}
        <nav className="drawer-nav">{navLinks}</nav>
        {canInstall && (
          <div className="drawer-footer">
            <button
              className="btn btn-primary drawer-install"
              onClick={() => {
                if (deferredPrompt) {
                  deferredPrompt.prompt();
                  deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
                } else if (isIOS) {
                  setShowIosHint(!showIosHint);
                } else {
                  setShowGenericHint(!showGenericHint);
                }
              }}
            >
              📲 {t("Installer l'application")}
            </button>
            {showIosHint && (
              <p className="install-ios-hint">
                {t(
                  "Pour installer Mboppi : ouvrez le menu Partager de votre navigateur (Safari) puis choisissez « Sur l'écran d'accueil »."
                )}
              </p>
            )}
            {showGenericHint && (
              <p className="install-ios-hint">
                {t(
                  "Pour installer Mboppi : ouvrez le menu de votre navigateur (⋮ ou ⋯) puis choisissez « Ajouter à l'écran d'accueil » ou « Installer l'application »."
                )}
              </p>
            )}
          </div>
        )}
        <div className="drawer-account">
          {user && (
            <button className="btn btn-outline drawer-auth-btn" onClick={logout}>🚪 {t('Déconnexion')}</button>
          )}
        </div>
      </aside>
    </header>
  );
}
