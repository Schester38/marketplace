import React, { useCallback, useEffect, useState } from "react";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import PwaInstallButton from "../components/PwaInstallButton.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { countrySymbol } from "../config.js";

const VISIT_RANGES = [
  { days: 1, label: "1 jour" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "1 mois" },
];

export default function Admin() {
  const { t } = useLang();
  const [gate, setGate] = useState(true);

  useEffect(() => {
    setGate(!localStorage.getItem("admin_token"));
  }, []);
  const [password, setPassword] = useState("");
  const [gateError, setGateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [products, setProducts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [msgTarget, setMsgTarget] = useState("all");
  const [msgUserId, setMsgUserId] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgOk, setMsgOk] = useState("");
  const [newsletter, setNewsletter] = useState(null);
  const [nlSubject, setNlSubject] = useState("");
  const [nlBody, setNlBody] = useState("");
  const [nlBusy, setNlBusy] = useState(false);
  const [nlOk, setNlOk] = useState("");
  const [visits, setVisits] = useState(null);
  const [visitDays, setVisitDays] = useState(30);
  const [visitCountry, setVisitCountry] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [showHiddenStatus, setShowHiddenStatus] = useState(false);
  const [showHiddenShop, setShowHiddenShop] = useState(false);
  const [showHiddenSeller, setShowHiddenSeller] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (silent) => {
      if (!silent) setLoading(true);
      const onErr = (e) => {
        if (e && (e.status === 401 || e.status === 403)) {
          localStorage.removeItem("admin_token");
          setGate(true);
          setGateError(
            t("Session expirée ou invalide. Entrez à nouveau le mot de passe administrateur.")
          );
        } else if (e && e.message) {
          setError(e.message);
        }
        setLoading(false);
      };
      api
        .adminStats()
        .then((d) => {
          setStats(d.stats);
          setLoading(false);
        })
        .catch(onErr);
      api
        .adminUsers()
        .then((d) => setUsers(d.users))
        .catch(onErr);
      api
        .adminProducts()
        .then((d) => setProducts(d.products))
        .catch(onErr);
      api.adminTransactions().then(setTransactions).catch(onErr);
      api
        .adminNewsletter()
        .then((d) => setNewsletter(d))
        .catch(() => {});
    },
    [t]
  );

  useEffect(() => {
    if (gate) return;
    api
      .adminVisits(visitDays, visitCountry)
      .then((d) => setVisits(d.visits))
      .catch(() => {});
  }, [gate, visitDays, visitCountry]);

  useEffect(() => {
    if (!gate) load();
  }, [gate, load]);
  useRefreshOnFocus(load);

  const submitGate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setGateError("");
    try {
      const d = await api.adminPass(password);
      localStorage.setItem("admin_token", d.token);
      setGate(false);
      setPassword("");
    } catch (err) {
      setGateError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    setGate(true);
    setLoading(false);
    setStats(null);
    setUsers(null);
    setProducts(null);
    setTransactions(null);
    setMessages(null);
    setLogs(null);
    setNewsletter(null);
    setVisits(null);
    setNlOk("");
  };

  const searchUsers = async (e) => {
    e.preventDefault();
    try {
      const d = await api.adminUsers(search.trim());
      setUsers(d.users);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleVerified = async (u) => {
    try {
      await api.adminSetVerified(u.id, !u.verified);
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, verified: !x.verified } : x)));
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProduct = async (p) => {
    if (!window.confirm(t("Supprimer « {name} » ?", { name: p.name }))) return;
    try {
      await api.adminDeleteProduct(p.id);
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    setMsgOk("");
    const text = msgText.trim();
    if (!text) return;
    if (msgTarget === "user" && !msgUserId) return;
    setMsgBusy(true);
    try {
      await api.adminSendMessage({
        message: text,
        target: msgTarget,
        userId: msgTarget === "user" ? Number(msgUserId) : null,
      });
      setMsgText("");
      setMsgUserId("");
      setMsgOk(t("Message envoyé avec succès."));
      api
        .adminMessages()
        .then((d) => setMessages(d.messages))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setMsgBusy(false);
    }
  };

  const targetLabel = (m) => {
    if (m.target === "all") return t("Tous les utilisateurs");
    if (m.target === "shop") return t("Boutiques");
    if (m.target === "seller") return t("Vendeurs");
    if (m.target === "client") return t("Clients");
    if (m.target === "user") return `${t("Utilisateur")} : ${m.user_name || "—"}`;
    return m.target;
  };

  const resetVisits = async () => {
    if (!window.confirm(t("Réinitialiser tous les compteurs de visites ?"))) return;
    try {
      await api.adminVisitsReset();
      api
        .adminVisits(visitDays, visitCountry)
        .then((d) => setVisits(d.visits))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMessage = async (m) => {
    if (!window.confirm(t("Supprimer ce message ?"))) return;
    try {
      await api.adminDeleteMessage(m.id);
      setMessages((ms) => ms.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const resendMessage = async (m) => {
    try {
      await api.adminResendMessage(m.id);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const hideSale = async (s) => {
    if (
      !window.confirm(
        t("Masquer cette transaction de la vue admin ? Les utilisateurs ne sont pas affectés.")
      )
    )
      return;
    try {
      await api.adminHideSale(s.id);
      setTransactions((tr) => ({
        ...tr,
        hidden_count: tr.hidden_count + 1,
        rows: tr.rows.map((r) => (r.id === s.id ? { ...r, hidden: true } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreSale = async (s) => {
    try {
      await api.adminRestoreSale(s.id);
      setTransactions((tr) => ({
        ...tr,
        hidden_count: Math.max(0, tr.hidden_count - 1),
        rows: tr.rows.map((r) => (r.id === s.id ? { ...r, hidden: false } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const hideStatus = async (row) => {
    if (
      !window.confirm(
        t("Masquer ce statut de la vue admin ? Les utilisateurs ne sont pas affectés.")
      )
    )
      return;
    try {
      await api.adminHideStatus(row.status);
      setTransactions((tr) => ({
        ...tr,
        by_status: tr.by_status.map((r) => (r.status === row.status ? { ...r, hidden: true } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreStatus = async (row) => {
    try {
      await api.adminRestoreStatus(row.status);
      setTransactions((tr) => ({
        ...tr,
        by_status: tr.by_status.map((r) => (r.status === row.status ? { ...r, hidden: false } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const hideShop = async (row) => {
    if (
      !window.confirm(
        t("Masquer cette boutique de la vue admin ? Les utilisateurs ne sont pas affectés.")
      )
    )
      return;
    try {
      await api.adminHideShop(row.shop_id);
      setTransactions((tr) => ({
        ...tr,
        by_shop: tr.by_shop.map((r) => (r.shop_id === row.shop_id ? { ...r, hidden: true } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreShop = async (row) => {
    try {
      await api.adminRestoreShop(row.shop_id);
      setTransactions((tr) => ({
        ...tr,
        by_shop: tr.by_shop.map((r) => (r.shop_id === row.shop_id ? { ...r, hidden: false } : r)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const hideSeller = async (row) => {
    if (
      !window.confirm(
        t("Masquer ce vendeur de la vue admin ? Les utilisateurs ne sont pas affectés.")
      )
    )
      return;
    try {
      await api.adminHideSeller(row.seller_id);
      setTransactions((tr) => ({
        ...tr,
        by_seller: tr.by_seller.map((r) =>
          r.seller_id === row.seller_id ? { ...r, hidden: true } : r
        ),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreSeller = async (row) => {
    try {
      await api.adminRestoreSeller(row.seller_id);
      setTransactions((tr) => ({
        ...tr,
        by_seller: tr.by_seller.map((r) =>
          r.seller_id === row.seller_id ? { ...r, hidden: false } : r
        ),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const card = (label, value) => (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );

  const sendNewsletter = async (e) => {
    e.preventDefault();
    setNlOk("");
    const subject = nlSubject.trim();
    const body = nlBody.trim();
    if (!subject || !body) return;
    setNlBusy(true);
    try {
      const d = await api.adminSendNewsletter({ subject, body });
      setNlSubject("");
      setNlBody("");
      setNlOk(
        d.failed > 0
          ? t("Newsletter envoyée à {sent} abonnés ({failed} échecs).", {
              sent: d.sent,
              failed: d.failed,
            })
          : t("Newsletter envoyée à {sent} abonnés.", { sent: d.sent })
      );
      api
        .adminNewsletter()
        .then((n) => setNewsletter(n))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setNlBusy(false);
    }
  };

  const statusInfo = {
    pending: { label: "En attente", cls: "badge-pending" },
    bought: { label: "Acheté", cls: "badge-bought" },
    confirmed: { label: "Confirmée", cls: "badge-confirmed" },
    delivered: { label: "Livré", cls: "badge-bought" },
    cancelled: { label: "Annulée", cls: "badge-cancelled" },
  };
  const statusBadge = (s) => {
    const st = statusInfo[s] || { label: s, cls: "badge" };
    return <span className={`badge ${st.cls}`}>{t(st.label)}</span>;
  };

  if (gate) {
    return (
      <main className="container narrow">
        <Seo title={t("Administration") + " — Mboppi"} description={t("Administration")} noindex />
        <section className="dash-header">
          <div>
            <h1>🛡️ {t("Administration")}</h1>
            <p>{t("Espace réservé. Entrez le mot de passe administrateur.")}</p>
          </div>
          <PwaInstallButton />
        </section>
        <form onSubmit={submitGate} className="card admin-login">
          <input
            type="password"
            className="admin-login-input"
            placeholder={t("Mot de passe")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {gateError && (
            <p className="error" role="alert">
              {gateError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
            {busy ? t("Vérification…") : t("Entrer")}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title={t("Administration") + " — Mboppi"} description={t("Administration")} noindex />
      <section className="dash-header">
        <div>
          <h1>🛡️ {t("Administration")}</h1>
          <p>{t("Vue globale de la plateforme.")}</p>
        </div>
        <div className="dash-actions">
          <PwaInstallButton />
          <button type="button" className="btn btn-outline btn-small" onClick={logout}>
            {t("Se déconnecter")}
          </button>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!error && !loading && stats === null && users === null && (
        <p className="hint">{t("Chargement des données…")}</p>
      )}

      <section className="stats-grid">
        {card(t("Utilisateurs"), stats ? stats.users : "…")}
        {card(t("Boutiques"), stats ? stats.shops : "…")}
        {card(t("Créateurs"), stats ? stats.creators : "…")}
        {card(t("Vendeurs"), stats ? stats.sellers : "…")}
        {card(t("Clients"), stats ? stats.clients : "…")}
        {card(t("Livreurs"), stats ? stats.livreurs : "…")}
        {card(t("Produits"), stats ? stats.products : "…")}
        {card(t("Ventes"), stats ? stats.sales : "…")}
        {card(t("En attente"), stats ? stats.pending_sales : "…")}
        {card(t("Livrées"), stats ? stats.delivered_sales : "…")}
        {card(t("Chiffre d'affaires"), stats ? `${formatMoney(stats.revenue)}` : "…")}
        {card(t("Avis"), stats ? `${stats.reviews} (${stats.rating_avg}/5)` : "…")}
        {card(t("Inscrits aujourd'hui"), stats ? stats.users_today : "…")}
        {card(t("Abonnés newsletter"), stats ? stats.newsletter_subscribers : "…")}
      </section>

      {visits && (
        <section aria-label={t("Analyse des visites")} className="visits-panel">
          <div className="visits-head">
            <h2 className="section-title">📈 {t("Analyse des visites")}</h2>
            <div className="visits-range" role="group" aria-label={t("Période")}>
              {VISIT_RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  className={`btn btn-small ${visitDays === r.days ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setVisitDays(r.days)}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
            <select
              className="msg-select visits-country"
              aria-label={t("Filtrer par pays")}
              value={visitCountry}
              onChange={(e) => setVisitCountry(e.target.value)}
            >
              <option value="">{t("Tous les pays")}</option>
              {(visits.countries || []).map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country === "CM" ? "🇨🇲 Cameroun" : c.country} — {c.visitor_count} visiteur(s),{" "}
                  {c.views} vues
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-danger btn-small" onClick={resetVisits}>
              {t("Réinitialiser")}
            </button>
          </div>
          <div className="stats-grid">
            {card(t("Pages vues"), formatMoney(visits.page_views))}
            {card(t("Visiteurs uniques"), formatMoney(visits.unique_visitors))}
            {card(t("Jours actifs"), visits.active_days)}
          </div>
        </section>
      )}

      <h2 className="section-title">✉️ {t("Messages aux utilisateurs")}</h2>
      <form onSubmit={sendMessage} className="card msg-form">
        <p className="hint">
          {t(
            "Envoyez un message qui s'affichera en popup à la prochaine connexion des utilisateurs (une seule fois)."
          )}
        </p>
        <textarea
          className="msg-textarea"
          rows="4"
          maxLength="2000"
          placeholder={t("Votre message…")}
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
        />
        <div className="msg-target-row">
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "all"}
              onChange={() => setMsgTarget("all")}
            />
            <span>{t("À tous les utilisateurs")}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "user"}
              onChange={() => setMsgTarget("user")}
            />
            <span>{t("À un utilisateur")}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "shop"}
              onChange={() => setMsgTarget("shop")}
            />
            <span>{t("Aux boutiques")}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "seller"}
              onChange={() => setMsgTarget("seller")}
            />
            <span>{t("Aux vendeurs")}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "client"}
              onChange={() => setMsgTarget("client")}
            />
            <span>{t("Aux clients")}</span>
          </label>
        </div>
        {msgTarget === "user" && (
          <select
            className="msg-select"
            value={msgUserId}
            onChange={(e) => setMsgUserId(e.target.value)}
            required
          >
            <option value="">{t("Choisir un utilisateur…")}</option>
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.email} ({u.role})
              </option>
            ))}
          </select>
        )}
        {msgOk && (
          <p className="success" role="status">
            {msgOk}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={msgBusy || !msgText.trim() || (msgTarget === "user" && !msgUserId)}
        >
          {msgBusy ? t("Envoi…") : t("Envoyer")}
        </button>
      </form>

      <h3>{t("Messages envoyés")}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("Message")}</th>
              <th>{t("Destinataires")}</th>
              <th>{t("Date")}</th>
              <th>{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {messages === null ? (
              <tr>
                <td colSpan="4">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : messages.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("Aucun message envoyé")}
                </td>
              </tr>
            ) : (
              messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.message}</td>
                  <td>{targetLabel(m)}</td>
                  <td className="hint">{new Date(m.created_at).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      onClick={() => resendMessage(m)}
                    >
                      {t("Renvoyer")}
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => deleteMessage(m)}
                    >
                      {t("Supprimer")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">✉️ {t("Newsletter")}</h2>
      <form onSubmit={sendNewsletter} className="card msg-form">
        <p className="hint">
          {t(
            "Envoyez une newsletter par email à tous les abonnés. Chaque abonné reçoit le lien de désabonnement automatiquement."
          )}
        </p>
        <input
          className="msg-textarea"
          placeholder={t("Sujet de la newsletter")}
          maxLength="140"
          value={nlSubject}
          onChange={(e) => setNlSubject(e.target.value)}
        />
        <textarea
          className="msg-textarea"
          rows="6"
          maxLength="5000"
          placeholder={t("Contenu de la newsletter…")}
          value={nlBody}
          onChange={(e) => setNlBody(e.target.value)}
        />
        {nlOk && (
          <p className="success" role="status">
            {nlOk}
          </p>
        )}
        <p className="hint">
          {newsletter
            ? newsletter.count === 0
              ? t("Aucun abonné pour le moment.")
              : t("Envoyer à {count} abonnés", { count: newsletter.count })
            : t("Chargement…")}
        </p>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={nlBusy || !nlSubject.trim() || !nlBody.trim()}
        >
          {nlBusy ? t("Envoi…") : t("Envoyer la newsletter")}
        </button>
      </form>

      <h2 className="section-title">👥 {t("Utilisateurs")}</h2>
      <form onSubmit={searchUsers} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          placeholder={t("Rechercher un utilisateur (nom ou email)…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          {t("Rechercher")}
        </button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("Nom")}</th>
              <th>{t("Email")}</th>
              <th>{t("Téléphone")}</th>
              <th>{t("Rôle")}</th>
              <th>{t("Pays")}</th>
              <th>{t("Référence")}</th>
              <th>{t("Inscription")}</th>
              <th>{t("Adhésion")}</th>
              <th>{t("Vérifié")}</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr>
                <td colSpan="9">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty">
                  {t("Aucun utilisateur")}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="hint">{u.email}</td>
                  <td>{u.phone || "—"}</td>
                  <td>
                    <span className="badge">{t(u.role)}</span>
                  </td>
                  <td>{u.country || "—"}</td>
                  <td>
                    <code>{u.reference_number || "—"}</code>
                  </td>
                  <td className="hint">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="hint">
                    {u.membership_fee
                      ? `${u.membership_fee} · ${u.membership_expires_at ? new Date(u.membership_expires_at).toLocaleDateString() : t("Non payée")}`
                      : t("Non requise")}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-small ${u.verified ? "btn-primary" : "btn-outline"}`}
                      onClick={() => toggleVerified(u)}
                    >
                      {u.verified ? t("✓ Vérifié") : t("Vérifier")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <Logo className="logo-inline" /> {t("Produits")}
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("Produit")}</th>
              <th>{t("Boutique")}</th>
              <th>{t("Prix")}</th>
              <th>{t("Date")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr>
                <td colSpan="5">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty">
                  {t("Aucun produit")}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.shop_name}
                    {p.shop_verified && <span className="badge badge-verified">✓</span>}
                  </td>
                  <td>
                    {formatMoney(p.price)} {countrySymbol("")}
                  </td>
                  <td className="hint">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-outline"
                      onClick={() => window.open("/produit/" + p.id)}
                    >
                      {t("Voir")}
                    </button>{" "}
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => removeProduct(p)}
                    >
                      {t("Supprimer")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">{t("💸 Toutes les transactions")}</h2>
      <p className="hint">
        {t(
          "Activité regroupée de tous les utilisateurs (boutiques, vendeurs, clients, livreurs, créateurs)."
        )}
      </p>
      {transactions === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 80 }}></div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {card(t("Transactions avec vendeur"), transactions.with_seller.count)}
            {card(t("Commandes directes (panier)"), transactions.direct.count)}
            {card(
              t("Montant commandes directes"),
              `${formatMoney(transactions.direct.total)} ${countrySymbol("")}`
            )}
          </div>

          <div className="transactions-head">
            <h3>{t("Par statut")}</h3>
            <button
              type="button"
              className={`btn btn-small ${showHiddenStatus ? "btn-primary" : "btn-outline"}`}
              onClick={() => setShowHiddenStatus((v) => !v)}
            >
              {t("Masqués")} ({transactions.by_status.filter((r) => r.hidden).length})
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Statut")}</th>
                  <th>{t("Nombre")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = transactions.by_status.filter((r) =>
                    showHiddenStatus ? r.hidden : !r.hidden
                  );
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan="4" className="empty">
                          {t("Aucune transaction")}
                        </td>
                      </tr>
                    );
                  }
                  return rows.map((r) => (
                    <tr key={r.status} className={r.hidden ? "tr-hidden" : undefined}>
                      <td>{statusBadge(r.status)}</td>
                      <td>{r.count}</td>
                      <td>
                        {formatMoney(r.total)} {countrySymbol("")}
                      </td>
                      <td>
                        {r.hidden ? (
                          <>
                            <span className="badge badge-cancelled">{t("masqué")}</span>{" "}
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => restoreStatus(r)}
                            >
                              {t("Restaurer")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => hideStatus(r)}
                          >
                            {t("Supprimer")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <div className="transactions-head">
            <h3>{t("Par boutique")}</h3>
            <button
              type="button"
              className={`btn btn-small ${showHiddenShop ? "btn-primary" : "btn-outline"}`}
              onClick={() => setShowHiddenShop((v) => !v)}
            >
              {t("Masquées")} ({transactions.by_shop.filter((r) => r.hidden).length})
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Boutique")}</th>
                  <th>{t("Pays")}</th>
                  <th>{t("Ventes")}</th>
                  <th>{t("Chiffre d'affaires")}</th>
                  <th>{t("Commissions")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = transactions.by_shop.filter((r) =>
                    showHiddenShop ? r.hidden : !r.hidden
                  );
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan="6" className="empty">
                          {t("Aucune transaction")}
                        </td>
                      </tr>
                    );
                  }
                  return rows.map((r) => (
                    <tr key={r.shop_id} className={r.hidden ? "tr-hidden" : undefined}>
                      <td>{r.shop_name}</td>
                      <td>{r.country || "—"}</td>
                      <td>{r.count}</td>
                      <td>
                        {formatMoney(r.revenue)} {countrySymbol("")}
                      </td>
                      <td>
                        {formatMoney(r.commission)} {countrySymbol("")}
                      </td>
                      <td>
                        {r.hidden ? (
                          <>
                            <span className="badge badge-cancelled">{t("masquée")}</span>{" "}
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => restoreShop(r)}
                            >
                              {t("Restaurer")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => hideShop(r)}
                          >
                            {t("Supprimer")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <div className="transactions-head">
            <h3>{t("Par vendeur")}</h3>
            <button
              type="button"
              className={`btn btn-small ${showHiddenSeller ? "btn-primary" : "btn-outline"}`}
              onClick={() => setShowHiddenSeller((v) => !v)}
            >
              {t("Masqués")} ({transactions.by_seller.filter((r) => r.hidden).length})
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Vendeur")}</th>
                  <th>{t("Code")}</th>
                  <th>{t("Ventes")}</th>
                  <th>{t("Commissions")}</th>
                  <th>{t("Payées")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = transactions.by_seller.filter((r) =>
                    showHiddenSeller ? r.hidden : !r.hidden
                  );
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan="6" className="empty">
                          {t("Aucune transaction")}
                        </td>
                      </tr>
                    );
                  }
                  return rows.map((r) => (
                    <tr key={r.seller_id} className={r.hidden ? "tr-hidden" : undefined}>
                      <td>{r.seller_name}</td>
                      <td>
                        <code className="seller-code-inline">{r.seller_code || "—"}</code>
                      </td>
                      <td>{r.count}</td>
                      <td>
                        {formatMoney(r.commission)} {countrySymbol("")}
                      </td>
                      <td>
                        {formatMoney(r.paid)} {countrySymbol("")}
                      </td>
                      <td>
                        {r.hidden ? (
                          <>
                            <span className="badge badge-cancelled">{t("masqué")}</span>{" "}
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => restoreSeller(r)}
                            >
                              {t("Restaurer")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => hideSeller(r)}
                          >
                            {t("Supprimer")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <div className="transactions-head">
            <h3 className="section-title">{t("Dernières transactions")}</h3>
            <button
              type="button"
              className={`btn btn-small ${showHidden ? "btn-primary" : "btn-outline"}`}
              onClick={() => setShowHidden((v) => !v)}
            >
              {t("Masquées")} ({transactions.hidden_count || 0})
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("Produit")}</th>
                  <th>{t("Boutique")}</th>
                  <th>{t("Vendeur")}</th>
                  <th>{t("Parrain")}</th>
                  <th>{t("Client")}</th>
                  <th>{t("Montant")}</th>
                  <th>{t("Commission")}</th>
                  <th>{t("Statut")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const visible = (transactions.rows || []).filter((r) =>
                    showHidden ? r.hidden : !r.hidden
                  );
                  if (visible.length === 0) {
                    return (
                      <tr>
                        <td colSpan="10" className="empty">
                          {t("Aucune transaction")}
                        </td>
                      </tr>
                    );
                  }
                  return visible.map((r) => (
                    <tr key={r.id} className={r.hidden ? "tr-hidden" : undefined}>
                      <td>{r.product_name}</td>
                      <td>{r.shop_name}</td>
                      <td>{r.seller_name}</td>
                      <td>{r.parrain_name && r.parrain_name !== "—" ? r.parrain_name : "—"}</td>
                      <td>{r.buyer_name || "—"}</td>
                      <td>
                        {formatMoney(r.total_price)} {countrySymbol(r.shop_country)}
                      </td>
                      <td>
                        {formatMoney(r.commission + r.referral_commission)}{" "}
                        {countrySymbol(r.shop_country)}
                      </td>
                      <td>{statusBadge(r.status)}</td>
                      <td className="hint">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>
                        {r.hidden ? (
                          <>
                            <span className="badge badge-cancelled">{t("masquée")}</span>{" "}
                            <button
                              type="button"
                              className="btn btn-small btn-outline"
                              onClick={() => restoreSale(r)}
                            >
                              {t("Restaurer")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => hideSale(r)}
                          >
                            {t("Supprimer")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
