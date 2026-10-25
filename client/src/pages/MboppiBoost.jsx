import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

const MONEY = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " FCFA";

const S = (id, cid, icon, name, desc, price, min) => ({ id, cat: String(cid), icon, name, desc, unit: price, unitLabel: "1000", step: 1, min });

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
  const { t } = useLang();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [platform, setPlatform] = useState("TikTok");
  const [quantity, setQuantity] = useState(1);
  const [target, setTarget] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catsResp, svcsResp] = await Promise.all([
          api.get("/smm/categories"),
          api.get("/smm/services"),
        ]);
        if (cancelled) return;
        const cats = catsResp.data?.categories || [];
        const svcs = svcsResp.data?.services || [];
        setCategories(cats.length ? cats : null);
        setServices(svcs.length ? svcs : null);
      } catch (err) {
        console.error("[MboppiBoost] Erreur récupération données :", err?.message);
        if (!cancelled) { setCategories(null); setServices(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const useFallback = !services || services.length === 0;
  const catOptions = useMemo(() => {
    if (categories && categories.length) {
      return [{ value: "all", label: "Tous les services" }].concat(
        categories.map((c) => ({ value: String(c.id), label: c.name }))
      );
    }
    return [
      { value: "all", label: "Tous les services" },
      { value: "1", label: "Instagram" },
      { value: "2", label: "TikTok" },
      { value: "3", label: "YouTube" },
      { value: "4", label: "Telegram" },
      { value: "5", label: "Facebook" },
      { value: "6", label: "Twitter / X" },
      { value: "7", label: "Spotify" },
    ];
  }, [categories]);

  const catalog = useMemo(() => {
    if (!useFallback) {
      return services.map((s) => ({
        id: s.id,
        cat: String(s.category_id),
        icon: (categories || []).find((c) => c.id === s.category_id)?.icon || "🎯",
        name: s.name,
        desc: s.short_description || s.description || "",
        unit: Number(s.price) || 0,
        unitLabel: s.billing_unit || "1000",
        step: 1,
        min: Number(s.limits?.min) || 1,
        max: Number(s.limits?.max) || 0,
      }));
    }
    return DEFAULT_CATALOG;
  }, [useFallback, services, categories]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return catalog;
    return catalog.filter((s) => String(s.cat) === String(categoryFilter));
  }, [catalog, categoryFilter]);

  const selected = useMemo(() => {
    const found = catalog.find((s) => String(s.id) === String(selectedId));
    return found || (filtered.length ? filtered[0] : catalog[0]);
  }, [catalog, selectedId, filtered]);

  useEffect(() => {
    if (!selectedId && catalog.length) setSelectedId(catalog[0].id);
  }, [catalog, selectedId]);

  useEffect(() => {
    if (selected && !filtered.some((s) => String(s.id) === String(selected.id)) && filtered.length) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selected]);

  useEffect(() => {
    if (selected) setQuantity(selected.min || 1);
  }, [selected?.id]);
  const handleSubmit = async () => {
    setResult(null);
    const q = Number.parseInt(quantity || "0", 10);
    if (!target || !/^https?:\/\//i.test(target)) {
      setResult({ type: "warn", message: "Ajoutez un lien valide commençant par https:// ou http:// avant de continuer." });
      return;
    }
    if (!Number.isInteger(q) || q < 1) {
      setResult({ type: "warn", message: "Veuillez saisir une quantité valide." });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResult({ type: "warn", message: "Ajoutez un e-mail valide pour recevoir le suivi de la commande." });
      return;
    }
    setSubmitting(true);
    try {
      const resp = await api.post("/smm/orders", {
        service_id: Number(selected.id),
        quantity: q,
        client_info: { platform, target, details, email, phone },
        payment_method: "manual",
      });
      const orderId = resp.data?.order_id || resp.data?.id;
      setResult({
        type: "ok",
        message: "Récapitulatif préparé : " + selected.name + " — " + platform + " — " + q + " " + selected.unitLabel + " — " + MONEY(total) + ". Commande " + (orderId ? "#" + orderId + " " : "") + "enregistrée. Aucun paiement n'a été effectué ; le paiement et le suivi seront activés selon votre compte.",
      });
    } catch (err) {
      setResult({ type: "err", message: err?.response?.data?.error || "Erreur lors de la préparation de la commande." });
    } finally {
      setSubmitting(false);
    }
  };


  const total = (selected ? Math.round((Number(quantity) || 0) * selected.unit / 1000) : 0);

  const onCategoryChange = (val) => {
    setCategoryFilter(val);
    const visible = catalog.filter((s) => val === "all" || String(s.cat) === String(val));
    if (visible.length && !visible.some((s) => String(s.id) === String(selectedId))) {
      setSelectedId(visible[0].id);
    }
  };
  return (
    <main className="container">
      <Seo title="MboppiBoost — Commandes de services digitaux" description="MboppiBoost : sélectionnez un service de marketing digital, configurez votre besoin et consultez le montant estimé avant validation." />

      <section className="hero vitrine-hero">
        <span className="hero-badge">⚡ MboppiBoost</span>
        <h1>Choisissez. Configurez. Commandez en ligne.</h1>
        <p>Une interface simple pour sélectionner un service de marketing digital, préciser votre besoin et consulter le montant estimé avant validation.</p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Créer une commande</h2>
          <p>Tout se configure sur cette page, sans devoir contacter un commercial.</p>
        </div>

        {loading ? (
          <div className="card"><p>Chargement…</p></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
            <section className="card">
              <div style={{ marginBottom: 16, padding: 12, background: "var(--soft)", borderRadius: 8 }}>
                <strong>Prototype de démonstration :</strong> les services et tarifs ci-dessous sont des exemples. Remplacez-les par le catalogue réel du fournisseur avant la mise en ligne.
              </div>

              <div className="form-row">
                <label htmlFor="category">Type de service</label>
                <select id="category" value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)}>
                  {catOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div id="services" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
                {filtered.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="card"
                    style={{ textAlign: "left", cursor: "pointer", border: String(selected?.id) === String(s.id) ? "2px solid var(--primary)" : undefined }}
                    onClick={() => { setSelectedId(s.id); setQuantity(s.min || 1); }}
                  >
                    <span style={{ fontSize: 24 }}>{s.icon}</span>
                    <b style={{ display: "block", marginTop: 6 }}>{s.name}</b>
                    <small style={{ display: "block", color: "var(--text-muted)" }}>{s.desc}</small>
                    <span style={{ display: "block", marginTop: 6, fontWeight: 600 }}>{MONEY(s.unit)} / {s.unitLabel}</span>
                  </button>
                ))}
              </div>

              <div className="form-row" style={{ marginTop: 16 }}>
                <label htmlFor="platform">Plateforme / réseau</label>
                <input id="platform" type="text" value={platform} onChange={(e) => setPlatform(e.target.value)} />
              </div>

              <div className="form-row">
                <label htmlFor="quantity">Quantité ({selected?.unitLabel || "1000"})</label>
                <input id="quantity" type="number" min={selected?.min || 1} max={selected?.max || undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>

              <div className="form-row">
                <label htmlFor="target">Lien ou compte concerné</label>
                <input id="target" type="url" placeholder="https://instagram.com/votre_compte" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>

              <div className="form-row">
                <label htmlFor="details">Précisions (optionnel)</label>
                <textarea id="details" rows={3} placeholder="Éléments à prendre en compte…" value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-row">
                  <label htmlFor="email">E-mail de suivi</label>
                  <input id="email" type="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-row">
                  <label htmlFor="phone">Téléphone (facultatif)</label>
                  <input id="phone" type="tel" placeholder="+237 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            </section>

            <aside className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Récapitulatif</h3>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Exemple</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span>Service</span><strong>{selected?.name || "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span>Plateforme</span><strong>{platform}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span>Tarif unitaire</span><strong>{selected ? MONEY(selected.unit) + " / " + selected.unitLabel : "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span>Quantité</span><strong>{quantity} {Number(quantity) === 1 ? selected?.unitLabel : (selected?.unitLabel || "") + "s"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span>Référence du lien</span><strong>{target.trim() || "À renseigner"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 700, fontSize: 18 }}><span>Total estimé</span><strong>{MONEY(total)}</strong></div>

              <button className="btn btn-primary btn-block" onClick={handleSubmit} disabled={submitting || loading || !selected}>
                {submitting ? "Préparation…" : "Préparer ma commande"}
              </button>

              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
                <strong>Important :</strong> ce prototype ne prélève aucun paiement et n'envoie pas encore de commande à un fournisseur. Pour activer les commandes réelles, le site doit être relié à un backend sécurisé, au catalogue/API d'un fournisseur et à un moyen de paiement (par exemple Mobile Money si disponible).
              </p>

              {result && (
                <div role="status" aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--soft)" }}>
                  {result.message}
                  {result.type === "ok" && (
                    <div style={{ marginTop: 10 }}>
                      <Link to="/mboppi-boost/mes-commandes" className="btn btn-primary" style={{ display: "inline-block", width: "auto", padding: "8px 14px", fontSize: 13 }}>
                        Voir mes commandes
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Comment ça marche ?</h2>
          <p>Un parcours client direct, conçu pour être connecté à votre site existant.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div className="card"><b style={{ display: "block", marginBottom: 6 }}>1. Sélectionnez le service</b><p style={{ margin: 0, color: "var(--text-muted)" }}>Choisissez la prestation, la plateforme et le volume souhaité.</p></div>
          <div className="card"><b style={{ display: "block", marginBottom: 6 }}>2. Vérifiez le montant</b><p style={{ margin: 0, color: "var(--text-muted)" }}>Le récapitulatif et le total estimé se mettent à jour automatiquement.</p></div>
          <div className="card"><b style={{ display: "block", marginBottom: 6 }}>3. Paiement et suivi à activer</b><p style={{ margin: 0, color: "var(--text-muted)" }}>Après intégration, la commande pourra être payée, transmise au fournisseur et suivie dans votre compte.</p></div>
        </div>
      </section>
    </main>
  );
}
