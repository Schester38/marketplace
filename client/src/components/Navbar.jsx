import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { LANGS, useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';
import { api } from '../api.js';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { urlBase64ToUint8Array } from '../utils.js';
import { formatMoney } from './ProductCard.jsx';
import { countrySymbol, PRODUCT_CATEGORIES, categoryEmoji } from '../config.js';
import { useLite } from '../liteMode.js';
import SuggestionButton from './SuggestionButton.jsx';

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

function FollowUs() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const socialLinks = [
    { label: 'Facebook', icon: '📘', url: 'https://www.facebook.com/share/1dpjKVQQwn/' },
    { label: 'YouTube', icon: '▶️', url: 'https://www.youtube.com/channel/UC0afKxIhEIsvYxbvDiz74Ow' },
    { label: 'WhatsApp', icon: '💚', url: 'https://whatsapp.com/channel/0029VbDs0PKKmCPInjtQZi0u' },
    { label: 'TikTok', icon: '🎵', url: 'https://www.tiktok.com/@mboppishop' },
  ];

  return (
    <div className="follow-wrap" ref={ref}>
      <button
        className="follow-toggle"
        aria-label={t('Suivez-nous sur les réseaux sociaux')}
        title={t('Suivez-nous sur les réseaux sociaux')}
        onClick={() => setOpen(!open)}
      >
        👥 <span>{t('Suivez sur')}</span>
      </button>
      {open && (
        <ul className="follow-menu">
          {socialLinks.map((s) => (
            <li key={s.label}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="follow-item"
                onClick={() => setOpen(false)}
              >
                <span className="ss-icon">{s.icon}</span> {s.label}
              </a>
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
        return t('Nouvelle commande pour « {product} » — {buyer}.', { product: n.product_name, buyer });
      }
      if (n.seller_name) {
        return t('Nouvelle commande pour « {product} » — vendeur : {seller} ({code}).', {
          product: n.product_name,
          seller: n.seller_name,
          code: n.seller_code || '—',
        });
      }
      return t('Nouvelle commande pour « {product} » — {buyer}.', { product: n.product_name, buyer });
    }
    if (n.type === 'sale_delivered') {
      if (user.id === n.seller_id) {
        return t('Votre vente de « {product} » a été livrée à {buyer}.', { product: n.product_name, buyer });
      }
      if (user.id === n.buyer_id) {
        return t('Votre commande « {product} » a été livrée.', { product: n.product_name });
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
    if (n.type === 'payment_need_wallet') {
      return t('Vous avez une somme à recevoir (vente #{sale}) mais aucun portefeuille valide n\'est enregistré. Ajoutez un numéro sur votre page « Mes moyens de paiement ».', { sale: n.sale_id });
    }
    if (n.type === 'referral_earned') {
      return t('Votre filleul {buyer} a commandé « {product} » chez {shop} — 2% ({amount} {symbol}) à recevoir après livraison.', {
        buyer: n.buyer_name || t('un client'),
        product: n.product_name,
        shop: n.shop_name,
        amount: formatMoney(n.referral_commission),
        symbol: countrySymbol(n.shop_country),
      });
    }
    if (n.type === 'referral_claimed') {
      return t('Le parrain {parrain} réclame 2% ({amount} {symbol}) pour « {product} ».', {
        parrain: n.parrain_name || '—',
        amount: formatMoney(n.referral_commission),
        symbol: countrySymbol(n.shop_country),
        product: n.product_name,
      });
    }
    if (n.type === 'referral_paid') {
      return t('Votre commission de parrainage ({amount} {symbol}) pour « {product} » a été payée par {shop}.', {
        amount: formatMoney(n.referral_commission),
        symbol: countrySymbol(n.shop_country),
        product: n.product_name,
        shop: n.shop_name,
      });
    }
    if (n.type === 'commission_claimed_group') {
      return t('Le vendeur {seller} réclame {amount} {symbol} de commissions chez votre boutique.', {
        seller: n.seller_name || '—',
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
      });
    }
    if (n.type === 'referral_claimed_group') {
      return t('Le parrain {parrain} réclame {amount} {symbol} de commissions de parrainage.', {
        parrain: n.parrain_name || '—',
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
      });
    }
    if (n.type === 'commission_paid_group') {
      return t('Vos commissions ({amount} {symbol}) pour vos ventes chez {shop} ont été versées.', {
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
        shop: n.shop_name,
      });
    }
    if (n.type === 'referral_paid_group') {
      return t('Votre commission de parrainage ({amount} {symbol}) chez {shop} a été versée.', {
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
        shop: n.shop_name,
      });
    }
    if (n.type === 'commission_claimed') {
      return t('Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».', {
        seller: n.seller_name,
        product: n.product_name,
      });
    }
    if (n.type === 'sale_confirmed') {
      if (user.id === n.seller_id) {
        return t('Votre vente de « {product} » a été confirmée par la boutique pour {buyer}.', { product: n.product_name, buyer });
      }
      if (user.id === n.buyer_id) {
        return t('Votre commande « {product} » a été confirmée par la boutique.', { product: n.product_name });
      }
      if (user.id === n.shop_id && Number(n.referral_commission || 0) > 0) {
        return t('Commande parrainée de {buyer} pour « {product} » — 2% ({amount} {symbol}) à verser au parrain après livraison.', {
          buyer: n.buyer_name || t('un client'),
          product: n.product_name,
          amount: formatMoney(n.referral_commission),
          symbol: countrySymbol(n.shop_country),
        });
      }
      return t('Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.', {
        product: n.product_name,
        seller: n.seller_name || '—',
        code: n.seller_code || '—',
        buyer,
      });
    }
    if (n.type === 'product_deleted') {
      return t('Votre produit « {product} » a été supprimé : il ne respectait pas les CGU.', {
        product: n.product_name || t('produit'),
      });
    }
    if (n.type === 'sale_cancelled_client') {
      if (user.id === n.buyer_id) {
        return t('Votre commande « {product} » a été annulée comme demandé.', { product: n.product_name });
      }
      if (user.id === n.seller_id) {
        return t('Votre vente de « {product} » a été annulée par le client.', { product: n.product_name });
      }
      return t('Commande « {product} » de {buyer} annulée par le client.', { product: n.product_name, buyer });
    }
    if (n.type === 'sale_cancelled') {
      if (user.id === n.seller_id) {
        return t('Votre vente de « {product} » a été annulée par la boutique.', { product: n.product_name });
      }
      if (user.id === n.buyer_id) {
        return t('Votre commande « {product} » a été annulée par la boutique.', { product: n.product_name });
      }
      return t('Vente de « {product} » annulée — vendeur : {seller} ({code}), acheteur : {buyer}.', {
        product: n.product_name,
        seller: n.seller_name || '—',
        code: n.seller_code || '—',
        buyer,
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

  const linkFor = (n) => {
    if (n.type === 'product_deleted') {
      if (user.role === 'shop') return '/shop';
      return '/seller';
    }
    if (n.type === 'payment_need_wallet') {
      if (user.role === 'shop') return '/shop/paiements';
      if (user.role === 'livreur') return '/livreur/paiements';
      return '/seller/paiements';
    }
    if (user.id === n.seller_id) return '/seller';
    if (user.role === 'shop') return '/shop';
    return '/seller';
  };

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
                    <span className="notif-text">
                      {n.type === 'product_deleted' ? (
                        <>
                          {t('Votre produit « {product} » a été supprimé : il ne respectait pas les', {
                            product: n.product_name || t('produit'),
                          })}{' '}
                          <a
                            href="/cgu"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpen(false);
                              navigate('/cgu');
                            }}
                          >
                            CGU
                          </a>
                          .
                        </>
                      ) : (
                        message(n)
                      )}
                    </span>
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLang();
  const { lite, toggle: toggleLite } = useLite();
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
  const [searchQ, setSearchQ] = useState('');
  const [searchCat, setSearchCat] = useState('');
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
  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchQ.trim();
    const cat = searchCat;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat) params.set('cat', cat);
    const qs = params.toString();
    navigate(qs ? `/?${qs}` : '/');
    close();
  };
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

  const liteToggle = (
    <button
      className={`theme-toggle lite-toggle ${lite ? 'active' : ''}`}
      onClick={toggleLite}
      aria-label={t('Mode faible connexion (économie de données)')}
      title={lite ? t('Mode économie actif — cliquer pour désactiver') : t('Activer le mode faible connexion (économie de données)')}
    >
      {lite ? '🐢' : '📶'}
    </button>
  );

  const tools = (
    <div className="drawer-tools">
      <LangSwitcher />
      {themeToggle}
      {liteToggle}
      {favLink}
      {cartLink}
      {userIcon}
    </div>
  );

  const searchBox = (
    <form className="nav-search" role="search" onSubmit={submitSearch}>
      <select
        value={searchCat}
        onChange={(e) => setSearchCat(e.target.value)}
        aria-label={t('Catégorie')}
      >
        <option value="">{t('Toutes')}</option>
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>{t(c)}</option>
        ))}
      </select>
      <input
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        placeholder={t('Rechercher un produit…')}
        aria-label={t('Rechercher un produit')}
        enterKeyHint="search"
      />
      <button type="submit" className="search-btn" aria-label={t('Rechercher')}>
        🔍
      </button>
    </form>
  );

  const navLinks = (
    <>
      <FollowUs />
      <SuggestionButton onOpened={close} />
      <Link to="/" onClick={close}>{t('Produits')}</Link>
      <Link to="/createurs" onClick={close}>{t('Créateurs')}</Link>
      <Link to="/soutien" onClick={close}>{t('Je soutiens')}</Link>
      <a href="https://www.chariow.pics/U6Z28RUJ" target="_blank" rel="noopener noreferrer" onClick={close}>
        {t('Formations et Digital')}
      </a>
      <a href="https://www.youtube.com/channel/UC0afKxIhEIsvYxbvDiz74Ow" target="_blank" rel="noopener noreferrer" onClick={close}>
        {t('Formation Mboppi')}
      </a>
      {user && user.role === 'shop' && <Link to="/shop" onClick={close}>{t('Ma boutique')}</Link>}
      {user && user.role === 'seller' && <Link to="/seller" onClick={close}>{t('Mon espace vendeur')}</Link>}
      {user && user.role === 'seller' && <Link to="/seller/paiements" onClick={close}>{t('Mes moyens de paiement')}</Link>}
      {user && user.role === 'client' && <Link to="/client" onClick={close}>{t('Mon espace client')}</Link>}
      {user && user.role === 'creator' && <Link to="/creator" onClick={close}>{t('Mon espace créateur')}</Link>}
      {user && user.role === 'livreur' && <Link to="/livreur" onClick={close}>🛵 {t('Mes livraisons')}</Link>}
      {user && user.role === 'livreur' && <Link to="/livreur/paiements" onClick={close}>{t('Mes moyens de paiement')}</Link>}
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

      {searchBox}

      <nav className="desktop-nav">{links}</nav>

      <div className="navbar-right">
        {!user && (
          <Link to="/login" className="nav-user-btn" onClick={close}>{t('Connexion')}</Link>
        )}
        <NotifBell />
        <span className="nav-cart-desktop">{cartLink}</span>

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

      <nav className="cat-strip" aria-label={t('Catégories')}>
        <div className="cat-strip-track">
          {[0, 1].map((copy) => (
            <div className="cat-strip-set" key={copy} aria-hidden={copy === 1 || undefined}>
              <Link to="/" onClick={close}>{t('Tous les produits')}</Link>
              {PRODUCT_CATEGORIES.map((c) => (
                <Link key={c} to={`/?cat=${encodeURIComponent(c)}`} onClick={close}>
                  {categoryEmoji(c)} {t(c)}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>

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
