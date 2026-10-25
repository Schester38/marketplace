import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import "../boost.css";
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
  S(16,3,"▶�?","YouTube Subscribers","Abonnés pour votre chaîne YouTube.",1500,10),
  S(17,3,"▶�?","YouTube Views","Vues sur vos vidéos YouTube.",40,100),
  S(18,3,"▶�?","YouTube Likes","Likes sur vos vidéos YouTube.",250,10),
  S(19,3,"▶�?","YouTube Comments","Commentaires sur vos vidéos YouTube.",5000,5),
  S(20,3,"▶�?","YouTube Watch Hours","Heures de visionnage pour la monétisation.",3000,1),
  S(21,4,"✈�?","Telegram Members","Membres pour votre canal/groupe Telegram.",600,10),
  S(22,4,"✈�?","Telegram Post Views","Vues sur vos publications Telegram.",30,100),
  S(23,4,"✈�?","Telegram Reactions","Réactions sur vos messages Telegram.",200,10),
  S(24,5,"👤","Facebook Followers","Followers pour votre page Facebook.",400,10),
  S(25,5,"👤","Facebook Page Likes","Likes de votre page Facebook.",350,10),
  S(26,5,"👤","Facebook Post Likes","Likes sur vos publications Facebook.",150,10),
  S(27,5,"👤","Facebook Video Views","Vues sur vos vidéos Facebook.",15,100),
  S(28,6,"�?�","X Followers","Followers pour votre compte X.",700,10),
  S(29,6,"�?�","X Likes","Likes sur vos tweets.",180,10),
  S(30,6,"�?�","X Views","Vues sur vos tweets.",25,100),
  S(31,6,"�?�","X Retweets","Retweets de vos publications.",400,10),
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
        icon: (categories || []).find((c) => c.id === s.category_id)?.icon || "??",
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
  const total = (selected ? Math.round((Number(quantity) || 0) * selected.unit / 1000) : 0);
  const onCategoryChange = (val) => {
    setCategoryFilter(val);
    const visible = catalog.filter((s) => val === "all" || String(s.cat) === String(val));
    if (visible.length && !visible.some((s) => String(s.id) === String(selectedId))) {
      setSelectedId(visible[0].id);
    }
  };
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
    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
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
        message: "R�capitulatif pr�par� : " + selected.name + " � " + platform + " � " + q + " " + selected.unitLabel + " � " + MONEY(total) + ". Commande " + (orderId ? "#" + orderId + " " : "") + "enregistr�e. Aucun paiement n'a �t� effectu� ; le paiement et le suivi seront activ�s selon votre compte.",
      });
    } catch (err) {
      setResult({ type: "err", message: err?.response?.data?.error || "Erreur lors de la préparation de la commande." });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="boost-page">
      <Seo title="MboppiBoost � Commandes de services digitaux" description="MboppiBoost : sélectionnez un service de marketing digital, configurez votre besoin et consultez le montant estimé avant validation." />
      <header className="boost-top">
        <div className="boost-brand">Mboppi<span>Boost</span></div>
        <small>Votre croissance numérique commence ici.</small>
      </header>
      <main className="boost-wrap">
        <section className="boost-hero">
          <div>
            <div className="boost-eyebrow">Services digitaux à la demande</div>
            <h1>Choisissez. Configurez.<br />Commandez en ligne.</h1>
            <p>Une interface simple pour sélectionner un service de marketing digital, préciser votre besoin et consulter le montant estimé avant validation.</p>
            <span className="boost-pill">�S Parcours en libre-service</span>
            <span className="boost-pill">�S Prix affiché avant commande</span>
            <span className="boost-pill">�S Suivi prévu après connexion</span>
          </div>
          <div className="boost-hero-art">
            <div className="boost-metric"><b>1. Choisissez un service</b><span>Catalogue</span></div>
            <div className="boost-metric"><b>2. Ajoutez vos informations</b><span>Configuration</span></div>
            <div className="boost-metric"><b>3. Validez la commande</b><span>Paiement à connecter</span></div>
          </div>
        </section>
        <div className="boost-section-head">
          <div><h2>Créer une commande</h2><p>Tout se configure sur cette page, sans devoir contacter un commercial.</p></div>
        </div>
        <div className="boost-layout">
          <section className="boost-panel">
            <div className="boost-catalog-hint"><strong>Prototype de démonstration :</strong> les services et tarifs ci-dessous sont des exemples. Remplacez-les par le catalogue réel du fournisseur avant la mise en ligne.</div>
            <div className="boost-field">
              <label htmlFor="category">Type de service</label>
              <select id="category" value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)}>
                {catOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              </div>
`
            {loading ? (
              <p>Chargement⬦</p>
            ) : (
              <div className="boost-service-list" id="services">
                {filtered.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`boost-service ${String(selected?.id) === String(s.id) ? "active" : ""}`}
                    onClick={() => { setSelectedId(s.id); setQuantity(s.min || 1); }}
                  >
                    <span className="emoji">{s.icon}</span>
                    <b>{s.name}</b>
                    <small>{s.desc}</small>
                    <span className="boost-price">{MONEY(s.unit)} / {s.unitLabel}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="boost-row2">
              <div className="boost-field">
                <label htmlFor="platform">Plateforme</label>
                <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option>TikTok</option><option>Facebook</option><option>Instagram</option><option>YouTube</option><option>LinkedIn</option><option>Autre</option>
                </select>
              </div>
              <div className="boost-field">
                <label htmlFor="quantity">Quantité / volume</label>
                <input id="quantity" type="number" min={selected?.min || 1} step={selected?.step || 1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <small id="quantityHelp">Le volume dépend du service sélectionné.</small>
              </div>
            </div>
            <div className="boost-field">
              <label htmlFor="target">Lien de la page, du profil ou de la publication</label>
              <input id="target" type="url" placeholder="https://..." autoComplete="url" value={target} onChange={(e) => setTarget(e.target.value)} />
              <small>Utilisez un lien public et vérifiez qu'il est correct. Ne communiquez jamais votre mot de passe.</small>
            </div>
            <div className="boost-field">
              <label htmlFor="details">Instructions complémentaires (facultatif)</label>
              <textarea id="details" rows={3} placeholder="Décrivez votre objectif ou les éléments à prendre en compte⬦" value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            <div className="boost-row2">
              <div className="boost-field">
                <label htmlFor="email">E-mail de suivi</label>
                <input id="email" type="email" placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="boost-field">
                <label htmlFor="phone">Téléphone (facultatif)</label>
                <input id="phone" type="tel" placeholder="+237 ⬦" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </section>
          <aside className="boost-panel">
            <div className="boost-summary-title">
              <h3>Récapitulatif</h3>
              <span className="boost-demo-tag">Exemple</span>
            </div>
            <div className="boost-summary-line"><span>Service</span><strong>{selected?.name || "�"}</strong></div>
            <div className="boost-summary-line"><span>Plateforme</span><strong>{platform}</strong></div>
            <div className="boost-summary-line"><span>Tarif unitaire</span><strong>{selected ? MONEY(selected.unit) + " / " + selected.unitLabel : "�"}</strong></div>
            <div className="boost-summary-line"><span>Quantité</span><strong>{quantity} {Number(quantity) === 1 ? selected?.unitLabel : (selected?.unitLabel || "") + "s"}</strong></div>
            <div className="boost-summary-line"><span>Référence du lien</span><strong>{target.trim() || "À renseigner"}</strong></div>
            <div className="boost-total"><span>Total estimé</span><strong>{MONEY(total)}</strong></div>
            <button className="boost-btn" id="orderBtn" onClick={handleSubmit} disabled={submitting || loading || !selected}>
              {submitting ? "Préparation⬦" : "Préparer ma commande"}
            </button>
            <p className="boost-notice"><strong>Important :</strong> ce prototype ne prélève aucun paiement et n'envoie pas encore de commande à un fournisseur. Pour activer les commandes réelles, le site doit être relié à un backend sécurisé, au catalogue/API d'un fournisseur et à un moyen de paiement (par exemple Mobile Money si disponible).</p>
            {result && (
              <div className={`boost-result show ${result.type === "ok" ? "ok" : result.type === "warn" ? "warn" : "err"}`} role="status" aria-live="polite">
                {result.message}
                {result.type === "ok" && (
                  <div style={{ marginTop: 10 }}>
                    <Link to="/mboppi-boost/mes-commandes" className="boost-btn" style={{ display: "inline-block", width: "auto", padding: "8px 14px", fontSize: 13 }}>
                      Voir mes commandes
                    </Link>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
        <div className="boost-section-head">
          <div><h2>Comment ça marche ?</h2><p>Un parcours client direct, conçu pour être connecté à votre site existant.</p></div>
        </div>
        <section className="boost-steps">
          <div className="boost-step"><i>1</i><b>Sélectionnez le service</b><p>Choisissez la prestation, la plateforme et le volume souhaité.</p></div>
          <div className="boost-step"><i>2</i><b>Vérifiez le montant</b><p>Le récapitulatif et le total estimé se mettent à jour automatiquement.</p></div>
          <div className="boost-step"><i>3</i><b>Paiement et suivi à activer</b><p>Après intégration, la commande pourra être payée, transmise au fournisseur et suivie dans votre compte.</p></div>
        </section>
      </main>
      <footer className="boost-footer">MboppiBoost � Votre croissance numérique commence ici. · Prototype d'interface, non relié à un système de paiement.</footer>
    </div>
  );
}

