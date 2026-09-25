import { storage, sessionStore } from "../storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import ProductCard, { formatMoney } from "../components/ProductCard.jsx";
import ProductRail, { RailShell } from "../components/ProductRail.jsx";
import FlashPromoCard from "../components/FlashPromo.jsx";
import Seo from "../components/Seo.jsx";
import RecentSales from "../components/RecentSales.jsx";
import Logo from "../components/Logo.jsx";
import HeroCarousel from "../components/HeroCarousel.jsx";
import CategoryGrid from "../components/CategoryGrid.jsx";
import TrustBadges from "../components/TrustBadges.jsx";
import Reveal from "../components/Reveal.jsx";
// import SocialProof from "../components/SocialProof.jsx"; // réactiver avec la section (voir plus bas)
import { useLang } from "../i18n.jsx";
import { PRODUCT_CATEGORIES, currencySymbol } from "../config.js";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { useAuth } from "../App.jsx";
import { useGeo } from "../geo.js";
import { proxyPhotoUrl } from "../share.js";
import {
  isCatalogResponseStale,
  nextCatalogRefresh,
  normalizeServerCatalog,
  productsOfType,
  shouldRetryDigitalCatalog,
  shouldRetryPhysicalCatalog,
} from "./homeCatalog.js";

function mergeUnique(prev, next) {
  if (!prev.length) return next;
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

export default function Home() {
  const { t } = useLang();
  const { user } = useAuth();
  const [params, setSearchParams] = useSearchParams();
  const mounted = useRef(true);
  // Chaque changement de filtre doit invalider la réponse précédente : sans ce
  // jeton, une requête « physiques » tardive peut écraser la réponse « digital »
  // et faire croire qu'un actualisation manuelle est nécessaire.
  const productRequestId = useRef(0);
  const catalogByTypeRef = useRef({ physical: [], digital: [] });
  const hasLoaded = useRef(false);
  const hasData = useRef(false);
  const retryRef = useRef(0);
  // Réessai différé (réponse vide uniquement) : le minuteur est annulé dès que
  // la famille affichée change, pour qu'un ancien retry « physiques » ne vienne
  // jamais invalider le chargement « digitaux » lancé au clic sur le volet.
  const retryTimerRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => params.get("q") || "");
  const [category, setCategory] = useState(() => params.get("cat") || "");
  // Volets produits : « physiques » (défaut) et « digitaux » — jamais mélangés
  // dans la même liste (serveur `type=` + filtre client des rails).
  const [ptype, setPtype] = useState(() => (params.get("type") === "digital" ? "digital" : "physical"));
  // Un jeton stable évite de créer une nouvelle clé Vercel à chaque focus/filtrage.
  // Il est renouvelé uniquement lors d'un vrai changement de famille.
  const catalogRefreshRef = useRef(ptype === "digital" ? Date.now() : 0);
  // Famille réellement AFFICHÉE (suit le rendu courant) : une réponse — ou un
  // réessai programmé — de l'autre famille ne doit jamais s'appliquer, sinon la
  // liste du bas reste vide jusqu'à l'actualisation de la page.
  const ptypeRef = useRef(ptype);
  ptypeRef.current = ptype;
  // Famille dont le premier chargement est terminé : pendant la transition vers
  // un volet jamais chargé, on montre des squelettes — jamais le message
  // « aucun produit pour le moment » alors que la requête est encore en vol.
  const [loadedFamily, setLoadedFamily] = useState(null);
  const [sort, setSort] = useState("popular");
  const [scope, setScope] = useState("product");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [mode, setMode] = useState("products");
  const [cityInput, setCityInput] = useState("");
  const [city, setCity] = useState("");
  const [shops, setShops] = useState([]);
  const [cityProducts, setCityProducts] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopsError, setShopsError] = useState("");
  const PER_PAGE = 24;
  // Navigation libre : pages de 100 produits = 10 lignes glissables de 10.
  const BROWSE_PAGE_SIZE = 100;
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const appendRef = useRef(false);
  const produitsRef = useRef(null);
  const tabsRef = useRef(null);
  const [trending, setTrending] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [popular, setPopular] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [flashPromos, setFlashPromos] = useState([]);
  const [activeRail, setActiveRail] = useState(() => params.get("rail") || "");
  // Géolocalisation : pays détecté + préférence « produits de mon pays d'abord ».
  const { country: geoCountry, city: geoCity, loading: geoLoading } = useGeo();
  const [localOnly, setLocalOnly] = useState(true);

  // Transition de catalogue centralisée : cet effet doit précéder les effets
  // qui chargent le grand catalogue et les rails. Le changement vers
  // « Produits digitaux » renouvelle ainsi sa clé Vercel AVANT que la requête
  // principale ne soit relancée ; sinon elle part avec catalog_refresh=0 et
  // reçoit une ancienne réponse vide. Après un rechargement direct sur
  // ?type=digital, la valeur Date.now() initialisée plus haut joue le même rôle.
  // Bascule de volet : les boutons l'appliquent AVANT le rendu (la liste du bas
  // affiche immédiatement le cache de la famille choisie, sinon des squelettes)
  // et l'effet ci-dessous la rejoue quand le changement vient de l'URL.
  const applyTypeTransition = (nextType) => {
    if (nextType === "digital") {
      // Monotone : même plusieurs changements dans la même milliseconde, chaque
      // bascule digital→physique→digital obtient une URL Vercel différente.
      catalogRefreshRef.current = nextCatalogRefresh(catalogRefreshRef.current);
    }
    // Un réessai différé de l'ancienne famille est annulé : envoyé après la
    // bascule, il invaliderait la requête du nouveau volet (liste du bas vide
    // jusqu'à l'actualisation de la page).
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Invalide sans attendre le prochain effet une réponse de l'ancienne
    // famille qui pourrait encore être en vol.
    const cached = catalogByTypeRef.current[nextType];
    productRequestId.current += 1;
    hasLoaded.current = cached.length > 0;
    hasData.current = cached.length > 0;
    retryRef.current = 0;
    setProducts(cached);
    setHasMore(false);
    setError("");
    setLoading(cached.length === 0);
    setLoadingMore(false);
    setLoadedFamily(cached.length > 0 ? nextType : null);
    setOffset(0);
    setPage(0);
  };

  useEffect(() => {
    applyTypeTransition(ptype);
  }, [ptype]);

  // Lien « Promotions » du header : /?rail=promos ouvre directement le rail.
  useEffect(() => {
    const r = params.get("rail");
    if (r) setActiveRail(r);
  }, [params]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
      if (ptype !== "physical") return;
      try {
        const cached = sessionStore.getItem("mboppi_products");
        const arr = cached ? JSON.parse(cached) : null;
      if (Array.isArray(arr) && arr.length) {
        catalogByTypeRef.current.physical = arr;
        hasLoaded.current = true;
        hasData.current = true;
        setProducts(arr);
      }
    } catch {
      /* cache invalide : on ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const list = JSON.parse(storage.getItem("mboppi_recent") || "[]");
      const filtered = Array.isArray(list)
        ? list
            .filter((p) => Number(p.quantity || 0) > 0)
            .map((p) => ({
              ...p,
              photo: proxyPhotoUrl(p.photo),
              image: proxyPhotoUrl(p.image),
              photos: Array.isArray(p.photos) ? p.photos.map(proxyPhotoUrl) : p.photos,
            }))
        : [];
      setRecent(filtered);
    } catch {
      /* ignore */
    }
  }, []);

  // Synchronisation recherche/catégorie avec l'URL (?q= / ?cat=) : les liens de la
  // barre de recherche et du bandeau catégories (navbar) s'appliquent partout.
  useEffect(() => {
    setSearch(params.get("q") || "");
    setDebouncedSearch(params.get("q") || "");
    setOffset(0);
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("q")]);

  useEffect(() => {
    setCategory(params.get("cat") || "");
    setOffset(0);
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("cat")]);

  // Une navigation externe (lien direct, retour/avance) aligne l'onglet sur
  // l'URL. La transition centralisée ci-dessus gère déjà le reset et la clé
  // fraîche ; on ne les répète pas ici pour ne pas effacer une réponse déjà
  // chargée quand le clic vient d'ajouter ?type=digital à l'URL.
  useEffect(() => {
    const nextType = params.get("type") === "digital" ? "digital" : "physical";
    setPtype(nextType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("type")]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if ((next.get("type") || "physical") !== ptype) {
      next.set("type", ptype);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptype]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    const q = debouncedSearch.trim();
    if ((next.get("q") || "") !== q) {
      if (q) next.set("q", q);
      else next.delete("q");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if ((next.get("cat") || "") !== category) {
      if (category) next.set("cat", category);
      else next.delete("cat");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    let ok = true;
    // Les rails suivent exactement le volet actif. Sans `type=ptype`, une
    // réponse physique tardive pouvait être filtrée côté client et laisser un
    // seul produit digital (ou masquer les autres) jusqu'à l'actualisation.
    setTrending([]);
    setBestSellers([]);
    setPopular([]);
    setNewArrivals([]);
    // Les requêtes digitales ignorent explicitement les caches navigateur et
    // PWA. Chaque rail alimente aussi le catalogue principal : si la requête
    // complète est retardée, la section du bas peut immédiatement réutiliser
    // les produits digitaux déjà affichés dans « Nouveautés ».
    const railOptions = ptype === "digital" ? { cache: "no-store" } : {};
    const railRefresh = ptype === "digital" ? { catalog_refresh: catalogRefreshRef.current } : {};
    const acceptRail = (setter, data) => {
      if (!ok) return;
      const next = normalizeServerCatalog(ptype, data.products);
      setter(next);
      if (ptype === "digital") {
        const merged = mergeUnique(catalogByTypeRef.current.digital, next);
        catalogByTypeRef.current.digital = merged;
        if (merged.length > 0) {
          hasLoaded.current = true;
          hasData.current = true;
          setLoading(false);
          setProducts((current) => mergeUnique(current, merged));
        }
      }
    };
    api
      .trending({ type: ptype, ...railRefresh }, railOptions)
      .then((d) => acceptRail(setTrending, d))
      .catch(() => {});
    api
      .listProducts({ sort: "sales", type: ptype, ...railRefresh, limit: 10 }, railOptions)
      .then((d) => acceptRail(setBestSellers, d))
      .catch(() => {});
    api
      .listProducts({ sort: "popular", type: ptype, ...railRefresh, limit: 10 }, railOptions)
      .then((d) => acceptRail(setPopular, d))
      .catch(() => {});
    api
      .listProducts({ sort: "recent", type: ptype, ...railRefresh, limit: 10 }, railOptions)
      .then((d) => acceptRail(setNewArrivals, d))
      .catch(() => {});

    api
      .flashPromotions()
      .then((d) => ok && setFlashPromos(d.promotions || []))
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [ptype]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 150);
    return () => clearTimeout(id);
  }, [search]);

  const [sugItems, setSugItems] = useState([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugActive, setSugActive] = useState(-1);
  const sugTimer = useRef(null);
  const sugRefs = useRef([]);

  useEffect(() => {
    const query = search.trim();
    clearTimeout(sugTimer.current);
    if (query.length < 2) {
      setSugItems([]);
      setSugOpen(false);
      setSugActive(-1);
      setSugLoading(false);
      return;
    }
    setSugLoading(true);
    sugTimer.current = setTimeout(() => {
      let ok = true;
      Promise.all([
        api.listProducts({ search: query, limit: 6 }),
        api.listShops({ search: query, limit: 4 }),
      ])
        .then(([pr, sr]) => {
          if (!ok) return;
          const items = [
            ...(pr.products || []).map((p) => ({
              kind: "product",
              id: p.id,
              title: p.name,
              sub: p.shop_name || t("Produit"),
              price: p.price,
              currency: p.currency,
              image: proxyPhotoUrl(p.image),
              url: `/produit/${p.id}`,
            })),
            ...(sr.shops || []).map((s) => ({
              kind: "shop",
              id: s.id,
              title: s.name,
              sub: s.role === "creator" ? t("Créateur·rice") : t("Boutique"),
              image: s.sample_image,
              url: s.role === "creator" ? `/createur/${s.id}` : `/boutique/${s.id}`,
            })),
          ];
          setSugItems(items);
          setSugOpen(items.length > 0);
          setSugActive(-1);
        })
        .catch(() => {})
        .finally(() => ok && setSugLoading(false));
      return () => {
        ok = false;
      };
    }, 250);
    return () => clearTimeout(sugTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadProducts = useCallback(
    (silent, append) => {
      // Famille visée par CETTE requête : si l'utilisateur change de volet
      // pendant qu'elle vole, sa réponse est ignorée — elle ne doit ni écraser
      // l'autre famille ni empêcher la sienne de s'afficher.
      const family = ptype;
      const requestId = ++productRequestId.current;
      // Une réponse VIDE (cache Vercel obsolète) mérite un réessai différé ;
      // une réponse normale n'en programme jamais (sinon : boucle infinie de
      // requêtes « physiques » qui invalide le catalogue digital).
      let emptyResult = false;
      const stillCurrent = () =>
        !isCatalogResponseStale({
          mounted: mounted.current,
          requestId,
          latestRequestId: productRequestId.current,
          family,
          currentFamily: ptypeRef.current,
        });
      if (!silent && !hasLoaded.current) setLoading(true);
      // Navigation libre (sans recherche ni filtre) : les produits tournent à
      // chaque visite via la graine. Recherche/filtres : ordre pertinent conservé.
      const isBrowse =
        !debouncedSearch && !category && !minPrice && !maxPrice && scope === "product";
      const query = {
        search: debouncedSearch || undefined,
        category: category || undefined,
        sort: sort || undefined,
        // Volet actif : produits physiques OU digitaux (jamais les deux).
        type: family,
        // Une clé numérique unique évite qu'une réponse Vercel ancienne et vide
        // soit confondue avec le catalogue digital actuel.
        ...(family === "digital" ? { catalog_refresh: catalogRefreshRef.current } : {}),
        ...(scope && scope !== "product" ? { scope } : {}),
        ...(minPrice ? { min_price: Number(minPrice) } : {}),
        ...(maxPrice ? { max_price: Number(maxPrice) } : {}),
        ...(localOnly && geoCountry ? { country: geoCountry } : {}),
        limit: isBrowse ? BROWSE_PAGE_SIZE : PER_PAGE,
        offset: isBrowse ? page * BROWSE_PAGE_SIZE : offset,
      };
      const fetchOptions = family === "digital" ? { cache: "no-store" } : {};
      api
        .listProducts(query, fetchOptions)
        .then((d) => {
          const unfiltered =
            !debouncedSearch && !category && !minPrice && !maxPrice && scope === "product";
          // Réponse obsolète (volet changé, requête plus récente) : aucun effet,
          // aucun réessai — elle n'appartient plus à l'écran affiché.
          if (!stillCurrent()) return d;
          if (
            shouldRetryDigitalCatalog({
              type: family,
              products: d.products,
              unfiltered,
              append,
              retryCount: retryRef.current,
            })
          ) {
            retryRef.current += 1;
            const retryRefresh = nextCatalogRefresh(catalogRefreshRef.current);
            catalogRefreshRef.current = retryRefresh;
            return api.listProducts(
              { ...query, catalog_refresh: retryRefresh },
              { cache: "no-store" }
            );
          }
          return d;
        })
        .then((d) => {
          if (stillCurrent()) {
            hasLoaded.current = true;
            const next = normalizeServerCatalog(family, d.products);
            const unfiltered =
              !debouncedSearch && !category && !minPrice && !maxPrice && scope === "product";
            if (family === "digital") {
              // Le catalogue complet remplace les fragments de rails, mais une
              // réponse éventuellement vide ne doit jamais les effacer.
              catalogByTypeRef.current.digital =
                next.length > 0 ? next : catalogByTypeRef.current.digital;
              const visible = next.length > 0 ? next : catalogByTypeRef.current.digital;
              setHasMore(Boolean(d.hasMore));
              setProducts((prev) => (append ? mergeUnique(prev, visible) : visible));
              hasData.current = d.total != null ? d.total > 0 : visible.length > 0;
              if (visible.length > 0) retryRef.current = 0;
              setError("");
            } else if (next.length === 0 && hasData.current && unfiltered) {
              // Réponse vide suspecte : la liste déjà affichée est conservée.
              emptyResult = true;
              setError("");
            } else {
              catalogByTypeRef.current.physical = next;
              setHasMore(Boolean(d.hasMore));
              setProducts((prev) => (append ? mergeUnique(prev, next) : next));
              hasData.current = d.total != null ? d.total > 0 : next.length > 0;
              if (next.length > 0) retryRef.current = 0;
              else emptyResult = true;
              setError("");
            }
            if (unfiltered && sort === "recent" && !append) {
              try {
                sessionStore.setItem("mboppi_products", JSON.stringify(next));
              } catch {
                /* stockage indisponible : on ignore */
              }
            }
          }
        })
        .catch((e) => {
          if (stillCurrent()) setError(e.message);
        })
        .finally(() => {
          if (stillCurrent()) {
            setLoading(false);
            setLoadingMore(false);
            setLoadedFamily(family);
            // Réessai UNIQUEMENT pour une réponse physique vide et sans filtre
            // (deux tentatives maximum). L'ancienne condition (`hasLoaded`) en
            // reprogrammait un après CHAQUE réponse non vide, en boucle : ces
            // requêtes invalidaient le chargement du volet digital, qui restait
            // vide jusqu'à l'actualisation de la page.
            if (
              shouldRetryPhysicalCatalog({
                type: family,
                empty: emptyResult,
                append,
                unfiltered:
                  !debouncedSearch && !category && !minPrice && !maxPrice && scope === "product",
                retryCount: retryRef.current,
              })
            ) {
              retryRef.current += 1;
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                // Le volet a pu changer pendant l'attente : le réessai est sans
                // objet (et ne doit pas invalider la requête du nouveau volet).
                if (ptypeRef.current === "physical" && productRequestId.current === requestId) {
                  loadProducts(true);
                }
              }, 900);
            }
          }
        });
    },
    [debouncedSearch, category, sort, scope, minPrice, maxPrice, offset, page, localOnly, geoCountry, ptype]
  );

  useEffect(() => {
    mounted.current = true;
    loadProducts(false, appendRef.current);
    appendRef.current = false;
    return () => {
      mounted.current = false;
      // Aucun réessai ne doit survivre au démontage (ou au changement de volet).
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [loadProducts]);

  useRefreshOnFocus(() => loadProducts(true));

  useEffect(() => {
    if (mode !== "city") return;
    const id = setTimeout(() => setCity(cityInput.trim()), 500);
    return () => clearTimeout(id);
  }, [cityInput, mode]);

  useEffect(() => {
    if (mode !== "city" || !city) return;
    let ok = true;
    setShopsLoading(true);
    setShopsError("");
    Promise.all([api.listShops({ city }), api.listProducts({ city })])
      .then(([shopsRes, productsRes]) => {
        if (ok) {
          setShops(shopsRes.shops || []);
          setCityProducts(productsRes.products || []);
        }
      })
      .catch((e) => ok && setShopsError(e.message))
      .finally(() => ok && setShopsLoading(false));
    return () => {
      ok = false;
    };
  }, [mode, city]);

  const goToProducts = () => {
    produitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Clic sur « 📦 Produits physiques » / « 📁 Produits digitaux » : la liste du
  // bas bascule IMMÉDIATEMENT (cache de la famille choisie, sinon squelettes) et
  // les réponses encore en vol de l'ancienne famille sont invalidées.
  const onSelectType = (nextType) => {
    if (nextType !== ptype) applyTypeTransition(nextType);
    setPtype(nextType);
    goToProducts();
  };

  const scrollTabs = (dir) => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    setSugOpen(false);
    setSugActive(-1);
    goToProducts();
  };

  const onSugKeyDown = (e) => {
    if (
      !sugOpen ||
      sugItems.length === 0 ||
      (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape")
    )
      return;
    e.preventDefault();
    if (e.key === "Escape") {
      setSugOpen(false);
      setSugActive(-1);
      return;
    }
    const next =
      e.key === "ArrowDown"
        ? sugActive < sugItems.length - 1
          ? sugActive + 1
          : 0
        : sugActive > 0
          ? sugActive - 1
          : sugItems.length - 1;
    setSugActive(next);
    sugRefs.current[next]?.focus();
  };

  const loadMore = () => {
    appendRef.current = true;
    setLoadingMore(true);
    setOffset((o) => o + PER_PAGE);
  };

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setOffset(0);
    setPage(0);
  };

  // Navigation libre (sans recherche ni filtre) : la sélection s'affiche en
  // ligne horizontale glissable (max 10) au lieu de la grille paginée.
  const browseMode =
    mode === "products" &&
    !category &&
    !minPrice &&
    !maxPrice &&
    !debouncedSearch.trim() &&
    scope === "product";

  // Dernier garde-fou de rendu : même si une réponse arrive pendant une
  // transition, la grande liste ne peut jamais mélanger les deux familles.
  const displayProducts = productsOfType(ptype, products);

  // Découpage en lignes de 10 produits glissables (10 lignes par page).
  const productRows = [];
  for (let i = 0; i < displayProducts.length; i += 10) {
    productRows.push(displayProducts.slice(i, i + 10));
  }

  // Rails filtrés par le volet actif (physique / digital) — jamais mélangés.
  const filterType = (list) => productsOfType(ptype, list);
  const fTrending = filterType(trending);
  const fBestSellers = filterType(bestSellers);
  const fPopular = filterType(popular);
  const fNewArrivals = filterType(newArrivals);
  const fRecent = filterType(recent);
  const fCityProducts = filterType(cityProducts);

  const goToPage = (p) => {
    setPage(p);
    produitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="container home-page">
      <Seo
        title="MboppiShop — Boutiques, vendeurs et offres du moment"
        description="Le marché de votre quartier en ligne : produits des boutiques, créations des créateurs, vente avec commissions, commande avec livraison."
      />

      <RecentSales />

      {/* Refonte 2026 : carrousel promo, grille de catégories illustrée et badges de confiance */}
      <Reveal>
        <HeroCarousel onExplore={goToProducts} />
      </Reveal>

      {/* Preuve sociale désactivée pour l'instant : compteurs trop faibles pour galvaniser.
          Réactiver plus tard en décommentant (le composant et GET /api/metrics/public restent prêts) :
      <Reveal delay={40}>
        <SocialProof />
      </Reveal>
      */}
      <Reveal delay={70}>
        <CategoryGrid />
      </Reveal>
      <Reveal delay={140}>
        <TrustBadges />
      </Reveal>

      {!user && (
        <>
          <section className="hero vitrine-hero">
            <div className="hero-floats" aria-hidden="true">
              <span className="logo-float">
                <Logo className="hero-float-logo" />
              </span>
              <span>💸</span>
              <span>🛒</span>
              <span>✨</span>
              <span>💰</span>
              <span>🎊</span>
            </div>
            <span className="hero-badge">
              <Logo className="logo-inline" /> {t("BIENVENUE SUR MBOPPISHOP")}
            </span>
            <h1>{t("MboppiShop, le marché de votre quartier, en ligne")}</h1>
            <p>
              {t(
                "MboppiShop est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans prix écrasant et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les créateurs exposent leurs talents, juste avec un téléphone et une connexion internet, les vendeurs vendent et gagnent des commissions, et les clients trouvent tout au même endroit avec satisfaction, sans se déplacer."
              )}
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn btn-primary btn-xl">
                {t("Créer un compte gratuit")}
              </Link>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>{t("Comment ça marche ?")}</h2>
              <p>{t("Un rôle pour chacun, une plateforme pour tous.")}</p>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-icon">🏪</div>
                <div className="step-num">1</div>
                <h3>{t("Boutique")}</h3>
                <p>{t("Publiez vos produits et recevez les commandes.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">🎨</div>
                <div className="step-num">2</div>
                <h3>{t("Créateur")}</h3>
                <p>{t("Exposez vos créations et touchez un public plus large.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">🛒</div>
                <div className="step-num">3</div>
                <h3>{t("Vendeur")}</h3>
                <p>{t("Vendez en ligne et gagnez une commission sur chaque vente.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">
                  <Logo className="logo-inline" />
                </div>
                <div className="step-num">4</div>
                <h3>{t("Client")}</h3>
                <p>{t("Commandez en un clic et recevez chez vous avec un livreur.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">🛵</div>
                <div className="step-num">5</div>
                <h3>{t("Livreur")}</h3>
                <p>{t("Livrez les articles commandés et confirmez l'achat.")}</p>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>{t("Nos valeurs")}</h2>
              <p>{t("Ce qui nous pousse chaque jour.")}</p>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-icon">🤝</div>
                <h3>{t("La confiance")}</h3>
                <p>{t("Des commandes simples, des contacts directs avec les vendeurs.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">📱</div>
                <h3>{t("La proximité")}</h3>
                <p>{t("Commander avec son téléphone, sans carte bancaire ni frais cachés.")}</p>
              </div>
              <div className="step">
                <div className="step-icon">⚡</div>
                <h3>{t("La rapidité")}</h3>
                <p>{t("Une plateforme légère, qui s'affiche vite, même en 3G.")}</p>
              </div>
            </div>
          </section>

          <section className="section cta-section">
            <h2>{t("Prêt à rejoindre l'aventure ?")}</h2>
            <p>{t("Créez votre compte gratuitement en moins d'une minute.")}</p>
            <Link to="/register" className="btn btn-primary btn-xl">
              {t("Créer mon compte")}
            </Link>
          </section>
        </>
      )}

      <section ref={produitsRef} aria-label={t("Produits")} style={{ scrollMarginTop: 80 }}>
        <div className="section-head">
          <h2 className="section-title">
            <Logo className="logo-inline" />{" "}
            {ptype === "digital" ? t("Produits digitaux") : t("Produits et créations")}
          </h2>
          {category || minPrice || maxPrice ? (
            <button
              type="button"
              className="section-link"
              onClick={() => {
                setCategory("");
                setMinPrice("");
                setMaxPrice("");
              }}
            >
              ✕ {t("Réinitialiser les filtres")}
            </button>
          ) : null}
        </div>
        {/* Volets « Produits physiques » / « Produits digitaux » : deux familles
            jamais mélangées (filtre serveur + rails filtrés côté client). */}
        {mode === "products" && (
          <div className="ptype-tabs" role="tablist" aria-label={t("Type de produits")}>
            <button
              type="button"
              role="tab"
              aria-selected={ptype === "physical"}
              className={`ptype-tab ${ptype === "physical" ? "active" : ""}`}
              onClick={() => onSelectType("physical")}
            >
              📦 {t("Produits physiques")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ptype === "digital"}
              className={`ptype-tab ${ptype === "digital" ? "active" : ""}`}
              onClick={() => onSelectType("digital")}
            >
              📁 {t("Produits digitaux")}
            </button>
          </div>
        )}
        {browseMode && (
            <>
              <div className="home-tabs-wrap">
                <button
                  type="button"
                  className="tabs-arrow tabs-arrow-left"
                  onClick={() => scrollTabs(-1)}
                  aria-label={t("Défiler vers la gauche")}
                >
                  ‹
                </button>
                <div className="home-tabs" ref={tabsRef}>
                  <button
                    type="button"
                    className={`home-tab t-recent ${activeRail === "recent" ? "active" : ""}`}
                    onClick={() => setActiveRail(activeRail === "recent" ? "" : "recent")}
                  >
                    <span className="tab-emoji">👀</span> <span>{t("Vus récemment")}</span>
                  </button>
                  {fTrending.length > 0 && (
                    <button
                      type="button"
                      className={`home-tab t-trending ${activeRail === "trending" ? "active" : ""}`}
                      onClick={() => setActiveRail(activeRail === "trending" ? "" : "trending")}
                    >
                      <span className="tab-emoji">⚡</span>{" "}
                      <span>{t("Tendances de la semaine")}</span>
                    </button>
                  )}
                  {fBestSellers.length > 0 && (
                    <button
                      type="button"
                      className={`home-tab t-best ${activeRail === "best" ? "active" : ""}`}
                      onClick={() => setActiveRail(activeRail === "best" ? "" : "best")}
                    >
                      <span className="tab-emoji">🔥</span> <span>{t("Meilleures ventes")}</span>
                    </button>
                  )}
                  {fPopular.length > 0 && (
                    <button
                      type="button"
                      className={`home-tab t-popular ${activeRail === "popular" ? "active" : ""}`}
                      onClick={() => setActiveRail(activeRail === "popular" ? "" : "popular")}
                    >
                      <span className="tab-emoji">🔥</span> <span>{t("Plus populaires")}</span>
                    </button>
                  )}
                  {flashPromos.length >= 0 && (
                    <button
                      type="button"
                      className={`home-tab t-flash ${activeRail === "promos" ? "active" : ""}`}
                      onClick={() => setActiveRail(activeRail === "promos" ? "" : "promos")}
                    >
                      <span className="tab-emoji">⚡</span> <span>{t("Promotions du jour")}</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="tabs-arrow tabs-arrow-right"
                  onClick={() => scrollTabs(1)}
                  aria-label={t("Défiler vers la droite")}
                >
                  ›
                </button>
              </div>
              {activeRail === "recent" &&
                (fRecent.length > 0 ? (
                  <ProductRail
                    title={t("Vus récemment")}
                    hint={t("Reprenez là où vous vous étiez arrêté.")}
                    emoji="👀"
                    products={fRecent}
                  />
                ) : (
                  <p className="hint home-tabs-empty">
                    {t("Vous n'avez pas encore consulté de produit.")}
                  </p>
                ))}
              {activeRail === "trending" && fTrending.length > 0 && (
                <ProductRail
                  title={t("Tendances de la semaine")}
                  hint={t("Les produits les plus consultés ces 7 derniers jours.")}
                  emoji="⚡"
                  products={fTrending}
                  badge={{ cls: "badge-hot", text: t("⭐ Populaire") }}
                />
              )}
              {activeRail === "best" && fBestSellers.length > 0 && (
                <ProductRail
                  title={t("Meilleures ventes")}
                  hint={t("Les produits les plus commandés.")}
                  emoji="🔥"
                  products={fBestSellers}
                />
              )}
              {/* Rail « Nouveautés » toujours visible (max 10, glissable). */}
              {fNewArrivals.length > 0 && (
                <ProductRail
                  title={t("Nouveautés")}
                  hint={t("Les derniers produits publiés sur MboppiShop.")}
                  emoji="✨"
                  products={fNewArrivals}
                />
              )}
              {activeRail === "popular" && fPopular.length > 0 && (
                <ProductRail
                  title={t("Plus populaires")}
                  hint={t("Les produits les plus consultés et commandés.")}
                  emoji="🔥"
                  products={fPopular}
                />
              )}
              {activeRail === "promos" &&
                (flashPromos.length > 0 ? (
                  <RailShell
                    title={t("Promotions du jour")}
                    hint={t("Des offres à durée limitée : dépêchez-vous !")}
                    emoji="⚡"
                    ariaLabel={t("Promotions du jour")}
                  >
                    {flashPromos.map((pr) => (
                      <FlashPromoCard key={pr.id} promo={pr} />
                    ))}
                  </RailShell>
                ) : (
                  <p className="hint home-tabs-empty">
                    {t(
                      "Aucune promotion du jour pour le moment. Les boutiques peuvent en lancer une depuis leur espace."
                    )}
                  </p>
                ))}
            </>
          )}
        <form
          className="hero-search"
          onSubmit={submitSearch}
          role="search"
          onKeyDown={onSugKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setSugOpen(false);
              setSugActive(-1);
            }
          }}
        >
          <span className="emoji" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            placeholder={t("Rechercher un produit, une boutique…")}
            aria-label={t("Rechercher un produit, une boutique…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSugKeyDown}
          />
          <button type="submit" className="btn btn-primary">
            {t("Rechercher")}
          </button>
          {sugOpen && (
            <div className="search-suggest" role="listbox" aria-label={t("Suggestions")}>
              {sugLoading && <div className="search-suggest-empty">{t("Recherche…")}</div>}
              {sugItems.map((it, i) => (
                <Link
                  key={`${it.kind}-${it.id}`}
                  ref={(el) => {
                    sugRefs.current[i] = el;
                  }}
                  role="option"
                  aria-selected={sugActive === i}
                  className={`search-suggest-item${sugActive === i ? " active" : ""}`}
                  to={it.url}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSugOpen(false);
                    setSugActive(-1);
                  }}
                >
                  {it.image && <img src={it.image} alt="" loading="lazy" />}
                  <span className="search-suggest-body">
                    <span className="search-suggest-title">{it.title}</span>
                    <span className="search-suggest-sub">
                      {it.kind === "shop" ? <>🏪 {it.sub}</> : it.sub}
                    </span>
                  </span>
                  {it.kind === "product" && (
                    <span className="search-suggest-price">
                      {formatMoney(it.price)} {currencySymbol(it.currency)}
                    </span>
                  )}
                </Link>
              ))}
              <button
                type="submit"
                className="search-suggest-all"
                onClick={() => setSugOpen(false)}
              >
                {t("Voir tous les résultats")} →
              </button>
            </div>
          )}
        </form>
        <div className="view-switch">
          <button
            type="button"
            className={`btn ${mode === "products" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode("products")}
          >
            <Logo className="logo-inline" /> {t("Voir tous les produits")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "city" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setMode("city")}
          >
            📍 {t("Voir par ville")}
          </button>
        </div>
        <div className="toolbar filter-toolbar">
          <select
            className="input filter-select"
            value={category}
            onChange={changeFilter(setCategory)}
            aria-label={t("Filtrer par catégorie")}
          >
            <option value="">{t("Toutes les catégories")}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
          <select
            className="input filter-select"
            value={sort}
            onChange={changeFilter(setSort)}
            aria-label={t("Trier")}
          >
            <option value="recent">{t("Plus récents")}</option>
            <option value="popular">{t("🔥 Plus populaires")}</option>
            <option value="rating">{t("⭐ Mieux notés")}</option>
            <option value="price_asc">{t("Prix croissant")}</option>
            <option value="price_desc">{t("Prix décroissant")}</option>
          </select>
          <input
            className="input filter-price"
            type="number"
            min="0"
            placeholder={t("Prix min")}
            aria-label={t("Prix minimum")}
            value={minPrice}
            onChange={changeFilter(setMinPrice)}
          />
          <input
            className="input filter-price"
            type="number"
            min="0"
            placeholder={t("Prix max")}
            aria-label={t("Prix maximum")}
            value={maxPrice}
            onChange={changeFilter(setMaxPrice)}
          />
          <select
            className="input filter-select"
            value={scope}
            onChange={changeFilter(setScope)}
            aria-label={t("Type de recherche")}
          >
            <option value="product">{t("Rechercher un produit")}</option>
            <option value="shop">{t("Rechercher une boutique")}</option>
            <option value="creation">{t("Rechercher une création")}</option>
          </select>
        </div>
        {geoCountry && mode === "products" && !debouncedSearch && !category && (
          <div className="geo-banner" role="region" aria-label={t("Produits locaux")}>
            <span>
              📍 {localOnly ? t("Produits de") + " " + geoCountry + " " + t("en premier") : t("Tous les produits, partout")}
            </span>
            <button
              type="button"
              className="btn btn-small btn-outline"
              onClick={() => setLocalOnly((v) => !v)}
            >
              {localOnly ? t("Tout voir") : `🌍 ${t("Voir d'abord")} ${geoCountry}`}
            </button>
          </div>
        )}
        {error && mode === "products" && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {mode === "city" ? (
          <div className="city-shops">
            <form
              className="city-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setCity(cityInput.trim());
              }}
            >
              <input
                type="search"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                placeholder={t("Saisir une ville (ex : Yaoundé)…")}
                aria-label={t("Saisir une ville")}
              />
              <button type="submit" className="btn btn-primary">
                {t("Rechercher")}
              </button>
            </form>
            {city ? (
              shopsLoading ? (
                <p className="muted">{t("Chargement…")}</p>
              ) : shopsError ? (
                <p className="error" role="alert">
                  {shopsError}
                </p>
              ) : shops.length === 0 && cityProducts.length === 0 ? (
                <p className="empty">
                  {t("Aucune boutique ni produit dans cette ville pour le moment.")}
                </p>
              ) : (
                <>
                  {shops.length > 0 && (
                    <section aria-label={t("Boutiques et créateurs")}>
                      <h3 className="section-title">🏪 {t("Boutiques et créateurs")}</h3>
                      <div className="grid shops-grid">
                        {shops.map((s) => (
                          <Link
                            key={s.id}
                            to={s.role === "creator" ? `/createur/${s.id}` : `/boutique/${s.id}`}
                            className="card shop-card"
                          >
                            <div className="shop-thumb">
                              {s.sample_image ? (
                                <img
                                  src={s.sample_image}
                                  alt={s.name}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <span>{s.role === "creator" ? "🎨" : "🏪"}</span>
                              )}
                            </div>
                            <div className="shop-body">
                              <h3>
                                {s.name}
                                {s.verified && (
                                  <span className="badge">✓ {t("Boutique vérifiée")}</span>
                                )}
                              </h3>
                              <p>
                                📍{" "}
                                {[s.city, s.location].filter(Boolean).join(", ") ||
                                  t("Ville non renseignée")}
                              </p>
                              <p className="muted">
                                {t("{n} produits", { n: s.product_count || 0 })}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                  {fCityProducts.length > 0 && (
                    <section aria-label={t("Produits")}>
                      <h3 className="section-title">
                        <Logo className="logo-inline" /> {t("Produits")}
                      </h3>
                      <div className="grid">
                        {fCityProducts.map((p) => (
                          <ProductCard key={p.id} product={p} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )
            ) : (
              <p className="muted">
                {t("Saisissez une ville pour voir ses boutiques, ses créateurs et ses produits.")}
              </p>
            )}
          </div>
        ) : (loading || loadedFamily !== ptype) && displayProducts.length === 0 ? (
          <div className="grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card product-card skeleton" aria-hidden="true">
                <div className="skeleton-block skeleton-photo"></div>
              </div>
            ))}
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="card page-center">
            <p className="empty">
              {category
                ? t("Aucun produit dans cette catégorie.")
                : search
                  ? t("Aucun résultat pour votre recherche.")
                  : ptype === "digital"
                    ? t("Aucun produit digital pour le moment.")
                    : t("Aucun produit disponible.")}
            </p>
          </div>
        ) : browseMode ? (
          <>
            {productRows.map((row, ri) => (
              <RailShell key={ri} ariaLabel={`${t("Produits et créations")} — ${ri + 1}`}>
                {row.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </RailShell>
            ))}
            <div className="load-more-wrap">
              {page > 0 && (
                <button
                  className="btn btn-outline"
                  disabled={loadingMore}
                  onClick={() => goToPage(page - 1)}
                >
                  ← {t("Page précédente")}
                </button>
              )}
              {hasMore && (
                <button
                  className="btn btn-primary"
                  disabled={loadingMore}
                  onClick={() => goToPage(page + 1)}
                >
                  {loadingMore ? "…" : `${t("Page suivante")} →`}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid">
              {displayProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {hasMore && (
              <div className="load-more-wrap">
                <button className="btn btn-outline" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "…" : `⬇️ ${t("Voir plus de produits")}`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
