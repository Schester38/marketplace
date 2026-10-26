import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";

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
export default function MboppiBoost() {
  const navigate = useNavigate();
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
  const [selectedId, setSelectedId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [target, setTarget] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);

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
  }, [page, search, categoryFilter, platformFilter]);

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
  const displayCatalog = useFallback
    ? fallbackFiltered.slice((fallbackPage - 1) * PAGE_SIZE, fallbackPage * PAGE_SIZE)
    : catalog;
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
  return (
    <main style={{ background: "#f5f8fc", color: "#10213b", minHeight: "100vh", fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>
      <Seo title="MboppiBoost — Commandes de services digitaux" description="MboppiBoost : sélectionnez un service de marketing digital, configurez votre besoin et consultez le montant estimé avant validation." />

      <div style={{ maxWidth: 1160, margin: "auto", padding: "30px 20px 60px" }}>
        <section className="mboost-hero" style={{ background: "linear-gradient(120deg,#102344,#174fc2 65%,#287ee8)", borderRadius: 24, color: "white", alignItems: "center", boxShadow: "0 12px 32px rgba(16,33,59,.08)" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1.7px", textTransform: "uppercase", color: "#c7e1ff" }}>MboppiBoost</div>
            <h1 style={{ fontSize: "clamp(30px,4vw,47px)", lineHeight: 1.08, margin: "12px 0" }}>Commandes de services digitaux</h1>
            <p style={{ color: "#e4efff", lineHeight: 1.65, maxWidth: 650, marginBottom: 22 }}>
              Sélectionnez un service, configurez votre besoin et consultez le montant estimé avant validation. Le paiement et le suivi se font ensuite depuis votre espace.
            </p>
            <span style={{ display: "inline-flex", border: "1px solid #ffffff55", borderRadius: 999, padding: "9px 13px", fontSize: 12, margin: "4px 5px 0 0", background: "#ffffff12" }}>Services digitaux</span>
            <span style={{ display: "inline-flex", border: "1px solid #ffffff55", borderRadius: 999, padding: "9px 13px", fontSize: 12, margin: "4px 5px 0 0", background: "#ffffff12" }}>Suivi en temps réel</span>
            <span style={{ display: "inline-flex", border: "1px solid #ffffff55", borderRadius: 999, padding: "9px 13px", fontSize: 12, margin: "4px 5px 0 0", background: "#ffffff12" }}>Paiement manuel</span>
          </div>
          <div style={{ border: "1px solid #ffffff30", background: "#ffffff10", borderRadius: 20, padding: 22, minHeight: 190, display: "flex", flexDirection: "column", justifyContent: "center", gap: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", background: "#ffffff12", borderRadius: 12 }}>
              <b style={{ fontSize: 14 }}>Services disponibles</b>
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{displayTotal}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", background: "#ffffff12", borderRadius: 12 }}>
              <b style={{ fontSize: 14 }}>Catégories</b>
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{catalogCategoryCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", background: "#ffffff12", borderRadius: 12 }}>
              <b style={{ fontSize: 14 }}>Total estimé</b>
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{MONEY(orderTotal)}</span>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 15, flexWrap: "wrap", margin: "32px 0 17px" }}>
          <div>
            <h2 style={{ fontSize: 25, margin: "0 0 5px" }}>Configurer votre commande</h2>
            <p style={{ margin: 0, color: "#66758c", fontSize: 14 }}>Choisissez un service, renseignez vos informations et validez la commande.</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#66758c" }}>Chargement des services…</div>
        ) : (
          <div className="mboost-layout" style={{ alignItems: "start" }}>
            <div style={{ background: "white", border: "1px solid #e4eaf2", borderRadius: 18, padding: 22, boxShadow: "0 12px 32px rgba(16,33,59,.08)" }}>
              <div className="mboost-fields" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Rechercher un service</label>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Ex. followers, vues, likes, abonnés..."
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Catégorie</label>
                  <select value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)} style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}>
                    {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Plateforme</label>
                  <select value={platformFilter} onChange={(e) => onPlatformChange(e.target.value)} style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}>
                    {platformOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {displayCatalog.length === 0 ? (
                <div style={{ padding: "26px 16px", margin: "8px 0 22px", textAlign: "center", color: "#66758c", background: "#f7faff", border: "1px dashed #d5deea", borderRadius: 13 }}>
                  {servicesLoading ? "Chargement des services…" : "Aucun service ne correspond à votre recherche."}
                </div>
              ) : (
                <div className="mboost-services" aria-busy={servicesLoading} style={{ opacity: servicesLoading ? 0.55 : 1, transition: "opacity .15s" }}>
                  {displayCatalog.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSelectedId(s.id); setQuantity(s.min || 1); }}
                      style={{
                        border: String(selected?.id) === String(s.id) ? "2px solid #1459d9" : "1px solid #e4eaf2",
                        borderRadius: 13,
                        padding: String(selected?.id) === String(s.id) ? 13 : 14,
                        textAlign: "left",
                        background: String(selected?.id) === String(s.id) ? "#f0f6ff" : "white",
                        cursor: "pointer",
                        color: "#10213b",
                        transition: ".15s",
                      }}
                    >
                      <span style={{ fontSize: 23 }}>{s.icon}</span>
                      <b style={{ display: "block", margin: "7px 0 4px", fontSize: 14 }}>{s.name}</b>
                      <small style={{ color: "#66758c", lineHeight: 1.4, display: "block" }}>{s.desc}</small>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#1459d9", marginTop: 9, display: "block" }}>{MONEY(s.unit)} / {s.unitLabel}</span>
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 0 22px" }}>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || servicesLoading}
                  style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 9, padding: "9px 13px", background: "#fff", color: "#10213b", fontWeight: 700, cursor: page <= 1 || servicesLoading ? "not-allowed" : "pointer", opacity: page <= 1 || servicesLoading ? 0.45 : 1 }}
                >
                  ← Précédent
                </button>
                <span style={{ fontSize: 12, color: "#66758c" }}>
                  Page {Math.min(page, displayTotalPages)} sur {displayTotalPages} · {displayTotal} service(s)
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(displayTotalPages, current + 1))}
                  disabled={page >= displayTotalPages || servicesLoading}
                  style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 9, padding: "9px 13px", background: "#fff", color: "#10213b", fontWeight: 700, cursor: page >= displayTotalPages || servicesLoading ? "not-allowed" : "pointer", opacity: page >= displayTotalPages || servicesLoading ? 0.45 : 1 }}
                >
                  Suivant →
                </button>
              </div>

              <div className="mboost-fields">
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Quantité</label>
                  <input
                    type="number"
                    min={selected?.min || 1}
                    max={selected?.max || undefined}
                    step={selected?.step || 1}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(
                          Number(selected?.min) || 1,
                          Number(e.target.value) || Number(selected?.min) || 1
                        )
                      )
                    }
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                  <small style={{ fontSize: 12, color: "#66758c", lineHeight: 1.45 }}>
                    Quantité minimale : {selected?.min || 1}. Tarif pour {selected?.unitLabel || "1000"} unités.
                  </small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Lien / cible</label>
                  <input
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="https://... ou @pseudo"
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                  <small style={{ fontSize: 12, color: "#66758c", lineHeight: 1.45 }}>Lien de votre profil, page ou publication.</small>
                </div>
              </div>

              <div className="mboost-fields">
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                  <small style={{ fontSize: 12, color: "#66758c", lineHeight: 1.45 }}>Pour recevoir le suivi de la commande.</small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Téléphone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+237..."
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                  <small style={{ fontSize: 12, color: "#66758c", lineHeight: 1.45 }}>Optionnel, pour le contact.</small>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 750 }}>Détails</label>
                <textarea
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Précisions supplémentaires..."
                  style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none", resize: "vertical" }}
                />
              </div>
            </div>

            <aside style={{ background: "white", border: "1px solid #e4eaf2", borderRadius: 18, padding: 22, boxShadow: "0 12px 32px rgba(16,33,59,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 17 }}>
                <h3 style={{ margin: 0, fontSize: 19 }}>Récapitulatif</h3>
                <span style={{ fontSize: 10, letterSpacing: ".5px", textTransform: "uppercase", borderRadius: 5, padding: "5px 7px", background: "#fff1d5", color: "#855100", fontWeight: 800 }}>Commande</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Service</span><strong>{selected?.name || "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Plateforme</span><strong>{selected?.platformLabel || "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Tarif unitaire</span><strong>{selected ? MONEY(selected.unit) + " / " + selected.unitLabel : "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Quantité</span><strong>{quantity} {Number(quantity) === 1 ? selected?.unitLabel : (selected?.unitLabel || "") + "s"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Référence du lien</span><strong>{target.trim() || "À renseigner"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "10px 0", fontWeight: 700, fontSize: 18 }}><span>Total estimé</span><strong>{MONEY(orderTotal)}</strong></div>

              <button onClick={handleSubmit} disabled={loading || servicesLoading || !selected} style={{ width: "100%", border: 0, borderRadius: 10, padding: "12px 13px", background: "#1459d9", color: "white", fontWeight: 750, cursor: loading || servicesLoading || !selected ? "not-allowed" : "pointer", opacity: loading || servicesLoading || !selected ? 0.6 : 1, marginTop: 8 }}>
                Continuer la commande
              </button>

              <p style={{ fontSize: 12, color: "#66758c", marginTop: 12 }}>
                <strong>Paiement et suivi :</strong> vous serez redirigé vers la page de commande pour confirmer vos coordonnées, déclarer votre paiement et suivre son traitement.
              </p>

              <Link to="/mboppi-boost/mes-commandes" style={{ display: "inline-block", fontSize: 12, color: "#1459d9", marginTop: 8 }}>
                Suivre une commande existante
              </Link>

              {result && (
                <div role="status" aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#fff7e6", border: "1px solid #f0dca9", color: "#855100" }}>
                  {result.message}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
