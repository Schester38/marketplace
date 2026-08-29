import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { LANGS, useLang } from "../i18n.jsx";
import { useCart, useFavs } from "../store.jsx";
import { api } from "../api.js";
import { setAppBadge, playNotificationSound } from "../app-badge.js";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { urlBase64ToUint8Array } from "../utils.js";
import { formatMoney } from "./ProductCard.jsx";
import { countrySymbol, PRODUCT_CATEGORIES } from "../config.js";
import { MegaMenu } from "./MegaMenu.jsx";
import { useLite } from "../liteMode.js";
import SuggestionButton from "./SuggestionButton.jsx";
import {
  IconGrid,
  IconStore,
  IconPackage,
  IconBolt,
  IconSmartphone,
  IconShirt,
  IconSofa,
  IconBrush,
  IconDumbbell,
  IconCar,
  IconUtensils,
  IconBook,
  IconLeaf,
  IconWrench,
} from "./icons.jsx";

// Groupes de la barre de catégories statique : chaque groupe ouvre un
// méga-menu listant de vraies catégories de PRODUCT_CATEGORIES (liens /?cat=…).
const NAV_GROUPS = [
  {
    label: "Électronique",
    main: "Téléphones & Tablettes",
    Icon: IconSmartphone,
    subs: [
      "Téléphones & Tablettes",
      "Ordinateurs & Accessoires",
      "TV, Audio & Vidéo",
      "Consoles & Jeux vidéo",
    ],
  },
  {
    label: "Mode",
    main: "Mode & Vêtements",
    Icon: IconShirt,
    subs: ["Mode & Vêtements", "Chaussures", "Sacs & Accessoires", "Bijoux & Montres"],
  },
  {
    label: "Maison & Déco",
    main: "Maison & Déco",
    Icon: IconSofa,
    subs: ["Maison & Déco", "Meubles", "Cuisine & Ustensiles", "Linge de maison", "Électroménager"],
  },
  {
    label: "Beauté & Santé",
    main: "Beauté & Cosmétiques",
    Icon: IconBrush,
    subs: ["Beauté & Cosmétiques", "Parfums", "Soins capillaires", "Santé & Bien-être"],
  },
  {
    label: "Sport & Loisirs",
    main: "Sport & Fitness",
    Icon: IconDumbbell,
    subs: ["Sport & Fitness", "Jouets & Jeux", "Bébé & Enfants"],
  },
  { label: "Auto & Moto", main: "Auto & Moto", Icon: IconCar, subs: ["Auto & Moto"] },
  {
    label: "Alimentation",
    main: "Alimentation & Épicerie",
    Icon: IconUtensils,
    subs: ["Alimentation & Épicerie", "Produits frais & Marché", "Boissons"],
  },
  {
    label: "Arts & Culture",
    main: "Livres & Formation",
    Icon: IconBook,
    subs: ["Livres & Formation", "Papeterie & Bureau", "Arts & Artisanat"],
  },
  {
    label: "Jardin & Ext.",
    main: "Jardin & Extérieur",
    Icon: IconLeaf,
    subs: ["Jardin & Extérieur", "Animaux & Accessoires"],
  },
  {
    label: "Services",
    main: "Services & Prestations",
    Icon: IconWrench,
    subs: ["Services & Prestations", "Immobilier"],
  },
];

