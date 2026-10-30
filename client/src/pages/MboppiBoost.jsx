import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

const MONEY = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(n) || 0) + " FCFA";

const PLATFORMS = {
  1: "Instagram",
  2: "TikTok",
  3: "YouTube",
  4: "Telegram",
  5: "Facebook",
  6: "Twitter / X",
  7: "Spotify",
};

const PLATFORM_KEY_BY_CATEGORY = {
  1: "instagram",
  2: "tiktok",
  3: "youtube",
  4: "telegram",
  5: "facebook",
  6: "twitter",
  7: "spotify",
};

const PLATFORM_LABELS = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  telegram: "Telegram",
  facebook: "Facebook",
  twitter: "Twitter / X",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  twitch: "Twitch",
  shopee: "Shopee",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  discord: "Discord",
  threads: "Threads",
  bluesky: "Bluesky",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  other: "Autres",
};

const PLATFORM_EMOJI = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  telegram: "✈️",
  facebook: "👤",
  twitter: "🐦",
  spotify: "🎧",
  soundcloud: "🎶",
  twitch: "🎮",
  shopee: "🛍️",
  linkedin: "💼",
  reddit: "👽",
  discord: "💬",
  threads: "🧵",
  bluesky: "🦋",
  snapchat: "👻",
  pinterest: "📌",
  other: "🎯",
};

const PLATFORM_ACCENTS = {
  instagram: "tw-from-fuchsia-500 tw-via-pink-500 tw-to-orange-400",
  tiktok: "tw-from-slate-900 tw-via-slate-700 tw-to-cyan-400",
  youtube: "tw-from-red-600 tw-to-rose-500",
  telegram: "tw-from-sky-500 tw-to-blue-600",
  facebook: "tw-from-blue-600 tw-to-indigo-600",
  twitter: "tw-from-slate-800 tw-to-slate-600",
  spotify: "tw-from-emerald-500 tw-to-green-600",
  soundcloud: "tw-from-orange-500 tw-to-rose-500",
  twitch: "tw-from-violet-600 tw-to-purple-500",
  shopee: "tw-from-orange-500 tw-to-amber-400",
  linkedin: "tw-from-sky-600 tw-to-blue-700",
  reddit: "tw-from-orange-600 tw-to-red-500",
  discord: "tw-from-indigo-500 tw-to-violet-600",
  threads: "tw-from-slate-900 tw-to-slate-600",
  bluesky: "tw-from-sky-400 tw-to-blue-500",
  snapchat: "tw-from-yellow-400 tw-to-amber-500",
  pinterest: "tw-from-red-600 tw-to-rose-600",
  other: "tw-from-violet-500 tw-to-indigo-600",
};

const PAGE_SIZE = 24;

const S = (id, cid, icon, name, desc, price, min) => ({
  id,
  cat: String(cid),
  icon,
  name,
  desc,
  unit: price,
  unitLabel: "1000",
  billingUnit: 1000,
  platformName: PLATFORMS[cid] || "Autre",
  step: 1,
  min: Math.max(min, price > 0 ? Math.ceil((500 * 1000) / price) : min),
});

const DEFAULT_CATALOG = [
  S(1,1,"📸","Instagram Followers","Augmentez le nombre de followers de votre profil Instagram.",450,10),
  S(2,1,"📸","Instagram Likes","Likes sur vos posts et reels Instagram.",120,10),
  S(3,1,"📸","Instagram Views","Vues sur vos vidéos et posts Instagram.",8,100),
  S(4,1,"📸","Instagram Saves","Enregistrements de vos publications Instagram.",300,10),
  S(5,1,"📸","Instagram Shares","Partages de vos publications Instagram.",250,10),
  S(6,1,"📸","Instagram Story Views","Vues sur vos stories Instagram.",50,100),
  S(7,1,"📸","Instagram Reach & Impressions","Portée et impressions de vos publications.",60,100),
  S(8,1,"📸","Instagram Comments","Commentaires personnalisés sur vos posts.",4000,5),
  S(9,1,"📸","Instagram Reels Views","Vues sur vos Reels Instagram.",10,100),
  S(10,2,"🎵","TikTok Followers","Augmentez vos followers TikTok.",500,10),
  S(11,2,"🎵","TikTok Likes","Likes sur vos vidéos TikTok.",90,10),
  S(12,2,"🎵","TikTok Views","Vues sur vos vidéos TikTok.",5,100),
  S(13,2,"🎵","TikTok Comments","Commentaires sur vos vidéos TikTok.",4500,5),
  S(14,2,"🎵","TikTok Shares","Partages de vos vidéos TikTok.",300,10),
  S(15,2,"🎵","TikTok Saves","Enregistrements de vos vidéos TikTok.",200,10),
  S(16,3,"▶️","YouTube Subscribers","Abonnés pour votre chaîne YouTube.",1500,10),
  S(17,3,"▶️","YouTube Views","Vues sur vos vidéos YouTube.",40,100),
  S(18,3,"▶️","YouTube Likes","Likes sur vos vidéos YouTube.",250,10),
  S(19,3,"▶️","YouTube Comments","Commentaires sur vos vidéos YouTube.",5000,5),
  S(20,3,"▶️","YouTube Watch Hours","Heures de visionnage pour la monétisation.",3000,1),
  S(21,4,"✈️","Telegram Members","Membres pour votre canal/groupe Telegram.",600,10),
  S(22,4,"✈️","Telegram Post Views","Vues sur vos publications Telegram.",30,100),
  S(23,4,"✈️","Telegram Reactions","Réactions sur vos messages Telegram.",200,10),
  S(24,5,"👤","Facebook Followers","Followers pour votre page Facebook.",400,10),
  S(25,5,"👤","Facebook Page Likes","Likes de votre page Facebook.",350,10),
  S(26,5,"👤","Facebook Post Likes","Likes sur vos publications Facebook.",150,10),
  S(27,5,"👤","Facebook Video Views","Vues sur vos vidéos Facebook.",15,100),
  S(28,6,"🐦","X Followers","Followers pour votre compte X.",700,10),
  S(29,6,"🐦","X Likes","Likes sur vos tweets.",180,10),
  S(30,6,"🐦","X Views","Vues sur vos tweets.",25,100),
  S(31,6,"🐦","X Retweets","Retweets de vos publications.",400,10),
  S(32,7,"🎧","Spotify Followers","Followers pour votre artiste Spotify.",1200,10),
  S(33,7,"🎧","Spotify Monthly Listeners","Auditeurs mensuels Spotify.",2000,100),
  S(34,7,"🎧","Spotify Track Plays","Écoutes sur vos titres Spotify.",30,100),
];

