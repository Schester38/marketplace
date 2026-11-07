import { storage, sessionStore } from "../storage";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import ProductCard, { formatMoney } from "../components/ProductCard.jsx";
import { countrySymbol, BASE_URL, whatsappLink, categoryEmoji, waLink } from "../config.js";
import { PriceEquivalent } from "../money.jsx";
import { useAuth } from "../App.jsx";
import { useCart, useFavs } from "../store.jsx";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { nativeShareWithImage, firstProductImage, proxyPhotoUrl } from "../share.js";
import Reviews from "../components/Reviews.jsx";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";
import PaymentMethodsStrip from "../components/PaymentMethodsStrip.jsx";
import Logo from "../components/Logo.jsx";
import ReviewQuote from "../components/ReviewQuote.jsx";
import { useLite, isLite } from "../liteMode.js";
import {
  IconTruck,
  IconBanknote,
  IconShieldCheck,
  IconPackage,
  IconLayers,
  IconClock,
  IconLock,
  IconPhone,
} from "../components/icons.jsx";

/** URL absolue pour les métadonnées sociales et le partage d'une image produit. */
function absoluteProductImage(image) {
  if (!image || typeof image !== "string" || image.startsWith("data:")) return null;
  try {
    return new URL(image, `${BASE_URL}/`).toString();
  } catch {
    return null;
  }
}