function LangSwitcher() {
  const { lang, setLang, t } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  useEffect(() => {
    if (!langOpen) return;
    const onDoc = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [langOpen]);

  return (
    <div className="lang-wrap" ref={langRef}>
      <button
        className="lang-toggle"
        aria-label={t("Changer la langue du site")}
        title={t("Changer la langue du site")}
        onClick={() => setLangOpen(!langOpen)}
      >
        <span className="lang-icon">🌐</span>
        <span className="lang-current">{lang === "ar" ? "ع" : lang === "en" ? "EN" : "FR"}</span>
        <span className="lang-arrow">▾</span>
      </button>
      {langOpen && (
        <ul className="lang-menu" role="listbox" aria-label={t("Langues disponibles")}>
          {LANGS.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang}>
              <button
                className={l.code === lang ? "selected" : ""}
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
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const socialLinks = [
    {
      label: "Facebook",
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      ),
      url: "https://www.facebook.com/share/1dpjKVQQwn/",
    },
    {
      label: "YouTube",
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.017 3.017 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12 9.545 15.568z" />
        </svg>
      ),
      url: "https://www.youtube.com/channel/UC0afKxIhEIsvYxbvDiz74Ow",
    },
    {
      label: "WhatsApp",
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.454.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.194 1.871.18.297-.008 1.757-.868 2.006-1.973.248-1.104.174-2.275-.372-3.26-.173-.32-.32-.615-.42-.814-.099-.198-.148-.372-.198-.545-.049-.174-.198-.52-.198-1.043z" />
        </svg>
      ),
      url: "https://whatsapp.com/channel/0029VbDs0PKKmCPInjtQZi0u",
    },
    {
      label: "TikTok",
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12.521 1.416c-.26-.067-.53-.098-.8-.098-3.535 0-6.41 2.875-6.41 6.41 0 .27.03.53.098.797-.343.014-.677.044-1.002.082-.298.035-.6.078-.884.126a5.798 5.798 0 0 0-1.51 1.266C.532 10.578 0 11.87 0 13.218c0 1.755 1.098 3.3 2.736 3.97a5.53 5.53 0 0 0 1.477.172c.482 0 .956-.04 1.42-.1.67-.082 1.3-.235 1.9-.44a4.137 4.137 0 0 0 .3-.282c.07.036.134.078.205.12.21.12.434.244.65.367a2.392 2.392 0 0 0 1.436.485c1.138 0 2.188-.783 2.48-1.854a1.185 1.185 0 0 0-.46-1.276c-.37-.48-.8-.855-1.3-.855-.256 0-.512.06-.76.17-.575.255-1.046.69-1.32 1.225-.24.466-.343.973-.343 1.522 0 .486.056.946.17 1.358.14.516.39 1.033.734 1.48a5.1 5.1 0 0 0 2.62 1.69c1.002.16 2.02-.104 2.876-.74.708-.52 1.22-1.256 1.48-2.126.14-.46.176-.93.176-1.442 0-3.536-2.875-6.41-6.41-6.41z" />
        </svg>
      ),
      url: "https://www.tiktok.com/@mboppishop",
    },
  ];

  return (
    <div className="follow-wrap" ref={ref}>
      <button
        className="follow-toggle"
        aria-label={t("Suivez-nous sur les réseaux sociaux")}
        title={t("Suivez-nous sur les réseaux sociaux")}
        onClick={() => setOpen(!open)}
      >
        <span className="follow-icon">👥</span>
        <span>{t("Suivez-nous")}</span>
        <span className="follow-arrow">▾</span>
      </button>
      {open && (
        <ul className="follow-menu" role="listbox" aria-label={t("Réseaux sociaux")}>
          {socialLinks.map((s) => (
            <li key={s.label} role="option">
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
  const navigate = useNavigate();
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
      // Badge de compteur sur l'icône installée (Android/desktop), iOS exclu.
      setAppBadge(d.unread_count);
      const news = d.notifications.filter((n) => !n.read && !seenRef.current.has(n.id));
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        d.notifications.forEach((n) => seenRef.current.add(n.id));
        return;
      }
      news.forEach((n) => seenRef.current.add(n.id));
      if (
        news.length &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        news.forEach((n) => {
          try {
            new Notification("Mboppi", {
              body: message(n),
              icon: "/icon-192.png",
              tag: "mboppi-" + n.id,
              renotify: true,
              sound: "/notification.wav",
            });
          } catch {
            /* silencieux */
          }
        });
        // Son réel côté client quand l'app est ouverte (la vibration + le
        // "sound" des notifications web sont ignorés sur certains appareils).
        if (document.visibilityState === "visible") playNotificationSound();
        if (navigator.vibrate) {
          try {
            navigator.vibrate([200, 100, 200]);
          } catch {
            /* silencieux */
          }
        }
      }
    } catch {
      /* silencieux */
    }
  };

  const ensurePermission = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission()
        .then(() => setupPush())
        .catch(() => {});
    } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      setupPush();
    }
  };

  const setupPush = async () => {
    if (!user || typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
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
    if (user) {
      loadNotifs();
    } else {
      setAppBadge(0);
    }
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
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;

  const markRead = async () => {
    try {
      await api.notificationsRead();
      setUnread(0);
      setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
      setAppBadge(0);
    } catch {
      /* silencieux */
    }
  };

  const removeNotif = async (n) => {
    setNotifs((ns) => ns.filter((x) => x.id !== n.id));
    try {
      await api.deleteNotification(n.id);
      setAppBadge(Math.max(0, unread - 1));
    } catch {
      loadNotifs();
    }
  };

  const message = (n) => {
    const buyer = n.buyer_name || t("le client");
    if (n.type === "sale_order") {
      if (user.id === n.seller_id) {
        return t("Nouvelle commande pour « {product} » — {buyer}.", {
          product: n.product_name,
          buyer,
        });
      }
      if (n.seller_name) {
        return t("Nouvelle commande pour « {product} » — vendeur : {seller} ({code}).", {
          product: n.product_name,
          seller: n.seller_name,
          code: n.seller_code || "—",
        });
      }
      return t("Nouvelle commande pour « {product} » — {buyer}.", {
        product: n.product_name,
        buyer,
      });
    }
    if (n.type === "sale_delivered") {
      if (user.id === n.seller_id) {
        return t("Votre vente de « {product} » a été livrée à {buyer}.", {
          product: n.product_name,
          buyer,
        });
      }
      if (user.id === n.buyer_id) {
        return t("Votre commande « {product} » a été livrée.", { product: n.product_name });
      }
      return t("Vente de « {product} » livrée — vendeur : {seller} ({code}), acheteur : {buyer}.", {
        product: n.product_name,
        seller: n.seller_name,
        code: n.seller_code || "—",
        buyer,
      });
    }
    if (n.type === "sale_paid") {
      return t("Votre commission pour « {product} » a été payée par {shop}.", {
        product: n.product_name,
        shop: n.shop_name,
      });
    }
    if (n.type === "payment_need_wallet") {
      return t(
        "Vous avez une somme à recevoir (vente #{sale}) mais aucun portefeuille valide n'est enregistré. Ajoutez un numéro sur votre page « Mes moyens de paiement ».",
        { sale: n.sale_id }
      );
    }
    if (n.type === "referral_earned") {
      return t(
        "Votre filleul {buyer} a commandé « {product} » chez {shop} — 2% ({amount} {symbol}) à recevoir après livraison.",
        {
          buyer: n.buyer_name || t("un client"),
          product: n.product_name,
          shop: n.shop_name,
          amount: formatMoney(n.referral_commission),
          symbol: countrySymbol(n.shop_country),
        }
      );
    }
    if (n.type === "referral_claimed") {
      return t("Le parrain {parrain} réclame 2% ({amount} {symbol}) pour « {product} ».", {
        parrain: n.parrain_name || "—",
        amount: formatMoney(n.referral_commission),
        symbol: countrySymbol(n.shop_country),
        product: n.product_name,
      });
    }
    if (n.type === "referral_paid") {
      return t(
        "Votre commission de parrainage ({amount} {symbol}) pour « {product} » a été payée par {shop}.",
        {
          amount: formatMoney(n.referral_commission),
          symbol: countrySymbol(n.shop_country),
          product: n.product_name,
          shop: n.shop_name,
        }
      );
    }
    if (n.type === "commission_claimed_group") {
      return t(
        "Le vendeur {seller} réclame {amount} {symbol} de commissions chez votre boutique.",
        {
          seller: n.seller_name || "—",
          amount: formatMoney(n.amount),
          symbol: countrySymbol(n.shop_country),
        }
      );
    }
    if (n.type === "referral_claimed_group") {
      return t("Le parrain {parrain} réclame {amount} {symbol} de commissions de parrainage.", {
        parrain: n.parrain_name || "—",
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
      });
    }
    if (n.type === "commission_paid_group") {
      return t("Vos commissions ({amount} {symbol}) pour vos ventes chez {shop} ont été versées.", {
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
        shop: n.shop_name,
      });
    }
    if (n.type === "referral_paid_group") {
      return t("Votre commission de parrainage ({amount} {symbol}) chez {shop} a été versée.", {
        amount: formatMoney(n.amount),
        symbol: countrySymbol(n.shop_country),
        shop: n.shop_name,
      });
    }
    if (n.type === "commission_claimed") {
      return t("Le vendeur {seller} réclame le paiement de sa commission pour « {product} ».", {
        seller: n.seller_name,
        product: n.product_name,
      });
    }
    if (n.type === "sale_confirmed") {
      if (user.id === n.seller_id) {
        return t("Votre vente de « {product} » a été confirmée par la boutique pour {buyer}.", {
          product: n.product_name,
          buyer,
        });
      }
      if (user.id === n.buyer_id) {
        return t("Votre commande « {product} » a été confirmée par la boutique.", {
          product: n.product_name,
        });
      }
      if (user.id === n.shop_id && Number(n.referral_commission || 0) > 0) {
        return t(
          "Commande parrainée de {buyer} pour « {product} » — 2% ({amount} {symbol}) à verser au parrain après livraison.",
          {
            buyer: n.buyer_name || t("un client"),
            product: n.product_name,
            amount: formatMoney(n.referral_commission),
            symbol: countrySymbol(n.shop_country),
          }
        );
      }
      return t(
        "Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.",
        {
          product: n.product_name,
          seller: n.seller_name || "—",
          code: n.seller_code || "—",
          buyer,
        }
      );
    }
    if (n.type === "product_deleted") {
      return t("Votre produit « {product} » a été supprimé : il ne respectait pas les CGU.", {
        product: n.product_name || t("produit"),
      });
    }
    if (n.type === "sale_cancelled_client") {
      if (user.id === n.buyer_id) {
        return t("Votre commande « {product} » a été annulée comme demandé.", {
          product: n.product_name,
        });
      }
      if (user.id === n.seller_id) {
        return t("Votre vente de « {product} » a été annulée par le client.", {
          product: n.product_name,
        });
      }
      return t("Commande « {product} » de {buyer} annulée par le client.", {
        product: n.product_name,
        buyer,
      });
    }
    if (n.type === "sale_cancelled") {
      if (user.id === n.seller_id) {
        return t("Votre vente de « {product} » a été annulée par la boutique.", {
          product: n.product_name,
        });
      }
      if (user.id === n.buyer_id) {
        return t("Votre commande « {product} » a été annulée par la boutique.", {
          product: n.product_name,
        });
      }
      return t(
        "Vente de « {product} » annulée — vendeur : {seller} ({code}), acheteur : {buyer}.",
        {
          product: n.product_name,
          seller: n.seller_name || "—",
          code: n.seller_code || "—",
          buyer,
        }
      );
    }
    if (user.id === n.seller_id) {
      return t("Votre vente de « {product} » a été achetée par {buyer}.", {
        product: n.product_name,
        buyer,
      });
    }
    return t(
      "Vente de « {product} » confirmée — vendeur : {seller} ({code}), acheteur : {buyer}.",
      {
        product: n.product_name,
        seller: n.seller_name,
        code: n.seller_code || "—",
        buyer,
      }
    );
  };

  const linkFor = (n) => {
    if (n.type === "product_deleted") {
      if (user.role === "shop") return "/shop";
      return "/seller";
    }
    if (n.type === "payment_need_wallet") {
      if (user.role === "shop") return "/shop/paiements";
      if (user.role === "livreur") return "/livreur/paiements";
      return "/seller/paiements";
    }
    if (user.id === n.seller_id) return "/seller";
    if (user.role === "shop") return "/shop";
    return "/seller";
  };

  return (
    <div className="notif-wrap" ref={boxRef}>
      <button
        className="notif-bell"
        aria-label={t("Notifications")}
        title={t("Notifications")}
        onClick={() => {
          setOpen(!open);
          if (!open && unread > 0) markRead();
          ensurePermission();
        }}
      >
        <span className="bell-icon">🔔</span>
        {unread > 0 && <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label={t("Notifications")}>
          <div className="notif-header">
            <strong>{t("Notifications")}</strong>
            {notifs.length > 0 && (
              <button className="btn btn-small" onClick={markRead}>
                {t("Tout marquer comme lu")}
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="empty" style={{ padding: 16 }}>
              {t("Aucune notification")}
            </p>
          ) : (
            <ul className="notif-list" role="list">
              {notifs.map((n) => (
                <li key={n.id} className={`notif-item ${n.read ? "" : "unread"}`}>
                  <Link to={linkFor(n)} onClick={() => setOpen(false)}>
                    <span className="notif-text">
                      {n.type === "product_deleted" ? (
                        <>
                          {t(
                            "Votre produit « {product} » a été supprimé : il ne respectait pas les",
                            {
                              product: n.product_name || t("produit"),
                            }
                          )}{" "}
                          <a
                            href="/cgu"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpen(false);
                              navigate("/cgu");
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
                      {new Date(n.created_at).toLocaleString(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </Link>
                  {n.read && (
                    <button
                      className="notif-del"
                      aria-label={t("Supprimer la notification")}
                      title={t("Supprimer la notification")}
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

  // Catégorie active (URL /?cat=…) pour surligner la barre
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeCat = searchParams.get("cat") || "";
  const onAllCategories = location.pathname === "/" && !activeCat;

  const { user } = useAuth();
  const { t } = useLang();
  const { lite, toggle: toggleLite } = useLite();
  const { cartCount } = useCart();
  const { favs } = useFavs();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
  );
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showGenericHint, setShowGenericHint] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchCat, setSearchCat] = useState("");
  const [standalone] = useState(() => {
    try {
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
      );
    } catch {
      return false;
    }
  });
  const [megaMenuOpen, setMegaMenuOpen] = useState(null);
  const megaMenuRef = useRef(null);
  const catLinksRef = useRef(null);

  // Drawer ouvert : fige le déroulé de la page derrière l'overlay
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : previous === "hidden" ? "" : previous;
    return () => {
      document.body.style.overflow = previous === "hidden" ? "" : previous;
    };
  }, [open]);

  // Échap ferme le drawer
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Barre de catégories : amène la catégorie active dans le champ de vision
  useEffect(() => {
    if (!activeCat) return;
    let el = null;
    try {
      el = document.querySelector(`.cat-links [data-cat="${CSS.escape(activeCat)}"]`);
    } catch {
      el = null;
    }
    if (el && typeof el.scrollIntoView === "function") {
      const t = setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        } catch {
          /* anciens navigateurs */
        }
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [activeCat]);

  // Barre de catégories : la molette de la souris fait défiler la liste
  // horizontalement (desktop — le tactile garde son swipe natif)
  useEffect(() => {
    const el = catLinksRef.current;
    if (!el || typeof el.addEventListener !== "function") return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey) return; // pinch-zoom : ne pas intercepter
      if (el.scrollWidth <= el.clientWidth) return; // rien à faire défiler
      const factor = e.deltaMode === 1 ? 16 : 1; // lignes → pixels
      const dy = e.deltaY * factor;
      const dx = e.deltaX * factor;
      const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (!delta) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canInstall = !standalone;

  const close = () => setOpen(false);
  const submitSearch = (e) => {
    e.preventDefault();
    const q = searchQ.trim();
    const cat = searchCat;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    const qs = params.toString();
    navigate(qs ? `/?${qs}` : "/");
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
    ? user.role === "shop"
      ? t("boutique")
      : user.role === "seller"
        ? t("vendeur")
        : user.role === "client"
          ? t("client")
          : user.role === "creator"
            ? t("créateur")
            : user.role === "admin"
              ? t("admin")
              : t("livreur")
    : "";

  const themeToggle = (
    <button
      className="theme-toggle"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={t("Basculer le mode sombre ou clair")}
      title={theme === "dark" ? t("Passer en mode clair") : t("Passer en mode sombre")}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );

  const favLink = (
    <Link
      to="/favoris"
      className="nav-icon-link"
      onClick={close}
      aria-label={t("Mes favoris")}
      title={t("Mes favoris")}
    >
      <svg
        className="nav-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
      {favs.length > 0 && (
        <span className="nav-badge bump" key={`f${favs.length}`}>
          {favs.length}
        </span>
      )}
    </Link>
  );

  const cartLink = (
    <Link
      to="/panier"
      className="nav-icon-link"
      onClick={close}
      aria-label={t("Mon panier")}
      title={t("Mon panier")}
    >
      <svg
        className="nav-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      {cartCount > 0 && (
        <span className="nav-badge bump" key={`c${cartCount}`}>
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      )}
    </Link>
  );

  const accountLink = (
    <Link
      to={user ? "/compte" : "/login"}
      className="nav-icon-link"
      onClick={close}
      aria-label={user ? t("Mon compte") : t("Connexion")}
      title={user ? t("Mon compte") : t("Connexion")}
    >
      <svg
        className="nav-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    </Link>
  );

  const liteToggle = (
    <button
      className={`theme-toggle lite-toggle ${lite ? "active" : ""}`}
      onClick={toggleLite}
      aria-label={t("Mode faible connexion (économie de données)")}
      title={
        lite
          ? t("Mode économie actif — cliquer pour désactiver")
          : t("Activer le mode faible connexion (économie de données)")
      }
    >
      {lite ? "🐢" : "📶"}
    </button>
  );

  const tools = (
    <div className="drawer-tools">
      <div className="drawer-row">
        <LangSwitcher />
        {themeToggle}
        {liteToggle}
        {user && <NotifBell />}
      </div>
      <FollowUs />
      <SuggestionButton onOpened={close} />
    </div>
  );

  const searchBox = (
    <form className="nav-search" role="search" onSubmit={submitSearch}>
      <select
        value={searchCat}
        onChange={(e) => setSearchCat(e.target.value)}
        aria-label={t("Catégorie")}
      >
        <option value="">{t("Toutes")}</option>
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(c)}
          </option>
        ))}
      </select>
      <input
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        placeholder={t("Rechercher un produit…")}
        aria-label={t("Rechercher un produit")}
        enterKeyHint="search"
      />
      <button type="submit" className="search-btn" aria-label={t("Rechercher")}>
        <svg
          className="nav-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </button>
    </form>
  );

  const megaMenuItems = NAV_GROUPS.map((g) => ({
    label: t(g.label),
    main: g.main,
    icon: <g.Icon size={15} />,
    subcategories: g.subs,
  }));

  const navLinks = (
    <>
      <Link to="/" onClick={close}>
        {t("Produits")}
      </Link>
      <Link to="/createurs" onClick={close}>
        {t("Créateurs")}
      </Link>
      <Link to="/soutien" onClick={close}>
        {t("Je soutiens")}
      </Link>
      <a
        href="https://www.chariow.pics/U6Z28RUJ"
        target="_blank"
        rel="noopener noreferrer"
        onClick={close}
      >
        {t("Formations et Digital")}
      </a>
      <a
        href="https://www.youtube.com/channel/UC0afKxIhEIsvYxbvDiz74Ow"
        target="_blank"
        rel="noopener noreferrer"
        onClick={close}
      >
        {t("Formation Mboppi")}
      </a>
      {user && user.role === "shop" && (
        <Link to="/shop" onClick={close}>
          {t("Ma boutique")}
        </Link>
      )}
      {user && user.role === "seller" && (
        <Link to="/seller" onClick={close}>
          {t("Mon espace vendeur")}
        </Link>
      )}
      {user && user.role === "seller" && (
        <Link to="/seller/paiements" onClick={close}>
          {t("Mes moyens de paiement")}
        </Link>
      )}
      {user && user.role === "client" && (
        <Link to="/client" onClick={close}>
          {t("Mon espace client")}
        </Link>
      )}
      {user && user.role === "creator" && (
        <Link to="/creator" onClick={close}>
          {t("Mon espace créateur")}
        </Link>
      )}
      {user && user.role === "livreur" && (
        <Link to="/livreur" onClick={close}>
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            <path d="M2 12h20"></path>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>{" "}
          {t("Mes livraisons")}
        </Link>
      )}
      {user && user.role === "livreur" && (
        <Link to="/livreur/paiements" onClick={close}>
          {t("Mes moyens de paiement")}
        </Link>
      )}
      {user && user.role === "admin" && (
        <Link to="/admin" onClick={close}>
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="9" x2="12" y2="15"></line>
            <line x1="9" y1="12" x2="15" y2="12"></line>
          </svg>{" "}
          {t("Administration")}
        </Link>
      )}
      {user && (
        <>
          <Link to="/compte" onClick={close}>
            {t("Mon compte")}
          </Link>
          <span className="user-chip">
            {user.name} ({roleLabel})
            {user.verified && (
              <span
                className="badge badge-verified"
                title={t("Compte vérifié")}
                style={{ marginLeft: 6 }}
              >
                ✓
              </span>
            )}
          </span>
        </>
      )}
      {!user && (
        <Link to="/login" onClick={close} className="drawer-login-btn">
          {t("Connexion")}
        </Link>
      )}
    </>
  );

  const handleMegaMenuEnter = (catId) => setMegaMenuOpen(catId);
  const handleMegaMenuLeave = () => setMegaMenuOpen(null);

  const closeMegaMenu = () => setMegaMenuOpen(null);

  return (
    <header className="navbar" role="banner">
      {/* Top bar - Line 1 */}
      <div className="navbar-top">
        <Link to="/" className="brand" onClick={close} aria-label="Mboppi - Accueil">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
        </Link>

        <div className="nav-search-wrapper">{searchBox}</div>

        <div className="navbar-top-right">
          {favLink}
          {cartLink}
          {accountLink}
          <button
            className="hamburger"
            aria-label={t("Ouvrir le menu")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
      </div>

      {/* Category bar - Line 2 : barre statique cliquable + méga-menu + liens rapides */}
      <nav className="cat-bar" aria-label={t("Catégories")} role="navigation">
        <div className="cat-bar-inner">
          <div className="cat-links" ref={catLinksRef} aria-label={t("Parcourir les catégories")}>
            <Link
              to="/"
              onClick={close}
              className={`cat-link cat-link-all${onAllCategories ? " cat-active" : ""}`}
              role="tab"
              aria-selected={false}
            >
              <span className="cat-icon" aria-hidden="true">
                <IconGrid size={14} />
              </span>
              <span className="cat-label">{t("Tous")}</span>
            </Link>
            <MegaMenu
              megaMenuItems={megaMenuItems}
              megaMenuOpen={megaMenuOpen}
              handleMegaMenuEnter={handleMegaMenuEnter}
              handleMegaMenuLeave={handleMegaMenuLeave}
              close={close}
              closeMegaMenu={closeMegaMenu}
              t={t}
              activeCat={activeCat}
            />
          </div>
          <div className="cat-quick" aria-label={t("Liens rapides")}>
            <Link to="/register" onClick={close} className="quick-link quick-accent">
              <IconStore size={14} />
              <span>{t("Vendre sur Mboppi")}</span>
            </Link>
            <Link to={user ? "/compte" : "/login"} onClick={close} className="quick-link">
              <IconPackage size={14} />
              <span>{t("Suivi de commande")}</span>
            </Link>
            <Link to="/?rail=promos" onClick={close} className="quick-link quick-flash">
              <IconBolt size={14} />
              <span>{t("Promotions")}</span>
            </Link>
          </div>
        </div>
      </nav>

      {createPortal(
        <>
          {open && <div className="drawer-overlay" onClick={close} aria-hidden="true"></div>}
          <aside
            className={`drawer ${open ? "open" : ""}`}
            aria-hidden={!open}
            role="dialog"
            aria-modal="true"
            aria-label={t("Menu principal")}
          >
            <button
              type="button"
              className="drawer-float-close"
              aria-label={t("Fermer le menu")}
              onClick={close}
            >
              ✕
            </button>
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
                <button className="btn btn-outline drawer-auth-btn" onClick={logout}>
                  🚪 {t("Déconnexion")}
                </button>
              )}
            </div>
          </aside>
        </>,
        document.body
      )}
    </header>
  );
}