function IconSearch({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowRight({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShield({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-2.8 8.2-7 10-4.2-1.8-7-5.5-7-10V6l7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpark({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 13.7 9l6.3 1.7-6.3 1.6L12 19l-1.7-6.7L4 10.7 10.3 9 12 2.5Z" />
      <path d="M19 16.5 19.8 19l2.2.8-2.2.7-.8 2.5-.7-2.5-2.3-.7 2.3-.8.7-2.5Z" opacity=".7" />
    </svg>
  );
}

function IconChevron({ className = "tw-h-4 tw-w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoostSelect({
  id,
  value,
  options = [],
  onChange,
  placeholder = "Sélectionner…",
  ariaLabel,
  disabled = false,
  renderValue,
  renderOption,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedIndex = options.findIndex((option) => String(option.value) === String(value));
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const target = selectedIndex >= 0 ? selectedIndex : 0;
    const frame = requestAnimationFrame(() => optionRefs.current[target]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, selectedIndex]);

  const focusOption = (index) => {
    const count = options.length;
    if (!count) return;
    const next = ((index % count) + count) % count;
    optionRefs.current[next]?.focus();
  };

  const choose = (nextValue) => {
    setOpen(false);
    onChange(nextValue);
    toggleRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={`boost-dropdown ${open ? "boost-dropdown-open" : ""}`}>
      <button
        type="button"
        id={id}
        ref={toggleRef}
        className="boost-dropdown-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={`boost-dropdown-value ${selected ? "" : "boost-dropdown-placeholder"}`}>
          {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
        </span>
        <IconChevron className="boost-dropdown-chevron" />
      </button>

      {open && (
        <ul role="listbox" className="boost-dropdown-panel" aria-label={ariaLabel}>
          {options.length === 0 ? (
            <li className="boost-dropdown-empty">{placeholder}</li>
          ) : (
            options.map((option, index) => {
              const isActive = String(option.value) === String(value);
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    role="option"
                    aria-selected={isActive}
                    className={`boost-dropdown-option ${isActive ? "is-active" : ""}`}
                    onClick={() => choose(option.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusOption(index + 1);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        focusOption(index - 1);
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        focusOption(0);
                      } else if (event.key === "End") {
                        event.preventDefault();
                        focusOption(options.length - 1);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                        toggleRef.current?.focus();
                      }
                    }}
                  >
                    {renderOption ? renderOption(option, isActive) : option.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

export default function MboppiBoost() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const configRef = useRef(null);
  const [categories, setCategories] = useState(null);
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mboppi_boost_favorites") || "[]"); } catch { return []; }
  });
  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mboppi_boost_recent") || "[]"); } catch { return []; }
  });
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [target, setTarget] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState(() => user?.email || "");
  const [phone, setPhone] = useState(() => user?.phone || "");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user) return;
    setEmail((current) => current || user.email || "");
    setPhone((current) => current || user.phone || "");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    api
      .smmCategories()
      .then((resp) => {
        if (cancelled) return;
        const cats = resp.categories || [];
        setCategories(cats.length ? cats : null);
      })
      .catch((err) => {
        console.error("[MboppiBoost] Erreur récupération catégories :", err?.message);
        if (!cancelled) setCategories(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    api
      .smmServices({
        page,
        limit: PAGE_SIZE,
        search,
        category_id: categoryFilter !== "all" ? categoryFilter : undefined,
        platform: platformFilter !== "all" ? platformFilter : undefined,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
      })
      .then((resp) => {
        if (cancelled) return;
        const list = resp.services || [];
        setServices(list);
        setCatalogTotal(Number(resp.pagination?.total) || 0);
        setCatalogTotalPages(Math.max(1, Number(resp.pagination?.total_pages) || 1));
        const appliedPage = Number(resp.pagination?.page);
        if (Number.isFinite(appliedPage) && appliedPage !== page) setPage(appliedPage);
      })
      .catch((err) => {
        console.error("[MboppiBoost] Erreur récupération services :", err?.message);
        if (cancelled) return;
        setServices(null);
        setCatalogTotal(0);
        setCatalogTotalPages(1);
      })
      .finally(() => {
        if (cancelled) return;
        setServicesLoading(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, search, categoryFilter, platformFilter, minPrice, maxPrice]);

  const useFallback = services === null;
  const fallbackCategorySource = useMemo(() => {
    const map = new Map();
    for (const service of DEFAULT_CATALOG) {
      if (!map.has(service.cat)) {
        map.set(service.cat, {
          id: Number(service.cat),
          name: PLATFORMS[service.cat] || "Autres",
          platform: PLATFORM_KEY_BY_CATEGORY[service.cat] || "other",
          service_count: 0,
        });
      }
      map.get(service.cat).service_count += 1;
    }
    return [...map.values()];
  }, []);

  const platformOptions = useMemo(() => {
    const source = categories && categories.length ? categories : fallbackCategorySource;
    const keys = [...new Set(source.map((category) => category.platform).filter(Boolean))];
    const order = Object.keys(PLATFORM_LABELS);
    keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return [{ value: "all", label: "Toutes les plateformes" }].concat(
      keys.map((key) => ({ value: key, label: PLATFORM_LABELS[key] || key }))
    );
  }, [categories, fallbackCategorySource]);

  const catOptions = useMemo(() => {
    const source = categories && categories.length ? categories : fallbackCategorySource;
    const list = source.filter(
      (category) => platformFilter === "all" || category.platform === platformFilter
    );
    list.sort((a, b) =>
      platformFilter === "all"
        ? (Number(b.service_count) || 0) - (Number(a.service_count) || 0)
        : String(a.name).localeCompare(String(b.name))
    );
    const limited = platformFilter === "all" ? list.slice(0, 80) : list;
    return [{ value: "all", label: "Toutes les catégories" }].concat(
      limited.map((category) => ({ value: String(category.id), label: category.name }))
    );
  }, [categories, fallbackCategorySource, platformFilter]);

  const catalog = useMemo(() => {
    if (useFallback) return [];
    const categoryById = new Map((categories || []).map((category) => [String(category.id), category]));
    return services.map((service) => {
      const minimumTotalQty = Number(service.min_total_quantity);
      const category = categoryById.get(String(service.category_id));
      const platform =
        service.platform || PLATFORM_KEY_BY_CATEGORY[service.category_id] || "other";
      return {
        id: service.id,
        cat: String(service.category_id),
        icon: category?.icon || "🎯",
        name: service.name,
        desc: service.short_description || service.category_name || "",
        unit: Number(service.price) || 0,
        unitLabel: String(service.billing_unit || 1000),
        billingUnit: Number(service.billing_unit) > 0 ? Number(service.billing_unit) : 1000,
        platform,
        platformLabel: PLATFORM_LABELS[platform] || platform,
        platformName: service.category_name || category?.name || "Autre",
        step: 1,
        min: Math.max(
          Number(service.limits?.min) || 1,
          Number.isFinite(minimumTotalQty) && minimumTotalQty > 0 ? minimumTotalQty : 1
        ),
        max: Number(service.limits?.max) || 0,
      };
    });
  }, [useFallback, services, categories]);

  const fallbackFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return DEFAULT_CATALOG.filter((service) => {
      const platform = PLATFORM_KEY_BY_CATEGORY[service.cat] || "other";
      if (platformFilter !== "all" && platform !== platformFilter) return false;
      if (categoryFilter !== "all" && String(service.cat) !== String(categoryFilter)) return false;
      if (needle && !`${service.name} ${service.desc}`.toLowerCase().includes(needle)) return false;
      const mn = Number(minPrice);
      const mx = Number(maxPrice);
      if (Number.isFinite(mn) && mn >= 0 && service.unit < mn) return false;
      if (Number.isFinite(mx) && mx >= 0 && service.unit > mx) return false;
      if (favoritesOnly && !favorites.includes(service.id)) return false;
      return true;
    }).map((service) => {
      const platform = PLATFORM_KEY_BY_CATEGORY[service.cat] || "other";
      return {
        ...service,
        platform,
        platformLabel: PLATFORM_LABELS[platform] || platform,
      };
    });
  }, [categoryFilter, platformFilter, search]);

  const fallbackPage = Math.min(
    page,
    Math.max(1, Math.ceil(fallbackFiltered.length / PAGE_SIZE))
  );
  const baseCatalog = useFallback
    ? fallbackFiltered.slice((fallbackPage - 1) * PAGE_SIZE, fallbackPage * PAGE_SIZE)
    : catalog;
  const displayCatalog = favoritesOnly
    ? baseCatalog.filter((s) => favorites.some((f) => String(f) === String(s.id)))
    : baseCatalog;
  const displayTotal = useFallback ? fallbackFiltered.length : catalogTotal;
  const displayTotalPages = useFallback
    ? Math.max(1, Math.ceil(fallbackFiltered.length / PAGE_SIZE))
    : catalogTotalPages;
  const catalogCategoryCount =
    (categories && categories.length) || fallbackCategorySource.length;

  useEffect(() => {
    if (page > displayTotalPages) setPage(displayTotalPages);
  }, [page, displayTotalPages]);

  useEffect(() => {
    if (categoryFilter !== "all" && !catOptions.some((option) => option.value === categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [catOptions, categoryFilter]);

  const selected = useMemo(() => {
    const found = displayCatalog.find((service) => String(service.id) === String(selectedId));
    return found || displayCatalog[0] || null;
  }, [displayCatalog, selectedId]);

  useEffect(() => {
    if (!displayCatalog.length) return;
    if (!displayCatalog.some((service) => String(service.id) === String(selectedId))) {
      setSelectedId(displayCatalog[0].id);
    }
  }, [displayCatalog, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setQuantity(selected.min || 1);
  }, [selected?.id]);
  const handleSubmit = () => {
    setResult(null);
    if (!selected) return;
    const q = Number.parseInt(quantity || "0", 10);
    const min = Number(selected.min) || 1;
    const max = Number(selected.max) || 0;
    if (!String(target).trim()) {
      setResult({ type: "warn", message: "Renseignez le lien ou le compte cible avant de continuer." });
      return;
    }
    if (!Number.isInteger(q) || q < min) {
      setResult({ type: "warn", message: `La quantité minimale pour ce service est de ${min}.` });
      return;
    }
    if (max > 0 && q > max) {
      setResult({ type: "warn", message: `La quantité maximale pour ce service est de ${max}.` });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResult({ type: "warn", message: "L'adresse e-mail saisie n'est pas valide." });
      return;
    }
    const params = new URLSearchParams({ quantity: String(q), target: target.trim() });
    if (email.trim()) params.set("email", email.trim());
    if (phone.trim()) params.set("phone", phone.trim());
    if (details.trim()) params.set("details", details.trim());
    navigate(`/mboppi-boost/commander/${selected.id}?${params.toString()}`);
  };

  const orderTotal = selected
    ? Math.round((((Number(quantity) || 0) * selected.unit) / (selected.billingUnit || 1000)) * 100) / 100
    : 0;

  const onCategoryChange = (val) => {
    setCategoryFilter(val);
    setPage(1);
  };

  const onPlatformChange = (val) => {
    setPlatformFilter(val);
    setCategoryFilter("all");
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategoryFilter("all");
    setPlatformFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setFavoritesOnly(false);
    setPage(1);
  };

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = prev.some((f) => String(f) === String(id))
        ? prev.filter((f) => String(f) !== String(id))
        : [...prev, id];
      try { localStorage.setItem("mboppi_boost_favorites", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const trackRecent = (id) => {
    setRecentIds((prev) => {
      const filtered = prev.filter((f) => String(f) !== String(id));
      const next = [id, ...filtered].slice(0, 8);
      try { localStorage.setItem("mboppi_boost_recent", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const scrollToConfig = () => {
    configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedAccent = PLATFORM_ACCENTS[selected?.platform] || PLATFORM_ACCENTS.other;
  const activeFilterCount =
    (search ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (platformFilter !== "all" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (favoritesOnly ? 1 : 0);

  return (
    <main className="boost-page">
      <Seo title="MboppiBoost — Commandes de services digitaux" description="MboppiBoost : sélectionnez un service de marketing digital, configurez votre besoin et consultez le montant estimé avant validation." />

      <div className="boost-shell">
        <section className="boost-hero boost-fade-up">
          <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
          <span className="boost-orb boost-orb-a" aria-hidden="true" />
          <span className="boost-orb boost-orb-b" aria-hidden="true" />
          <div className="boost-hero-inner">
            <div className="tw-min-w-0">
              <span className="boost-eyebrow">
                <IconSpark className="tw-h-3.5 tw-w-3.5 tw-flex-none tw-text-cyan-300" />
                MboppiBoost
              </span>
              <h1 className="boost-title">
                Faites décoller <span className="boost-title-accent">votre présence digitale.</span>
              </h1>
              <p className="boost-lead">
                Des services de croissance pour Instagram, TikTok, YouTube et bien plus.
                Choisissez votre offre, configurez votre commande et payez en ligne en toute
                sécurité.
              </p>
              <div className="tw-mt-6 tw-flex tw-flex-wrap tw-gap-2">
                <span className="boost-chip">📸 Instagram</span>
                <span className="boost-chip">🎵 TikTok</span>
                <span className="boost-chip">▶️ YouTube</span>
                <span className="boost-chip">🐦 X / Twitter</span>
              </div>
              <div className="tw-mt-8 tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row">
                <button type="button" onClick={scrollToConfig} className="boost-btn boost-btn-light">
                  Configurer ma commande
                  <IconArrowRight />
                </button>
                <Link to="/mboppi-boost/portefeuille" className="boost-btn boost-btn-ghost">
                  Mon portefeuille
                </Link>
                <Link to="/mboppi-boost/mes-commandes" className="boost-btn boost-btn-ghost">
                  Suivre une commande
                </Link>
              </div>
              <div className="tw-mt-7 tw-flex tw-flex-wrap tw-gap-x-5 tw-gap-y-3">
                <span className="boost-hero-note"><IconCheck className="tw-h-3.5 tw-w-3.5 tw-text-emerald-300" /> Paiement sécurisé</span>
                <span className="boost-hero-note"><IconCheck className="tw-h-3.5 tw-w-3.5 tw-text-emerald-300" /> Suivi en temps réel</span>
                <span className="boost-hero-note"><IconCheck className="tw-h-3.5 tw-w-3.5 tw-text-emerald-300" /> Support dédié</span>
              </div>
            </div>

            <div className="boost-glass">
              <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                <div>
                  <p className="boost-stat-label">Aperçu de la commande</p>
                  <p className="tw-mt-1 tw-text-sm tw-font-semibold tw-text-slate-200">Votre sélection</p>
                </div>
                <span className="boost-glass-badge">En ligne</span>
              </div>
              <div className="tw-mt-5 tw-space-y-2.5">
                <div className="boost-stat">
                  <span className="boost-stat-label">Services disponibles</span>
                  <span className="boost-stat-value">{displayTotal}</span>
                </div>
                <div className="boost-stat">
                  <span className="boost-stat-label">Catégories</span>
                  <span className="boost-stat-value">{catalogCategoryCount}</span>
                </div>
                <div className="boost-stat">
                  <span className="boost-stat-label">Total estimé</span>
                  <span className="boost-stat-value">{MONEY(orderTotal)}</span>
                </div>
              </div>
              <div className="tw-mt-4 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-slate-950/40 tw-p-3">
                <div className="tw-flex tw-items-center tw-gap-3">
                  <span className={`tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-gradient-to-br tw-text-lg tw-text-white tw-shadow-sm ${selectedAccent}`}>
                    {selected?.icon || "⚡"}
                  </span>
                  <div className="tw-min-w-0">
                    <p className="tw-truncate tw-text-xs tw-font-bold tw-text-white">
                      {selected?.name || "Sélectionnez un service"}
                    </p>
                    <p className="tw-truncate tw-text-[11px] tw-text-slate-400">
                      {selected
                        ? `${selected.platformLabel} · ${MONEY(selected.unit)} / ${selected.unitLabel}`
                        : "Choisissez une offre dans le catalogue"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="tw-mt-4 tw-flex tw-items-center tw-gap-2 tw-text-[10px] tw-font-semibold tw-text-slate-400">
                <IconShield className="tw-h-3.5 tw-w-3.5 tw-text-emerald-300" />
                Paiement protégé par iKeePay
              </div>
            </div>
          </div>
        </section>

        <section ref={configRef} id="boost-config" className="tw-mt-12 tw-scroll-mt-24">
          <div className="tw-flex tw-flex-col tw-gap-4 sm:tw-flex-row sm:tw-items-end sm:tw-justify-between">
            <div>
              <p className="boost-kicker">Catalogue MboppiBoost</p>
              <h2 className="boost-section-title">Configurez votre commande</h2>
              <p className="boost-section-lead">
                Choisissez un service, indiquez votre cible et vos coordonnées. Le montant se met à
                jour automatiquement avant validation.
              </p>
            </div>
            <div className="boost-trust-pill">
              <IconShield className="tw-h-3.5 tw-w-3.5" />
              Commande sécurisée
            </div>
          </div>

          <div className="tw-mt-6 tw-grid tw-gap-6 lg:tw-grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:tw-items-start">
            <div className="tw-space-y-5">
              <div className="boost-card boost-card-pad">
            <div className="tw-grid tw-gap-4 lg:tw-grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div>
                <label htmlFor="boost-search" className="boost-label">Rechercher un service</label>
                <div className="tw-relative">
                  <span className="boost-search-icon">
                    <IconSearch />
                  </span>
                  <input
                    id="boost-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Ex. followers, vues, likes, abonnés..."
                    className="boost-input boost-input-search"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="boost-category" className="boost-label tw-hidden sm:tw-flex">Catégorie</label>
                <label htmlFor="boost-category-mobile" className="boost-label sm:tw-hidden">Catégorie</label>
                <select
                  id="boost-category"
                  aria-label="Catégorie"
                  value={categoryFilter}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="boost-input boost-select tw-hidden sm:tw-block"
                >
                  {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="sm:tw-hidden">
                  <BoostSelect
                    id="boost-category-mobile"
                    value={categoryFilter}
                    options={catOptions}
                    onChange={onCategoryChange}
                    ariaLabel="Catégorie"
                  />
                </div>
              </div>
            </div>

            <div className="tw-mt-4">
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                <span className="boost-label tw-mb-0">Plateformes</span>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={resetFilters} className="boost-link">
                    Réinitialiser
                  </button>
                )}
              </div>
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">
                {platformOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onPlatformChange(o.value)}
                    className={`boost-pill ${platformFilter === o.value ? "boost-pill-active" : ""}`}
                    aria-pressed={platformFilter === o.value}
                  >
                    {o.value !== "all" && <span aria-hidden="true">{PLATFORM_EMOJI[o.value] || "🎯"}</span>}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tw-mt-4 tw-grid tw-gap-3 sm:tw-grid-cols-2">
              <div>
                <label htmlFor="boost-min-price" className="boost-label">Prix min (FCFA)</label>
                <input
                  id="boost-min-price"
                  type="number"
                  min="0"
                  value={minPrice}
                  onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
                  placeholder="0"
                  className="boost-input"
                />
              </div>
              <div>
                <label htmlFor="boost-max-price" className="boost-label">Prix max (FCFA)</label>
                <input
                  id="boost-max-price"
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
                  placeholder="∞"
                  className="boost-input"
                />
              </div>
            </div>

            <div className="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">
              <button
                type="button"
                onClick={() => { setFavoritesOnly((v) => !v); setPage(1); }}
                className={`boost-pill ${favoritesOnly ? "boost-pill-active" : ""}`}
                aria-pressed={favoritesOnly}
              >
                ★ Favoris {favorites.length ? `(${favorites.length})` : ""}
              </button>
              {recentIds.length > 0 && (
                <span className="boost-muted tw-text-[11px] tw-self-center">
                  Récents : {recentIds.length}
                </span>
              )}
            </div>

            {recentIds.length > 0 && (
              <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
                {recentIds.map((rid) => {
                  const svc = baseCatalog.find((s) => String(s.id) === String(rid));
                  if (!svc) return null;
                  return (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => { setSelectedId(svc.id); setQuantity(svc.min || 1); }}
                      className="boost-pill"
                    >
                      {svc.icon} {svc.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="boost-card boost-card-pad">
            <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
              <div>
                <h3 className="boost-card-title">Choisissez un service</h3>
                <p className="boost-hint tw-mt-1">Sélectionnez l'offre qui correspond à votre objectif.</p>
              </div>
              <span className="boost-count">{displayTotal}</span>
            </div>

            <div className="tw-mt-4">
              <label htmlFor="boost-service-select" className="boost-label">Service</label>
              <BoostSelect
                id="boost-service-select"
                value={selected?.id ?? ""}
                options={displayCatalog.map((service) => ({
                  value: service.id,
                  label: service.name,
                  service,
                }))}
                onChange={(value) => {
                  const service = displayCatalog.find((item) => String(item.id) === String(value));
                  if (!service) return;
                  setSelectedId(service.id);
                  setQuantity(service.min || 1);
                  trackRecent(service.id);
                }}
                placeholder={servicesLoading ? "Chargement des services…" : "Choisissez un service…"}
                disabled={loading || servicesLoading || displayCatalog.length === 0}
                ariaLabel="Choisissez un service"
                renderValue={(option) => (
                  <span className="boost-dropdown-value-main">
                    <span
                      className={`boost-dropdown-value-icon tw-bg-gradient-to-br ${PLATFORM_ACCENTS[option.service.platform] || PLATFORM_ACCENTS.other}`}
                      aria-hidden="true"
                    >
                      {option.service.icon}
                    </span>
                    <span className="boost-dropdown-value-text">
                      <span className="boost-dropdown-value-name">{option.service.name}</span>
                      <span className="boost-dropdown-value-meta">
                        {option.service.platformLabel} · {MONEY(option.service.unit)} / {option.service.unitLabel}
                      </span>
                    </span>
                  </span>
                )}
                renderOption={(option, isActive) => (
                  <span className="boost-dropdown-option-main">
                    <span
                      className={`boost-dropdown-option-icon tw-bg-gradient-to-br ${PLATFORM_ACCENTS[option.service.platform] || PLATFORM_ACCENTS.other}`}
                      aria-hidden="true"
                    >
                      {option.service.icon}
                    </span>
                    <span className="boost-dropdown-option-text">
                      <span className="boost-dropdown-option-name">{option.service.name}</span>
                      <span className="boost-dropdown-option-meta">
                        {option.service.platformLabel} · {MONEY(option.service.unit)} / {option.service.unitLabel}
                      </span>
                    </span>
                    {isActive && <span className="boost-dropdown-tick" aria-hidden="true">✓</span>}
                  </span>
                )}
              />
            </div>

            {loading ? (
              <div className="tw-mt-4 tw-grid tw-gap-3 sm:tw-grid-cols-2 xl:tw-grid-cols-3" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="boost-skeleton" />
                ))}
              </div>
            ) : displayCatalog.length === 0 ? (
              <div className="boost-empty">
                <span className="boost-empty-icon" aria-hidden="true">🔎</span>
                <p className="boost-empty-title">
                  {servicesLoading ? "Chargement des services…" : "Aucun service ne correspond à votre recherche."}
                </p>
                <p className="boost-hint">Essayez un autre mot-clé ou réinitialisez les filtres.</p>
                <button type="button" onClick={resetFilters} className="boost-btn boost-btn-secondary tw-mt-4">
                  Effacer les filtres
                </button>
              </div>
            ) : (
              <div
                className={`tw-mt-4 tw-grid tw-gap-3 sm:tw-grid-cols-2 xl:tw-grid-cols-3 ${servicesLoading ? "boost-is-loading" : ""}`}
                aria-busy={servicesLoading}
              >
                {displayCatalog.map((s) => {
                  const isActive = String(selected?.id) === String(s.id);
                  const accent = PLATFORM_ACCENTS[s.platform] || PLATFORM_ACCENTS.other;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedId(s.id); setQuantity(s.min || 1); trackRecent(s.id); }}
                      className={`boost-service ${isActive ? "boost-service-active" : ""}`}
                      aria-pressed={isActive}
                    >
                      <span className="tw-flex tw-w-full tw-items-start tw-justify-between tw-gap-3">
                        <span className={`boost-service-icon tw-bg-gradient-to-br ${accent}`} aria-hidden="true">
                          {s.icon}
                        </span>
                        <span className={`boost-service-check ${isActive ? "boost-service-check-active" : ""}`} aria-hidden="true">
                          {isActive ? "✓" : "→"}
                        </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleFavorite(s.id); } }}
                        className={`boost-fav ${favorites.some((f) => String(f) === String(s.id)) ? "boost-fav-active" : ""}`}
                        aria-label={favorites.some((f) => String(f) === String(s.id)) ? "Retirer des favoris" : "Ajouter aux favoris"}
                        aria-pressed={favorites.some((f) => String(f) === String(s.id))}
                      >
                        {favorites.some((f) => String(f) === String(s.id)) ? "★" : "☆"}
                      </span>
                      </span>
                      <span className="boost-service-name">{s.name}</span>
                      <span className="boost-service-desc">{s.desc}</span>
                      <span className="tw-mt-3 tw-flex tw-items-baseline tw-gap-1">
                        <span className="boost-price tw-text-sm tw-font-black">{MONEY(s.unit)}</span>
                        <span className="boost-muted tw-text-[11px]">/ {s.unitLabel}</span>
                      </span>
                      <span className="boost-muted tw-mt-1 tw-block tw-text-[10px]">
                        Quantité : min {s.min}{s.max > 0 ? ` · max ${s.max}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="tw-mt-5 tw-flex tw-flex-col tw-items-center tw-justify-between tw-gap-3 sm:tw-flex-row">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || servicesLoading}
                className="boost-page-btn"
              >
                ← Précédent
              </button>
              <span className="boost-muted tw-text-[11px] tw-font-semibold">
                Page {Math.min(page, displayTotalPages)} sur {displayTotalPages} · {displayTotal} service(s)
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(displayTotalPages, current + 1))}
                disabled={page >= displayTotalPages || servicesLoading}
                className="boost-page-btn"
              >
                Suivant →
              </button>
            </div>
          </div>

          <div className="boost-card boost-card-pad">
            <div>
              <p className="boost-kicker">Finalisation</p>
              <h3 className="boost-card-title tw-mt-1">Vos informations</h3>
              <p className="boost-hint tw-mt-1">
                Ces informations servent à préparer et suivre votre commande.
              </p>
            </div>

            {user && (
              <div className="boost-prefill">
                <span className="boost-prefill-icon" aria-hidden="true">👤</span>
                <div className="boost-prefill-text">
                  <p className="boost-prefill-title">
                    {user.name ? `Bonjour ${user.name}` : "Coordonnées de votre compte"}
                  </p>
                  <p className="boost-prefill-note">
                    Votre e-mail et votre téléphone sont préremplis depuis votre compte. Vous pouvez les modifier.
                  </p>
                </div>
                <span className="boost-prefill-badge">Prérempli</span>
              </div>
            )}

            <div className="tw-mt-5 tw-grid tw-gap-4 sm:tw-grid-cols-2">
              <div>
                <label htmlFor="boost-quantity" className="boost-label">Quantité</label>
                <input
                  id="boost-quantity"
                  type="number"
                  min={1}
                  step={selected?.step || 1}
                  value={quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setQuantity("");
                    } else {
                      const num = Number(val);
                      if (!isNaN(num)) setQuantity(num);
                    }
                  }}
                  className="boost-input"
                />
                <p className="boost-hint">
                  Quantité minimale : {selected?.min || 1}. Tarif pour {selected?.unitLabel || "1000"} unités.
                </p>
              </div>
              <div>
                <label htmlFor="boost-email" className="boost-label">E-mail</label>
                <input
                  id="boost-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="boost-input"
                />
                <p className="boost-hint">Pour recevoir le suivi de la commande.</p>
              </div>
              <div className="sm:tw-col-span-2">
                <label htmlFor="boost-target" className="boost-label">Lien / cible</label>
                <input
                  id="boost-target"
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="https://... ou @pseudo"
                  className="boost-input"
                />
                <p className="boost-hint">Lien de votre profil, page ou publication.</p>
              </div>
              <div>
                <label htmlFor="boost-phone" className="boost-label">Téléphone</label>
                <input
                  id="boost-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237..."
                  className="boost-input"
                />
                <p className="boost-hint">Optionnel, pour le contact.</p>
              </div>
              <div>
                <label htmlFor="boost-details" className="boost-label">Détails</label>
                <textarea
                  id="boost-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Précisions supplémentaires..."
                  className="boost-input boost-textarea"
                />
              </div>
            </div>
          </div>
            </div>
          <aside className="boost-summary lg:tw-sticky lg:tw-top-24">
            <div className="boost-summary-head">
              <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
                <div>
                  <p className="boost-summary-kicker">Récapitulatif</p>
                  <h3 className="boost-summary-title">Votre commande</h3>
                </div>
                <span className="boost-glass-badge">Sécurisé</span>
              </div>
              <div className="tw-mt-4 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-white/[0.06] tw-p-3">
                <div className="tw-flex tw-items-center tw-gap-3">
                  <span className={`tw-flex tw-h-10 tw-w-10 tw-flex-none tw-items-center tw-justify-center tw-rounded-xl tw-bg-gradient-to-br tw-text-lg tw-text-white ${selectedAccent}`}>
                    {selected?.icon || "⚡"}
                  </span>
                  <div className="tw-min-w-0">
                    <p className="tw-truncate tw-text-xs tw-font-bold tw-text-white">
                      {selected?.name || "Sélectionnez un service"}
                    </p>
                    <p className="tw-truncate tw-text-[11px] tw-text-slate-400">
                      {selected?.platformLabel || "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="tw-p-6">
              <div className="boost-summary-row">
                <span>Service</span>
                <strong>{selected?.name || "—"}</strong>
              </div>
              <div className="boost-summary-row">
                <span>Plateforme</span>
                <strong>{selected?.platformLabel || "—"}</strong>
              </div>
              <div className="boost-summary-row">
                <span>Tarif unitaire</span>
                <strong>{selected ? `${MONEY(selected.unit)} / ${selected.unitLabel}` : "—"}</strong>
              </div>
              <div className="boost-summary-row">
                <span>Quantité</span>
                <strong>{quantity}</strong>
              </div>
              <div className="boost-summary-row">
                <span>Cible</span>
                <strong title={target.trim() || undefined}>{target.trim() || "À renseigner"}</strong>
              </div>

              <div className="boost-summary-total">
                <div>
                  <p className="boost-summary-kicker tw-text-slate-400">Total estimé</p>
                  <p className="boost-total">{MONEY(orderTotal)}</p>
                </div>
                <span className="boost-total-note">
                  {selected?.unitLabel ? `Tarif / ${selected.unitLabel}` : "FCFA"}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || servicesLoading || !selected}
                className="boost-btn boost-btn-primary boost-btn-block tw-mt-5"
              >
                Continuer la commande
                <IconArrowRight />
              </button>

              <p className="boost-hint tw-mt-3">
                <strong className="boost-strong">Paiement et suivi :</strong> vous serez redirigé vers
                la page de commande pour confirmer vos coordonnées, payer en ligne via iKeePay (ou
                déclarer un paiement manuel) et suivre son traitement.
              </p>

              <Link to="/mboppi-boost/mes-commandes" className="boost-link tw-mt-4">
                Suivre une commande existante
                <IconArrowRight className="tw-h-3.5 tw-w-3.5" />
              </Link>

              <div className="boost-summary-secure">
                <IconShield className="tw-h-4 tw-w-4" />
                Paiement protégé · iKeePay
              </div>

              {result && (
                <div role="status" aria-live="polite" className="boost-alert boost-alert-warn">
                  {result.message}
                </div>
              )}
            </div>
          </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