/** Compte à rebours des offres éclair (mise à jour chaque seconde). */
function FlashCountdown({ endsAt }) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = new Date(endsAt).getTime();
  if (!end || Number.isNaN(end)) return null;
  const left = Math.max(0, end - now);
  if (left <= 0) {
    return <p className="pd-countdown pd-countdown-ended">⏱ {t("Cette offre est terminée")}</p>;
  }
  const totalSec = Math.floor(left / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const units = [
    ...(days > 0 ? [{ value: pad(days), unit: t("j") }] : []),
    { value: pad(hours), unit: t("h") },
    { value: pad(minutes), unit: t("min") },
    { value: pad(seconds), unit: t("s") },
  ];
  return (
    <div className="pd-countdown" role="timer" aria-label={t("L'offre se termine dans")}>
      <span className="pd-countdown-label">
        <IconClock size={15} /> {t("L'offre se termine dans")}
      </span>
      <span className="pd-countdown-units">
        {units.map((u, i) => (
          <span className="pd-countdown-box" key={`${u.unit}-${i}`}>
            <strong>{u.value}</strong>
            <small>{u.unit}</small>
          </span>
        ))}
      </span>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sellerCode = params.get("code");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLang();
  const { lite } = useLite();
  const { addToCart } = useCart();
  const { isFav, toggleFav } = useFavs();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [photoShown, setPhotoShown] = useState(() => !isLite());

  useEffect(() => {
    if (lite) setPhotoShown(false);
  }, [lite]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);
  const [related, setRelated] = useState([]);
  const [viewsCount, setViewsCount] = useState(0);
  const [showStickyBuy, setShowStickyBuy] = useState(false);
  const [bundle, setBundle] = useState([]);
  const [bundlePicked, setBundlePicked] = useState([]);
  const [bundleAdded, setBundleAdded] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [alertState, setAlertState] = useState("idle");
  const [alertError, setAlertError] = useState("");
  const offerCardRef = useRef(null);
  // Achat en ligne d'un produit digital (iKeePay) : tunnel de paiement →
  // attente de confirmation webhook → téléchargement UNIQUE → félicitations →
  // retour automatique à la vitrine (fermeture de la modale).
  const [dBuy, setDBuy] = useState(null);
  const dBuyRef = useRef(null);
  const dPollRef = useRef(null);
  const [directBusy, setDirectBusy] = useState(false);
  const [directVideoSrc, setDirectVideoSrc] = useState(null);

  // Une navigation SPA conserve parfois le scroll de la page catalogue.
  // On remet la fiche produit en haut AVANT le premier rendu visible, sinon
  // le navigateur affiche la partie basse de la nouvelle page puis exige un
  // scroll manuel pour revenir au titre et à la photo du produit.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    setProduct(null);
    setError("");
    setRelated([]);
    setBundle([]);
    setBundlePicked([]);
    setAlertState("idle");
    setAlertError("");
    setLightboxIndex(0);
    api
      .getProduct(id)
      .then((d) => {
        setProduct(d.product);
        setQty(1);
        try {
          const p = d.product;
          const prev = JSON.parse(storage.getItem("mboppi_recent") || "[]");
          const entry = {
            id: p.id,
            name: p.name,
            price: p.price,
            currency: p.currency,
            old_price: p.old_price,
            photos: p.photos,
            image: proxyPhotoUrl(p.image),
            shop_name: p.shop_name,
            shop_role: p.shop_role,
            shop_id: p.shop_id,
            shop_verified: p.shop_verified,
            shop_country: p.shop_country,
            rating_avg: p.rating_avg,
            review_count: p.review_count,
            quantity: p.quantity,
            category: p.category,
            is_digital: p.is_digital === true,
          };
          const updated = [
            entry,
            ...(Array.isArray(prev) ? prev : []).filter((x) => Number(x.id) !== Number(p.id)),
          ].slice(0, 12);
          storage.setItem("mboppi_recent", JSON.stringify(updated));
        } catch {}
        const key = "mboppi_view_product_" + id;
        try {
          if (sessionStore.getItem(key)) return;
          sessionStore.setItem(key, "1");
        } catch {}
        api.trackViews([{ type: "product", id: Number(id) }]).catch(() => {});
        api
          .trackFunnel("product_view", { product_id: Number(id), path: `/produit/${id}` })
          .catch(() => {});
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const refetchProduct = useCallback(() => {
    api
      .getProduct(id)
      .then((d) => setProduct(d.product))
      .catch(() => {});
  }, [id]);

  useRefreshOnFocus(refetchProduct);

  const productId = product && product.id;
  const productCategory = product && product.category;
  const productShopId = product && product.shop_id;
  const productIsDigital = product ? product.is_digital === true : false;
  const flashPromoEndsAt = product && product.flash_promo && product.flash_promo.ends_at;

  // Preuve sociale : vues de la fiche sur les 7 derniers jours.
  useEffect(() => {
    let mounted = true;
    setViewsCount(0);
    api
      .productViews(id)
      .then((d) => {
        if (mounted) setViewsCount(Math.max(0, Number(d.views) || 0));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [id]);

  // Pré-remplit l'alerte de retour en stock avec l'e-mail du compte connecté.
  useEffect(() => {
    if (user?.email) setAlertEmail((current) => current || user.email);
  }, [user]);

  // Barre d'achat de secours sur desktop : elle apparaît quand la buybox
  // principale est passée au-dessus de l'écran (sur mobile elle est déjà fixe).
  useEffect(() => {
    setShowStickyBuy(false);
    const el = offerCardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      setShowStickyBuy(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [productId]);

  useEffect(() => {
    if (!product || !productCategory) return;
    let mounted = true;
    api
      .listProducts({ category: productCategory })
      .then((d) => {
        if (!mounted) return;
        setRelated(d.products.filter((p) => Number(p.id) !== Number(productId)).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [productId, productCategory, product]);

  // « Souvent achetés ensemble » : les autres produits disponibles de la même
  // boutique (jamais une autre famille digital/physique).
  useEffect(() => {
    setBundle([]);
    setBundlePicked([]);
    if (!productShopId) return;
    let mounted = true;
    api
      .listProducts({
        shop: productShopId,
        type: productIsDigital ? "digital" : "physical",
        limit: 8,
      })
      .then((d) => {
        if (!mounted) return;
        const items = (Array.isArray(d.products) ? d.products : [])
          .filter((p) => Number(p.id) !== Number(productId))
          .slice(0, 3);
        setBundle(items);
        setBundlePicked(items.map((p) => Number(p.id)));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [productId, productShopId, productIsDigital]);

  // Données structurées schema.org (Rich Results Google : produit, fil
  // d'Ariane et FAQ — cette dernière reprend exactement les questions visibles).
  useEffect(() => {
    if (!product) return;
    const inStock = product.is_digital ? true : Number(product.quantity || 0) > 0;
    const fp = product.flash_promo || null;
    const fPrice = fp ? Number(fp.price) : Number(product.price);
    const pdUrl = `${BASE_URL}/produit/${product.id}`;

    const productSchema = {
      "@type": "Product",
      name: product.name,
      image: absoluteProductImage(firstProductImage(product)),
      description: product.description || product.name,
      sku: String(product.id),
      category: product.category || undefined,
      brand: { "@type": "Brand", name: product.shop_name },
      url: pdUrl,
      offers: {
        "@type": "Offer",
        url: pdUrl,
        price: Number(fPrice).toFixed(2),
        priceCurrency: (product.currency || "XAF").toUpperCase(),
        availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        priceValidUntil: fp
          ? String(fp.ends_at).slice(0, 10)
          : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ...(Number(product.review_count) > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: String(Number(product.rating_avg || 0).toFixed(1)),
              reviewCount: String(product.review_count),
            },
          }
        : {}),
    };

    const crumbs = [
      { "@type": "ListItem", position: 1, name: t("Accueil"), item: `${BASE_URL}/` },
    ];
    if (product.category) {
      crumbs.push({
        "@type": "ListItem",
        position: 2,
        name: t(product.category),
        item: `${BASE_URL}/?type=${product.is_digital ? "digital" : "physical"}&cat=${encodeURIComponent(product.category)}`,
      });
    }
    crumbs.push({
      "@type": "ListItem",
      position: crumbs.length + 1,
      name: product.name,
      item: pdUrl,
    });

    const faq = [
      {
        q: product.is_digital
          ? t("Comment vais-je recevoir mon produit ?")
          : t("Comment vais-je recevoir ma commande ?"),
        a: product.is_digital
          ? t(
              "Le fichier ou la vidéo protégée s'ouvre immédiatement après la confirmation du paiement. Vous le retrouvez aussi dans votre espace client et sur la page de suivi."
            )
          : t(
              "La boutique prépare votre commande et le livreur vous contacte. Les frais de livraison sont confirmés directement avec la boutique."
            ),
      },
      {
        q: t("Quels moyens de paiement sont acceptés ?"),
        a: product.is_digital
          ? t(
              "Carte bancaire (Visa / Mastercard), USDT et Mobile Money via iKeePay — transaction chiffrée et vérifiée."
            )
          : t("Le paiement se fait à la livraison, en espèces ou par Mobile Money."),
      },
      {
        q: t("Puis-je être remboursé ?"),
        a: `${t("Nos conditions de remboursement sont détaillées dans notre")} ${t("politique de remboursement")}.`,
      },
      {
        q: t("Besoin d'aide ?"),
        a: t(
          "Notre équipe et le vendeur restent disponibles pour répondre à vos questions avant et après votre achat."
        ),
      },
    ];

    const jsonLd = {
      "@context": "https://schema.org",
      "@graph": [
        productSchema,
        { "@type": "BreadcrumbList", itemListElement: crumbs },
        {
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        },
      ],
    };
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.text = JSON.stringify(jsonLd);
    const prev = document.head.querySelector("script[data-ssr]");
    if (prev) prev.remove();
    document.head.appendChild(el);
    return () => el.remove();
  }, [productId, flashPromoEndsAt, product, t]);

  const photos = product ? product.photos || [] : [];
  // Zoom (lightbox) : version « large » si disponible, sinon repli medium.
  const largePhotos =
    product && Array.isArray(product.photos_large) && product.photos_large.length
      ? product.photos_large
      : photos;
  // Vignettes de la galerie : thumbnails uniquement (jamais la version full).
  const thumbPhotos =
    product && Array.isArray(product.photos_thumb) && product.photos_thumb.length
      ? product.photos_thumb
      : photos;
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i + 1) % photos.length);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos.length]);

  // Galerie façon Amazon : zoom au survol (origine suivant le curseur) + swipe mobile.
  const pdMainRef = useRef(null);
  const pdTouchX = useRef(null);
  const pdRtl = (() => {
    try {
      return document.documentElement.getAttribute("dir") === "rtl" ? -1 : 1;
    } catch {
      return 1;
    }
  })();
  const onPdMouseMove = (e) => {
    const el = pdMainRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty("--zx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
    el.style.setProperty("--zy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
  };
  const onPdTouchStart = (e) => {
    pdTouchX.current = e.touches && e.touches[0] ? e.touches[0].clientX : null;
  };
  const onPdTouchEnd = (e) => {
    if (pdTouchX.current == null || photos.length < 2) return;
    const dx = e.changedTouches[0].clientX - pdTouchX.current;
    if (Math.abs(dx) > 42) {
      setLightboxIndex((i) => (i + (dx < 0 ? 1 : -1) + photos.length) % photos.length);
    }
    pdTouchX.current = null;
  };

  // ---------------- ACHAT DIGITAL EN LIGNE (iKeePay) ----------------
  // IMPORTANT : ces hooks restent AVANT les retours anticipés ci-dessous.
  // Un hook appelé après un `return` conditionnel change le nombre de hooks
  // entre deux rendus → « Rendered more hooks than during the previous render »
  // (React #310) dès que la fiche produit finit de charger.
  const stopDigitalPoll = () => {
    if (dPollRef.current) {
      clearInterval(dPollRef.current);
      dPollRef.current = null;
    }
  };
  useEffect(() => {
    dBuyRef.current = dBuy;
  }, [dBuy]);
  useEffect(
    () => () => {
      stopDigitalPoll();
    },
    []
  );

  if (error) {
    return (
      <main className="container boost-page pd-page">
        <p className="error">{error}</p>
        <Link to="/" className="btn btn-outline">
          ← {t("Retour aux produits")}
        </Link>
      </main>
    );
  }

  if (!product || Number(product.id) !== Number(id)) {
    return (
      <main className="container boost-page pd-page">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 260 }}></div>
        </div>
      </main>
    );
  }

  const isOwner = user && Number(user.id) === Number(product.shop_id);
  const isPrivilegedDigital =
    !!user && (user.role === "admin" || Number(user.id) === Number(product.shop_id));
  const deliveryFee = Number(product.delivery_fee || 0);
  const symbol = countrySymbol(product?.shop_country);
  const inStock = product.is_digital ? 9999 : Number(product.quantity || 0);
  const flash = product.flash_promo || null;
  const displayPrice = flash ? Number(flash.price) : Number(product.price);
  const trackFunnel = (event) => {
    api
      .trackFunnel(event, {
        product_id: Number(product.id),
        path: `/produit/${product.id}`,
      })
      .catch(() => {});
  };

  // ---------------- ACHAT DIGITAL EN LIGNE (iKeePay) ----------------
  // (hooks déplacés AVANT les retours anticipés — voir plus haut.)

  // Sondage (4 s) : le serveur confirme dès le webhook iKeePay, et répare
  // tout webhook manqué (réconciliation par les logs — même mécanisme que
  // l'adhésion). Dès confirmation → page de téléchargement.
  const startDigitalWaiting = (saleId, code) => {
    setDBuy((b) => ({ ...b, stage: "waiting" }));
    stopDigitalPoll();
    const check = async () => {
      try {
        const d = await api.digitalWaitOnline(saleId, code);
        if (d.confirmed && dBuyRef.current && dBuyRef.current.saleId === saleId) {
          stopDigitalPoll();
          // Une vidéo s'ouvre dès la confirmation ; un fichier reste derrière
          // son bouton de téléchargement pour éviter un téléchargement multiple.
          if (product.digital_kind === "youtube") {
            try {
              const video = await api.digitalVideo(saleId, code);
              setDBuy((b) =>
                b && b.saleId === saleId
                  ? { ...b, stage: "ready", videoSrc: video.embed_src, err: "" }
                  : b
              );
            } catch (e) {
              setDBuy((b) =>
                b && b.saleId === saleId ? { ...b, stage: "ready", err: e.message } : b
              );
            }
          } else {
            setDBuy((b) => (b && b.saleId === saleId ? { ...b, stage: "ready", err: "" } : b));
          }
        }
      } catch {
        /* réseau/timeout : on réessaie au prochain tick */
      }
    };
    check();
    dPollRef.current = setInterval(check, 4000);
  };

  const startDigitalBuy = async () => {
    trackFunnel("begin_checkout");
    setDBuy({ stage: "creating" });
    try {
      const d = await api.digitalPayin({ product_id: product.id });
      setDBuy({
        stage: "checkout",
        saleId: d.sale_id,
        code: d.confirm_code,
        checkoutUrl: d.checkout_url,
        digitalKind: product.digital_kind === "youtube" ? "youtube" : "file",
      });
    } catch (e) {
      setDBuy({ stage: "error", err: e.message });
    }
  };

  const closeDigitalBuy = () => {
    stopDigitalPoll();
    setDBuy(null);
  };

  // Contenu numérique après confirmation : un fichier déclenche l'URL signée ;
  // une vidéo appelle la route serveur protégée et affiche l'iframe YouTube.
  const downloadDigitalNow = async () => {
    const current = dBuyRef.current;
    if (!current) return;
    setDBuy((b) => ({ ...b, stage: "downloading", err: "" }));
    try {
      if (current.digitalKind === "youtube") {
        const d = await api.digitalVideo(current.saleId, current.code);
        setDBuy((b) => ({ ...b, stage: "ready", videoSrc: d.embed_src, err: "" }));
        return;
      }
      const d = await api.digitalDownload(current.saleId, current.code);
      const a = document.createElement("a");
      a.href = d.url;
      a.rel = "noopener";
      if (d.file_name) a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDBuy((b) => ({ ...b, stage: "done", fileName: d.file_name || b.fileName }));
      setTimeout(() => {
        // Retour automatique à la vitrine du produit.
        setDBuy((b) => (b && b.stage === "done" ? null : b));
      }, 6000);
    } catch (e) {
      setDBuy((b) => ({ ...b, stage: "ready", err: e.message }));
    }
  };
  // Accès DIRECT (admin / propriétaire) à un produit digital : pas de vente,
  // pas de paiement, pas de quota ni de journalisation. Fichier → URL signée ;
  // vidéo → iframe YouTube protégée.
  const directDigitalAccess = async () => {
    if (!product || !product.is_digital) return;
    setDirectBusy(true);
    setDirectVideoSrc(null);
    try {
      const d = await api.digitalProductAccess(product.id);
      if (d.kind === "youtube") {
        setDirectVideoSrc(d.embed_src);
      } else {
        const a = document.createElement("a");
        a.href = d.url;
        a.rel = "noopener";
        if (d.name) a.download = d.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDirectBusy(false);
    }
  };

  // ------------------------------------------------------------------
  const oldPrice = Number(
    flash
      ? Number(product.price)
      : product.old_price === null || product.old_price === undefined
        ? null
        : Number(product.old_price)
  );
  const hasPromo = oldPrice > 0 && oldPrice > displayPrice;
  const promoPct = hasPromo ? Math.round((1 - displayPrice / oldPrice) * 100) : 0;
  const isCreator = product.shop_role === "creator" || product.is_digital === true;
  const productUrl = `${BASE_URL}/produit/${product.id}`;
  const waMessage = `${t("Bonjour, je suis intéressé par « {name} » sur MboppiShop.", {
    name: product.name,
  })}\n${productUrl}`;

  const scrollToReviews = () => {
    const el = document.getElementById("avis");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addToCartNow = () => {
    addToCart(product, qty);
    trackFunnel("add_to_cart");
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const buyNow = () => {
    trackFunnel("begin_checkout");
    if (sellerCode) {
      navigate(`/acheter/${product.id}?code=${sellerCode}`);
      return;
    }
    addToCart(product, qty);
    navigate("/panier");
  };

  const toggleBundle = (id) => {
    setBundlePicked((list) =>
      list.includes(id) ? list.filter((value) => value !== id) : [...list, id]
    );
  };

  const addBundleToCart = () => {
    addToCart(product, qty);
    bundle
      .filter((p) => bundlePicked.includes(Number(p.id)))
      .forEach((p) => addToCart(p, 1));
    trackFunnel("bundle_add");
    setBundleAdded(true);
    setTimeout(() => setBundleAdded(false), 1600);
  };

  const submitStockAlert = async (event) => {
    event.preventDefault();
    const email = alertEmail.trim();
    if (!email) return;
    setAlertState("loading");
    setAlertError("");
    try {
      await api.stockAlert(product.id, email);
      setAlertState("done");
      trackFunnel("stock_alert");
    } catch (err) {
      setAlertState("error");
      setAlertError(err.message || t("Une erreur est survenue."));
    }
  };

  const selectedBundle = bundle.filter((p) => bundlePicked.includes(Number(p.id)));
  const bundleTotal =
    displayPrice * qty +
    selectedBundle.reduce(
      (sum, p) => sum + Number((p.flash_promo ? p.flash_promo.price : p.price) || 0),
      0
    );

  const removeProduct = async () => {
    if (!window.confirm(t("Retirer « {name} » définitivement ?", { name: product.name }))) return;
    setDeleting(true);
    try {
      await api.deleteProduct(product.id);
      navigate(isOwner ? "/shop" : "/");
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <main className="container boost-page pd-page pd-funnel">
      <Seo
        title={`${product.name} — MboppiShop`}
        description={t("Découvrez « {name} » à {price} {symbol} chez {shop} sur MboppiShop.", {
          name: product.name,
          price: formatMoney(flash ? flash.price : product.price),
          symbol,
          shop: product.shop_name,
        })}
        ogImage={absoluteProductImage(firstProductImage(product))}
      />

      <div className="pd-funnel-top">
        <nav className="pd-breadcrumb" aria-label={t("Fil d'Ariane")}>
          <Link to="/">{t("Accueil")}</Link>
          {product.category && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                to={`/?type=${product.is_digital ? "digital" : "physical"}&cat=${encodeURIComponent(product.category)}`}
              >
                {categoryEmoji(product.category)} {t(product.category)}
              </Link>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span className="pd-breadcrumb-current" aria-current="page">
            {product.name}
          </span>
        </nav>
        <span className="pd-secure-pill">
          <IconLock size={14} />{" "}
          {product.is_digital ? t("Paiement en ligne sécurisé") : t("Achat sécurisé")}
        </span>
      </div>

      {sellerCode && (
        <div className="seller-cta card pd-seller-banner">
          <div>
            <strong>
              <Logo className="logo-inline" />{" "}
              {t("Ce produit vous est proposé par un vendeur MboppiShop.")}
            </strong>
            <p className="hint" style={{ marginTop: 4 }}>
              {t(
                "Code du vendeur : {code} — Confirmez votre achat pour le notifier, lui et la boutique.",
                { code: sellerCode }
              )}
            </p>
          </div>
          <Link className="btn btn-primary" to={`/acheter/${product.id}?code=${sellerCode}`}>
            ✅ {t("Acheter")}
          </Link>
        </div>
      )}

      <section className="pd-hero">
        <div className="pd-hero-media">
          {(flash || hasPromo || product.is_digital) && (
            <div className="pd-media-badges">
              {flash && (
                <span className="pd-media-badge pd-media-flash">⚡ -{flash.discount_percent}%</span>
              )}
              {hasPromo && !flash && (
                <span className="pd-media-badge pd-media-flash">-{promoPct}%</span>
              )}
              {product.is_digital && (
                <span className="pd-media-badge pd-media-digital">📁 {t("Produit digital")}</span>
              )}
            </div>
          )}
          {/* Galerie façon Amazon : vignettes verticales (desktop), swipe + points (mobile) */}
          <div className="pd-gallery">
            {photos.length > 1 && photoShown && (
              <div className="pd-thumbs" aria-label={t("Photos du produit")}>
                {photos.map((photo, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`pd-thumb ${i === lightboxIndex ? "active" : ""}`}
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`${t("Photo")} ${i + 1}`}
                    aria-current={i === lightboxIndex}
                  >
                    <img src={thumbPhotos[i] || photo} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            )}
            <div
              ref={pdMainRef}
              className={`pd-main${photos.length > 0 && photoShown ? " zoomable" : ""}`}
              onClick={() => photos.length > 0 && photoShown && setLightbox(true)}
              onMouseMove={photos.length > 0 && photoShown ? onPdMouseMove : undefined}
              onTouchStart={onPdTouchStart}
              onTouchEnd={onPdTouchEnd}
            >
              {photos.length > 0 ? (
                photoShown ? (
                  <div
                    className="pd-track"
                    style={{ transform: `translateX(${pdRtl * -lightboxIndex * 100}%)` }}
                  >
                    {photos.map((photo, i) => (
                      <div className="pd-slide" key={i}>
                        <img
                          src={photo}
                          alt={i === lightboxIndex ? product.name : ""}
                          loading={i === 0 ? "eager" : "lazy"}
                          decoding="async"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary lite-photo-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoShown(true);
                    }}
                  >
                    🖼️ {t("Charger la photo")}
                  </button>
                )
              ) : (
                <span className="pd-empty">
                  <IconPackage size={44} />
                </span>
              )}
              {photos.length > 1 && photoShown && (
                <>
                  <span className="offer-photo-count">
                    {t("{n} photos — cliquez pour agrandir", { n: photos.length })}
                  </span>
                  <div className="pd-dots" aria-hidden="true">
                    {photos.map((_, i) => (
                      <span key={i} className={`pd-dot ${i === lightboxIndex ? "active" : ""}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="pd-hero-content">
          <div className="pd-eyebrow">
            {product.category && (
              <Link
                to={`/?type=${product.is_digital ? "digital" : "physical"}&cat=${encodeURIComponent(product.category)}`}
                className="pd-cat-pill"
              >
                {categoryEmoji(product.category)} {t(product.category)}
              </Link>
            )}
            {/* Produit DIGITAL : fichier privé ou vidéo protégée, accessible
                après confirmation du paiement. */}
            {product.is_digital && (
              <span
                className="pd-type-pill"
                title={t("Fichier à télécharger après confirmation du paiement")}
              >
                📁 {t("Produit digital")}
              </span>
            )}
            {Number(product.sold) > 0 && (
              <span className="pd-type-pill pd-type-sold">
                🔥 {t("{n} vendus", { n: product.sold })}
              </span>
            )}
            {viewsCount >= 5 && (
              <span className="pd-type-pill pd-type-views">
                👀 {t("{n} vues cette semaine", { n: viewsCount })}
              </span>
            )}
          </div>

          <h1 className="pd-title">{product.name}</h1>

          <div className="pd-rating-line">
            {product.review_count > 0 ? (
              <>
                <span className="stars stars-16" aria-hidden="true">
                  {"★".repeat(Math.round(product.rating_avg))}
                </span>
                <strong>{Number(product.rating_avg).toFixed(1)}/5</strong>
                <button type="button" className="pd-rating-link" onClick={scrollToReviews}>
                  {t("{n} avis", { n: product.review_count })}
                </button>
              </>
            ) : (
              <span className="pd-no-rating">{t("Soyez le premier à laisser un avis")}</span>
            )}
          </div>

          {product.review_count > 0 && (
            <ReviewQuote productId={product.id} count={product.review_count} />
          )}

          {product.description && <p className="pd-lead">{product.description}</p>}

          <div className="pd-seller-line">
            <Link
              to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
              className="pd-seller-avatar"
              aria-label={product.shop_name}
            >
              {product.shop_avatar ? (
                <img
                  src={proxyPhotoUrl(product.shop_avatar)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span>
                  {String(product.shop_name || "M")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </Link>
            <div className="pd-seller-meta">
              <span className="pd-seller-label">{isCreator ? t("Créateur") : t("Boutique")}</span>
              <Link
                to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
                className="pd-seller-name"
              >
                {product.shop_name}
                {product.shop_verified && (
                  <span
                    className="badge badge-verified"
                    title={isCreator ? t("Compte vérifié") : t("Boutique vérifiée")}
                  >
                    ✓ {isCreator ? t("Vérifié") : t("Vérifiée")}
                  </span>
                )}
              </Link>
              {product.shop_location && (
                <span className="pd-seller-loc">📍 {product.shop_location}</span>
              )}
            </div>
            <Link
              to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
              className="pd-seller-link"
            >
              {isCreator ? t("Voir le créateur") : t("Voir la boutique")} →
            </Link>
          </div>

          {/* Produit DIGITAL : coordonnées directes du créateur. */}
          {product.is_digital && (product.shop_phone || product.contact) && (
            <div className="pd-contact-row">
              {product.shop_phone && (
                <a className="meta-chip" href={`tel:${product.shop_phone}`}>
                  📞 {product.shop_phone}
                </a>
              )}
              {product.shop_phone && (
                <a
                  className="meta-chip"
                  href={waLink(product.shop_phone, waMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 {t("WhatsApp")}
                </a>
              )}
              {product.contact && !product.shop_phone && (
                <span className="meta-chip">📞 {product.contact}</span>
              )}
            </div>
          )}

          {product.warranty && (
            <p className="pd-warranty-note">
              🛡️ {t("Garantie : {warranty}", { warranty: product.warranty })}
            </p>
          )}

          {/* Bloc d'achat principal */}
          <aside className="pd-offer-card" id="achat" aria-label={t("Achat")} ref={offerCardRef}>
            <div className="pd-offer-card-inner">
              <div className="pd-offer-head">
                <div className="pd-price-block">
                  <span className="pd-price-label">{t("Prix")}</span>
                  <div className="pd-price-line">
                    {hasPromo && (
                      <span className="pd-old-price">
                        {formatMoney(oldPrice)} {symbol}
                      </span>
                    )}
                    <span className={`pd-price ${flash ? "price-flash" : ""}`}>
                      {formatMoney(displayPrice)} <small>{symbol}</small>
                    </span>
                    {hasPromo && <span className="pd-discount">-{promoPct}%</span>}
                  </div>
                  <PriceEquivalent
                    amount={displayPrice}
                    fromCode={product.currency || product.shop_country}
                    className="price-conv price-conv-lg"
                  />
                </div>
                {hasPromo && (
                  <span className="pd-save-pill">
                    {t("Économisez {amount} {symbol}", {
                      amount: formatMoney(oldPrice - displayPrice),
                      symbol,
                    })}
                  </span>
                )}
              </div>

              {flash && (
                <>
                  <FlashCountdown endsAt={flash.ends_at} />
                  <p className="pd-flash-note">
                    ⚡ {t("Offre éclair")} — {t("{n}% de réduction", { n: flash.discount_percent })}
                  </p>
                </>
              )}

              <p
                className={`pd-stock ${
                  product.is_digital || inStock > 5 ? "" : inStock > 0 ? "low" : "out"
                }`}
              >
                <span className="pd-stock-dot" aria-hidden="true" />
                {product.is_digital
                  ? t("Disponibilité : illimitée")
                  : inStock > 0
                    ? inStock <= 5
                      ? t("Plus que {n} en stock", { n: inStock })
                      : t("En stock — {n} disponibles", { n: inStock })
                    : t("Rupture de stock")}
              </p>

              <ul className="pd-assurance">
                {product.is_digital ? (
                  <>
                    <li>
                      <IconPackage size={15} /> {t("Téléchargement immédiat après paiement")}
                    </li>
                    <li>
                      <IconShieldCheck size={15} /> {t("Satisfaction garantie")}
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <IconTruck size={15} />{" "}
                      {deliveryFee > 0
                        ? t("Livraison {price} {symbol}", {
                            price: formatMoney(deliveryFee),
                            symbol,
                          })
                        : t("Livraison gratuite")}
                    </li>
                    <li>
                      <IconBanknote size={15} /> {t("Paiement à la livraison")}
                    </li>
                    <li>
                      <IconShieldCheck size={15} /> {t("Satisfaction garantie")}
                    </li>
                  </>
                )}
              </ul>

              {product.is_digital && isPrivilegedDigital && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-block pd-cta-main"
                    onClick={directDigitalAccess}
                    disabled={directBusy}
                  >
                    {directBusy
                      ? `⏳ ${t("Préparation…")}`
                      : product.digital_kind === "youtube"
                        ? `▶ ${t("Regarder la vidéo")}`
                        : `⬇️ ${t("Télécharger")}`}
                  </button>
                  {directVideoSrc && (
                    <div className="protected-video-frame" style={{ marginTop: 12 }}>
                      <iframe
                        src={directVideoSrc}
                        title={product.name}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  )}
                </>
              )}

              {product.is_digital && !isPrivilegedDigital && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-block pd-cta-main"
                    onClick={startDigitalBuy}
                    disabled={Boolean(dBuy)}
                  >
                    {product.digital_kind === "youtube"
                      ? `▶ ${t("Regarder la vidéo")}`
                      : `⬇️ ${t("Télécharger")}`}{" "}
                    — {formatMoney(displayPrice)} {symbol}
                  </button>
                  <p className="pd-cta-note">
                    🔒 {t("Paiement sécurisé, accès immédiat après confirmation.")}
                  </p>
                  {/* Moyens de paiement acceptés (iKeePay) : bandeau défilant. */}
                  <PaymentMethodsStrip />
                </>
              )}

              {!product.is_digital && inStock > 0 && !isOwner && (
                <>
                  <div className="pd-qty-row">
                    <span className="pd-qty-label">{t("Quantité")}</span>
                    <div className="qty-stepper">
                      <button
                        type="button"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        aria-label="-"
                      >
                        −
                      </button>
                      <span>{qty}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setQty((q) => Math.min(Number(product.quantity) || 99, q + 1))
                        }
                        aria-label="+"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block pd-cta-main"
                    onClick={buyNow}
                  >
                    ⚡ {t("Acheter maintenant")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-block pd-cta-secondary"
                    onClick={addToCartNow}
                  >
                    {added ? `✓ ${t("Ajouté au panier")}` : `🛒 ${t("Ajouter au panier")}`}
                  </button>
                  <p className="pd-cta-note">
                    🔍 {t("Vérifiez le produit avant de payer.")}
                  </p>
                  {/* Produit physique : paiement à la livraison (espèces ou
                      Mobile Money), pas de carte bancaire. */}
                  <PaymentMethodsStrip mode="delivery" />
                </>
              )}

              {!product.is_digital && inStock <= 0 && !isOwner && (
                <div className="pd-stock-alert">
                  <p className="pd-stock-alert-title">
                    🔔 {t("Prévenez-moi du retour en stock")}
                  </p>
                  <p className="pd-stock-alert-hint">
                    {t(
                      "Laissez votre e-mail : nous vous préviendrons dès que ce produit sera de nouveau disponible."
                    )}
                  </p>
                  {alertState === "done" ? (
                    <p className="pd-stock-alert-success">
                      ✓ {t("Alerte enregistrée")}
                    </p>
                  ) : (
                    <form onSubmit={submitStockAlert}>
                      <input
                        type="email"
                        value={alertEmail}
                        onChange={(e) => setAlertEmail(e.target.value)}
                        placeholder={t("Votre adresse e-mail")}
                        aria-label={t("Votre adresse e-mail")}
                        required
                        maxLength={200}
                        autoComplete="email"
                      />
                      <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={alertState === "loading"}
                      >
                        {alertState === "loading"
                          ? `⏳ ${t("Enregistrement…")}`
                          : `🔔 ${t("M'avertir")}`}
                      </button>
                      {alertState === "error" && alertError && (
                        <p className="pd-stock-alert-error">{alertError}</p>
                      )}
                    </form>
                  )}
                </div>
              )}

              <div className="detail-actions">
                <button
                  type="button"
                  className={`btn btn-outline ${isFav(product.id) ? "fav-on" : ""}`}
                  onClick={() => {
                    if (!user) {
                      navigate("/login", { state: { from: location.pathname } });
                      return;
                    }
                    toggleFav(product.id);
                  }}
                >
                  {isFav(product.id)
                    ? "❤️ " + t("Retirer des favoris")
                    : "🤍 " + t("Ajouter aux favoris")}
                </button>
                {(!isOwner || !product.is_digital) && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={async () => {
                      const url = `${BASE_URL}/produit/${product.id}`;
                      const text = t("Découvrez « {name} » à {price} {symbol} sur MboppiShop.", {
                        name: product.name,
                        price: formatMoney(displayPrice),
                        symbol,
                      });
                      try {
                        if (navigator.share) {
                          await nativeShareWithImage({
                            title: product.name,
                            text,
                            url,
                            imageUrl: absoluteProductImage(firstProductImage(product)),
                          });
                        } else {
                          await navigator.clipboard.writeText(url);
                          setShared(true);
                          setTimeout(() => setShared(false), 2000);
                        }
                      } catch {
                        /* annulé par l'utilisateur */
                      }
                    }}
                  >
                    {shared ? t("Lien copié !") : "🔗 " + t("Partager")}
                  </button>
                )}
              </div>

              {isOwner && (
                <button
                  className="btn btn-danger btn-block"
                  onClick={removeProduct}
                  disabled={deleting}
                >
                  {deleting ? t("Retrait…") : t("Rétirer ce produit")}
                </button>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="pd-trust-strip" aria-label={t("Nos engagements")}>
        <div className="pd-trust-item">
          <span className="pd-trust-icon">
            {product.is_digital ? <IconLock size={18} /> : <IconBanknote size={18} />}
          </span>
          <div>
            <strong>
              {product.is_digital ? t("Paiement sécurisé") : t("Paiement à la livraison")}
            </strong>
            <span>
              {product.is_digital
                ? t("Transaction chiffrée et vérifiée")
                : t("Réglez à la réception")}
            </span>
          </div>
        </div>
        <div className="pd-trust-item">
          <span className="pd-trust-icon">
            {product.is_digital ? <IconPackage size={18} /> : <IconTruck size={18} />}
          </span>
          <div>
            <strong>
              {product.is_digital
                ? t("Accès immédiat")
                : deliveryFee > 0
                  ? t("Livraison {price} {symbol}", {
                      price: formatMoney(deliveryFee),
                      symbol,
                    })
                  : t("Livraison offerte")}
            </strong>
            <span>
              {product.is_digital ? t("Dès confirmation du paiement") : t("Suivi de commande")}
            </span>
          </div>
        </div>
        <div className="pd-trust-item">
          <span className="pd-trust-icon">
            <IconShieldCheck size={18} />
          </span>
          <div>
            <strong>{t("Satisfaction garantie")}</strong>
            <span>{t("Achat en toute confiance")}</span>
          </div>
        </div>
        <div className="pd-trust-item">
          <span className="pd-trust-icon">
            <IconPhone size={18} />
          </span>
          <div>
            <strong>{t("Assistance MboppiShop")}</strong>
            <span>{t("Un interlocuteur à votre écoute")}</span>
          </div>
        </div>
      </section>

      <section className="pd-details-grid">
        <div className="pd-main-col">
          <article className="pd-panel">
            <span className="pd-panel-kicker">{t("À propos")}</span>
            <h2>{t("Description du produit")}</h2>
            <p className="pd-description">
              {product.description || t("Aucune description fournie pour ce produit.")}
            </p>
            <div className="product-meta">
              {Number(product.sold) > 0 && (
                <span className="meta-chip">🔥 {t("{n} vendus", { n: product.sold })}</span>
              )}
              {product.warranty && (
                <span className="meta-chip">
                  🛡️ {t("Garantie : {warranty}", { warranty: product.warranty })}
                </span>
              )}
              {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
            </div>
          </article>

          <article className="pd-panel">
            <h2>{t("Détails du produit")}</h2>
            <dl className="pd-specs">
              {product.category && (
                <div className="pd-spec">
                  <dt>{t("Catégorie")}</dt>
                  <dd>
                    {categoryEmoji(product.category)} {t(product.category)}
                  </dd>
                </div>
              )}
              <div className="pd-spec">
                <dt>{t("Type")}</dt>
                <dd>
                  {product.is_digital
                    ? t("Produit digital — accès immédiat")
                    : t("Produit physique")}
                </dd>
              </div>
              <div className="pd-spec">
                <dt>{t("Disponibilité")}</dt>
                <dd>
                  {product.is_digital
                    ? t("Illimitée")
                    : inStock > 0
                      ? t("{n} en stock", { n: inStock })
                      : t("Rupture de stock")}
                </dd>
              </div>
              <div className="pd-spec">
                <dt>{isCreator ? t("Créateur") : t("Boutique")}</dt>
                <dd>{product.shop_name}</dd>
              </div>
              <div className="pd-spec">
                <dt>{t("Référence")}</dt>
                <dd>#{product.id}</dd>
              </div>
              {product.warranty && (
                <div className="pd-spec">
                  <dt>{t("Garantie")}</dt>
                  <dd>{product.warranty}</dd>
                </div>
              )}
              <div className="pd-spec">
                <dt>{t("Livraison")}</dt>
                <dd>
                  {product.is_digital
                    ? t("Téléchargement ou accès en ligne")
                    : deliveryFee > 0
                      ? t("Livraison {price} {symbol} — confirmée avec la boutique.", {
                          price: formatMoney(deliveryFee),
                          symbol,
                        })
                      : t("Livraison offerte — confirmée avec la boutique.")}
                </dd>
              </div>
              <div className="pd-spec">
                <dt>{t("Paiement")}</dt>
                <dd>
                  {product.is_digital
                    ? t("En ligne sécurisé (iKeePay)")
                    : t("À la livraison (espèces ou Mobile Money)")}
                </dd>
              </div>
            </dl>
          </article>

          <article className="pd-panel pd-faq">
            <h2>{t("Questions fréquentes")}</h2>
            <details>
              <summary>
                {product.is_digital
                  ? t("Comment vais-je recevoir mon produit ?")
                  : t("Comment vais-je recevoir ma commande ?")}
              </summary>
              <p>
                {product.is_digital
                  ? t(
                      "Le fichier ou la vidéo protégée s'ouvre immédiatement après la confirmation du paiement. Vous le retrouvez aussi dans votre espace client et sur la page de suivi."
                    )
                  : t(
                      "La boutique prépare votre commande et le livreur vous contacte. Les frais de livraison sont confirmés directement avec la boutique."
                    )}
              </p>
            </details>
            <details>
              <summary>{t("Quels moyens de paiement sont acceptés ?")}</summary>
              <p>
                {product.is_digital
                  ? t(
                      "Carte bancaire (Visa / Mastercard), USDT et Mobile Money via iKeePay — transaction chiffrée et vérifiée."
                    )
                  : t("Le paiement se fait à la livraison, en espèces ou par Mobile Money.")}
              </p>
            </details>
            <details>
              <summary>{t("Puis-je être remboursé ?")}</summary>
              <p>
                {t("Nos conditions de remboursement sont détaillées dans notre")}{" "}
                <Link to="/remboursement">{t("politique de remboursement")}</Link>.
              </p>
            </details>
            <details>
              <summary>{t("Besoin d'aide ?")}</summary>
              <p>
                {t(
                  "Notre équipe et le vendeur restent disponibles pour répondre à vos questions avant et après votre achat."
                )}
              </p>
            </details>
          </article>
        </div>

        <aside className="pd-side-col">
          <div className="pd-side-card">
            <span className="pd-panel-kicker">{isCreator ? t("Créateur") : t("Boutique")}</span>
            <div className="pd-side-shop">
              <Link
                to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
                className="pd-seller-avatar"
                aria-label={product.shop_name}
              >
                {product.shop_avatar ? (
                  <img
                    src={proxyPhotoUrl(product.shop_avatar)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span>
                    {String(product.shop_name || "M")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
              </Link>
              <div>
                <Link
                  to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
                  className="pd-seller-name"
                >
                  {product.shop_name}
                  {product.shop_verified && (
                    <span className="badge badge-verified">✓ {t("Vérifié")}</span>
                  )}
                </Link>
                {product.shop_location && (
                  <span className="pd-seller-loc">📍 {product.shop_location}</span>
                )}
              </div>
            </div>
            <Link
              className="btn btn-primary btn-block"
              to={isCreator ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
            >
              {isCreator ? t("Voir le créateur") : t("Voir la boutique")}
            </Link>
            {product.is_digital && product.shop_phone && (
              <a
                className="btn btn-outline btn-block"
                href={waLink(product.shop_phone, waMessage)}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 {t("Contacter sur WhatsApp")}
              </a>
            )}
          </div>

          <div className="pd-side-card pd-side-trust">
            <span className="pd-side-trust-icon">
              <IconShieldCheck size={22} />
            </span>
            <h3>{t("Achetez en toute confiance")}</h3>
            <ul>
              <li>
                ✓{" "}
                {product.is_digital ? t("Accès livré immédiatement") : t("Paiement à la livraison")}
              </li>
              <li>✓ {t("Vendeur vérifié par MboppiShop")}</li>
              <li>✓ {t("Assistance disponible en cas de besoin")}</li>
            </ul>
          </div>
        </aside>
      </section>

      <section id="avis" className="pd-reviews">
        <Reviews product={product} />
      </section>

      {bundle.length > 0 && !isOwner && (
        <section className="pd-bundle">
          <h2 className="section-title">
            🧩 {t("Souvent achetés ensemble")}
          </h2>
          <div className="pd-bundle-row">
            <div className="pd-bundle-item is-current">
              <span className="pd-bundle-thumb">
                {firstProductImage(product) ? (
                  <img
                    src={proxyPhotoUrl(firstProductImage(product))}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="pd-bundle-fallback" aria-hidden="true">
                    📦
                  </span>
                )}
              </span>
              <span className="pd-bundle-info">
                <strong>{product.name}</strong>
                <span>
                  {formatMoney(displayPrice)} {symbol} × {qty}
                </span>
              </span>
              <span className="pd-bundle-check" aria-hidden="true">
                ✓
              </span>
            </div>
            {bundle.map((p) => {
              const picked = bundlePicked.includes(Number(p.id));
              const bundlePhoto = proxyPhotoUrl(firstProductImage(p));
              const itemPrice = Number(
                (p.flash_promo ? p.flash_promo.price : p.price) || 0
              );
              return (
                <React.Fragment key={p.id}>
                  <span className="pd-bundle-plus" aria-hidden="true">
                    +
                  </span>
                  <label className={`pd-bundle-item${picked ? " is-picked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => toggleBundle(Number(p.id))}
                    />
                    <span className="pd-bundle-thumb">
                      {bundlePhoto ? (
                        <img
                          src={bundlePhoto}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="pd-bundle-fallback" aria-hidden="true">
                          📦
                        </span>
                      )}
                    </span>
                    <span className="pd-bundle-info">
                      <strong>{p.name}</strong>
                      <span>
                        {formatMoney(itemPrice)} {countrySymbol(p.shop_country)}
                      </span>
                    </span>
                    <span className="pd-bundle-check" aria-hidden="true">
                      {picked ? "✓" : "+"}
                    </span>
                  </label>
                </React.Fragment>
              );
            })}
          </div>
          <div className="pd-bundle-footer">
            <div className="pd-bundle-total">
              <span>{t("Total sélection")}</span>
              <strong>
                {formatMoney(bundleTotal)} {symbol}
              </strong>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addBundleToCart}
              disabled={!selectedBundle.length}
            >
              🛒{" "}
              {bundleAdded
                ? t("Sélection ajoutée")
                : t("Ajouter la sélection au panier")}
            </button>
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="pd-related">
          <h2 className="section-title">
            <IconLayers size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            {t("Produits similaires")}
          </h2>
          <div className="grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {!isOwner && (product.is_digital || inStock > 0) && (
        <div
          className={`pd-sticky-buy${showStickyBuy ? " is-visible" : ""}`}
          role="region"
          aria-label={t("Achat rapide")}
        >
          <div className="pd-sticky-price">
            <strong>
              {formatMoney(displayPrice)} <small>{symbol}</small>
            </strong>
            {hasPromo && (
              <span>
                {formatMoney(oldPrice)} {symbol}
              </span>
            )}
          </div>
          {product.is_digital ? (
            isPrivilegedDigital ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={directDigitalAccess}
                disabled={directBusy}
              >
                {product.digital_kind === "youtube"
                  ? `▶ ${t("Regarder")}`
                  : `⬇️ ${t("Télécharger")}`}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={startDigitalBuy}
                disabled={Boolean(dBuy)}
              >
                ⬇️ {t("Télécharger")}
              </button>
            )
          ) : (
            <button type="button" className="btn btn-primary" onClick={buyNow}>
              ⚡ {t("Acheter maintenant")}
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <button
            className="lightbox-close"
            onClick={() => setLightbox(false)}
            aria-label={t("Fermer")}
          >
            ✕
          </button>
          {photos.length > 1 && (
            <button
              className="lightbox-nav prev"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
              }}
              aria-label={t("Photo précédente")}
            >
              ‹
            </button>
          )}
          <img
            className="lightbox-img"
            src={largePhotos[lightboxIndex] || photos[lightboxIndex]}
            alt={product.name}
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <button
              className="lightbox-nav next"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((i) => (i + 1) % photos.length);
              }}
              aria-label={t("Photo suivante")}
            >
              ›
            </button>
          )}
        </div>
      )}

      {/* ---------- ACHAT DIGITAL : paiement → téléchargement → félicitations ---------- */}
      {dBuy && dBuy.stage !== "checkout" && (
        <div
          className="ikeepay-overlay"
          style={{ display: "flex" }}
          role="dialog"
          aria-label="Téléchargement"
        >
          <div className="ikeepay-modal digital-buy-modal">
            <button
              type="button"
              className="ikeepay-close"
              aria-label={t("Fermer")}
              onClick={closeDigitalBuy}
            >
              ✕
            </button>
            {dBuy.stage === "creating" && (
              <div className="digital-buy-center">
                <span className="ikepay-spinner" role="status" aria-live="polite" />
                <p>{t("Préparation de votre commande…")}</p>
              </div>
            )}
            {dBuy.stage === "waiting" && (
              <div className="digital-buy-center">
                <span className="ikepay-spinner" role="status" aria-live="polite" />
                <p>
                  ⏳ {t("Paiement reçu — confirmation en cours…")}
                  <br />
                  <span className="hint">
                    {t("La page de téléchargement s'ouvrira automatiquement (quelques secondes).")}
                  </span>
                </p>
              </div>
            )}
            {(dBuy.stage === "ready" || dBuy.stage === "downloading") && (
              <div className="digital-buy-center">
                <p className="digital-buy-title">📁 {product.name}</p>
                {dBuy.videoSrc ? (
                  <div className="protected-video-frame">
                    <iframe
                      src={dBuy.videoSrc}
                      title={product.name}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={downloadDigitalNow}
                    disabled={dBuy.stage === "downloading"}
                  >
                    {dBuy.stage === "downloading"
                      ? `⏳ ${dBuy.digitalKind === "youtube" ? t("Ouverture de la vidéo…") : t("Téléchargement en cours…")}`
                      : dBuy.digitalKind === "youtube"
                        ? `▶ ${t("Regarder la vidéo")}`
                        : `⬇️ ${t("Télécharger mon fichier")}`}
                  </button>
                )}
                {!dBuy.videoSrc && (
                  <p className="hint">
                    {dBuy.digitalKind === "youtube"
                      ? t("La vidéo s'ouvrira après validation de votre accès.")
                      : t("Un seul téléchargement est autorisé pour cet achat.")}
                  </p>
                )}
                {dBuy.err && <p className="error">{dBuy.err}</p>}
              </div>
            )}
            {dBuy.stage === "done" && (
              <div className="digital-buy-center">
                <p className="digital-buy-congrats">🎉 {t("Félicitations !")}</p>
                <p>
                  {t("Votre fichier a été téléchargé sur votre appareil.")}
                  {dBuy.fileName ? <br /> : null}
                  {dBuy.fileName && <span className="hint">📁 {dBuy.fileName}</span>}
                </p>
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={closeDigitalBuy}
                >
                  {t("Retour au produit")}
                </button>
              </div>
            )}
            {dBuy.stage === "error" && (
              <div className="digital-buy-center">
                <p className="error">{dBuy.err || t("Une erreur est survenue.")}</p>
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={closeDigitalBuy}
                >
                  {t("Fermer")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {dBuy && dBuy.stage === "checkout" && (
        <IkeepayCheckout
          checkoutUrl={dBuy.checkoutUrl}
          onSuccess={() => startDigitalWaiting(dBuy.saleId, dBuy.code)}
          onClose={() => {
            // Paiement abandonné : on revient à la vitrine.
            stopDigitalPoll();
            setDBuy(null);
          }}
        />
      )}
    </main>
  );
}
