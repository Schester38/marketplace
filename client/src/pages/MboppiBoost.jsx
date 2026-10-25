import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

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
  const { user } = useAuth();
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
          api.smmCategories(),
          api.smmServices(),
        ]);
        if (cancelled) return;
        const cats = catsResp.categories || [];
        const svcs = svcsResp.services || [];
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
      const resp = await api.smmCreateOrder({
        service_id: Number(selected.id),
        quantity: q,
        client_info: { platform, target, details, email, phone },
        payment_method: "manual",
      });
      const orderId = resp.order_id || resp.id;
      setResult({
        type: "ok",
        message: "Commande enregistrée : " + selected.name + " — " + platform + " — " + q + " " + selected.unitLabel + " — " + MONEY(total) + ". Votre commande " + (orderId ? "#" + orderId + " " : "") + "est prise en charge. Suivez son avancement dans « Mes commandes ».",
      });
    } catch (err) {
      setResult({ type: "err", message: err?.message || "Erreur lors de la préparation de la commande." });
    } finally {
      setSubmitting(false);
    }
  };


  const total = (selected ? (Number(quantity) || 0) * selected.unit : 0);

  const onCategoryChange = (val) => {
    setCategoryFilter(val);
    const visible = catalog.filter((s) => val === "all" || String(s.cat) === String(val));
    if (visible.length && !visible.some((s) => String(s.id) === String(selectedId))) {
      setSelectedId(visible[0].id);
    }
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
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{catalog.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", background: "#ffffff12", borderRadius: 12 }}>
              <b style={{ fontSize: 14 }}>Catégories</b>
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{catOptions.length - 1}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "12px 14px", background: "#ffffff12", borderRadius: 12 }}>
              <b style={{ fontSize: 14 }}>Total estimé</b>
              <span style={{ fontSize: 12, color: "#d8e9ff" }}>{MONEY(total)}</span>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Catégorie</label>
                  <select value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)} style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}>
                    {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Plateforme</label>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}>
                    {["Instagram", "TikTok", "YouTube", "Telegram", "Facebook", "Twitter / X", "Spotify", "Autre"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="mboost-services">
                {filtered.map((s) => (
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

              <div className="mboost-fields">
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Quantité</label>
                  <input
                    type="number"
                    min={selected?.min || 1}
                    max={selected?.max || undefined}
                    step={selected?.step || 1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    style={{ font: "inherit", border: "1px solid #d5deea", borderRadius: 10, padding: "12px 13px", width: "100%", background: "#fff", color: "#10213b", outline: "none" }}
                  />
                  <small style={{ fontSize: 12, color: "#66758c", lineHeight: 1.45 }}>Exemple de volume pour cette prestation : {selected?.unitLabel || "1000"}.</small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 750 }}>Lien / cible</label>
                  <input
                    type="url"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="https://..."
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Plateforme</span><strong>{platform}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Tarif unitaire</span><strong>{selected ? MONEY(selected.unit) + " / " + selected.unitLabel : "—"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Quantité</span><strong>{quantity} {Number(quantity) === 1 ? selected?.unitLabel : (selected?.unitLabel || "") + "s"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "12px 0", borderBottom: "1px solid #e4eaf2", fontSize: 13 }}><span>Référence du lien</span><strong>{target.trim() || "À renseigner"}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, padding: "10px 0", fontWeight: 700, fontSize: 18 }}><span>Total estimé</span><strong>{MONEY(total)}</strong></div>

              <button onClick={handleSubmit} disabled={submitting || loading || !selected} style={{ width: "100%", border: 0, borderRadius: 10, padding: "12px 13px", background: "#1459d9", color: "white", fontWeight: 750, cursor: "pointer", marginTop: 8 }}>
                {submitting ? "Enregistrement…" : "✅ Valider et commander"}
              </button>

              <p style={{ fontSize: 12, color: "#66758c", marginTop: 12 }}>
                <strong>Paiement et suivi :</strong> après validation, votre commande est enregistrée. Le paiement (Mobile Money, virement ou espèces) et le suivi se font depuis votre espace « Mes commandes ».
              </p>

              {result && (
                <div role="status" aria-live="polite" style={{ marginTop: 12, padding: 12, borderRadius: 8, background: result.type === "ok" ? "#eaf8f1" : "#fff7e6", border: "1px solid " + (result.type === "ok" ? "#b7e5ce" : "#f0dca9"), color: result.type === "ok" ? "#155c3c" : "#855100" }}>
                  {result.message}
                  {result.type === "ok" && (
                    <div style={{ marginTop: 10 }}>
                      {user ? (
                        <Link to="/mboppi-boost/mes-commandes" style={{ display: "inline-flex", width: "auto", padding: "8px 14px", fontSize: 13, border: 0, borderRadius: 8, background: "#1459d9", color: "white", textDecoration: "none" }}>
                          Voir mes commandes
                        </Link>
                      ) : (
                        <span style={{ fontSize: 12 }}>Conservez votre numéro de commande : il vous sera demandé pour le suivi.</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
