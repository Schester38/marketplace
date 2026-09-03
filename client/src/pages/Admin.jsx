import React, { useCallback, useEffect, useState } from "react";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import PwaInstallButton from "../components/PwaInstallButton.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { countrySymbol } from "../config.js";
import MiniChart from "../components/MiniChart.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

const VISIT_RANGES = [
  { days: 1, label: "1 jour" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "1 mois" },
];

function getMembershipCountdownState(expiresAt) {
  if (!expiresAt) {
    return { label: "â€”", tone: "neutral", daysLeft: null, blinking: false };
  }
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  if (diffMs <= 0) {
    return { label: "ExpirÃ©", tone: "danger", daysLeft: 0, blinking: false };
  }
  if (daysLeft <= 1) {
    return { label: `${daysLeft} jour restant`, tone: "danger", daysLeft, blinking: true };
  }
  if (daysLeft <= 3) {
    return { label: `${daysLeft} jours restants`, tone: "danger", daysLeft, blinking: false };
  }
  if (daysLeft <= 7) {
    return { label: `${daysLeft} jours restants`, tone: "warning", daysLeft, blinking: false };
  }
  return { label: `${daysLeft} jours restants`, tone: "success", daysLeft, blinking: false };
}

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
  const [loading, setLoading] = useState(false);
  const [referrals, setReferrals] = useState(null);
  const [refSearch, setRefSearch] = useState("");
  const [refError, setRefError] = useState("");
  const [withdrawals, setWithdrawals] = useState(null);
  const [wdError, setWdError] = useState("");
  // SystÃ¨me de paiement (manuel â†” automatique)
  const [paySettings, setPaySettings] = useState(null);
  const [waSettings, setWaSettings] = useState(null);
  const [waForm, setWaForm] = useState({
    provider: "",
    admin_phone: "",
    callmebot_key: "",
    cloud_token: "",
    cloud_phone_id: "",
    notify_email: "",
  });
  const [waBusy, setWaBusy] = useState(false);
  const [waMsg, setWaMsg] = useState("");
  const [payPublicKey, setPayPublicKey] = useState("");
  const [paySecretKey, setPaySecretKey] = useState("");
  const [payments, setPayments] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [payOk, setPayOk] = useState("");

  const payMode = paySettings?.mode === "auto" ? "auto" : "manual";
  const isManual = payMode === "manual";

  const load = useCallback(
    (silent) => {
      if (!silent) setLoading(true);
      const onErr = (e) => {
        if (e && (e.status === 401 || e.status === 403)) {
          localStorage.removeItem("admin_token");
          setGate(true);
          setGateError(
            t("Session expirÃ©e ou invalide. Entrez Ã  nouveau le mot de passe administrateur.")
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
      api
        .adminMessages()
        .then((d) => setMessages(d.messages))
        .catch(onErr);
      api
        .adminNewsletter()
        .then((d) => setNewsletter(d))
        .catch(() => {});
      api
        .adminReferrals()
        .then((d) => setReferrals(d.referrals))
        .catch(() => {});
      api
        .adminWithdrawals()
        .then((d) => setWithdrawals(d.withdrawals))
        .catch(() => {});
      api
        .adminPaymentSettings()
        .then((d) => {
          setPaySettings(d);
          setPayPublicKey(d?.ikeepay?.public_key || "");
          setPaySecretKey("");
        })
        .catch(() => {});
      api
        .adminWhatsAppSettings()
        .then((d) => {
          setWaSettings(d || {});
          setWaForm((f) => ({
            ...f,
            provider: d?.provider || "",
            admin_phone: d?.admin_phone_masked || "",
            notify_email: d?.notify_email || "",
          }));
        })
        .catch(() => {});
      api
        .adminPayments()
        .then((d) => setPayments(d))
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

  // Temps rÃ©el : actualisation silencieuse des statistiques, transactions et
  // visites toutes les 30 s, quel que soit le mode de paiement.
  useEffect(() => {
    if (gate) return undefined;
    const id = setInterval(() => {
      load(true);
      api
        .adminVisits(visitDays, visitCountry)
        .then((d) => setVisits(d.visits))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [gate, load, visitDays, visitCountry]);

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
    setMessages(null);
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

  const searchReferrals = async (e) => {
    e.preventDefault();
    setRefError("");
    try {
      const d = await api.adminReferrals(refSearch.trim());
      setReferrals(d.referrals);
    } catch (err) {
      setRefError(err.message);
    }
  };

  const markReferralPaid = async (r) => {
    if (
      !window.confirm(
        t("Marquer l'adhÃ©sion de {name} comme payÃ©e et avertir son parrain ?", {
          name: r.parraine.name,
        })
      )
    )
      return;
    setRefError("");
    try {
      await api.adminMarkReferralPaid(r.parraine.id);
      setReferrals((rs) =>
        rs.map((x) =>
          x.parraine.id === r.parraine.id
            ? { ...x, parraine: { ...x.parraine, membership_paid: true } }
            : x
        )
      );
    } catch (err) {
      setRefError(err.message);
    }
  };

  const payWithdrawal = async (w) => {
    setWdError("");
    if (
      !window.confirm(
        t("Payer la demande de retrait de {amount} F pour {name} ?", {
          amount: formatMoney(w.amount),
          name: w.seller.name,
        })
      )
    )
      return;
    try {
      await api.adminPayWithdrawal(w.id);
      setWithdrawals((ws) =>
        ws.map((x) =>
          x.id === w.id ? { ...x, status: "paid", paid_at: new Date().toISOString() } : x
        )
      );
    } catch (err) {
      setWdError(err.message);
    }
  };

  const togglePaymentMode = async () => {
    setPayError("");
    setPayOk("");
    setPayBusy(true);
    try {
      const next = payMode === "auto" ? "manual" : "auto";
      await api.adminUpdatePaymentSettings({ mode: next });
      setPaySettings((s) => ({ ...s, mode: next }));
      setPayOk(
        next === "auto"
          ? t("Mode automatique activÃ© : les adhÃ©sions et dons se paient en ligne (iKeePay).")
          : t("Mode manuel activÃ© : les paiements se font sous contrÃ´le de l'administrateur.")
      );
      load(true);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
  };

  const savePaymentKeys = async (e) => {
    e.preventDefault();
    setPayError("");
    setPayOk("");
    setPayBusy(true);
    try {
      await api.adminUpdatePaymentSettings({
        ikeepay_public_key: payPublicKey.trim(),
        ikeepay_secret_key: paySecretKey.trim(),
      });
      setPaySecretKey("");
      setPayOk(t("ClÃ©s iKeePay enregistrÃ©es."));
      load(true);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
  };

  // â”€â”€â”€ WhatsApp : sauvegarde des rÃ©glages + test d'envoi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Le numÃ©ro masquÃ© renvoyÃ© par le serveur (â€¢â€¢â€¢â€¢) n'est jamais renvoyÃ© tel
  // quel : on ne modifie le numÃ©ro que si l'admin en saisit un nouveau.
  const buildWhatsAppPayload = () => {
    const p = { provider: waForm.provider };
    const phone = waForm.admin_phone.trim();
    if (phone && !phone.includes("â€¢â€¢â€¢â€¢")) p.admin_phone = phone;
    if (waForm.callmebot_key.trim()) p.callmebot_key = waForm.callmebot_key.trim();
    if (waForm.cloud_token.trim()) p.cloud_token = waForm.cloud_token.trim();
    if (waForm.cloud_phone_id.trim()) p.cloud_phone_id = waForm.cloud_phone_id.trim();
    if (waForm.notify_email.trim()) p.notify_email = waForm.notify_email.trim();
    return p;
  };

  const saveWhatsAppSettings = async (e) => {
    e.preventDefault();
    setWaMsg("");
    setWaBusy(true);
    try {
      const d = await api.adminUpdateWhatsAppSettings(buildWhatsAppPayload());
      setWaSettings(d);
      setWaForm((f) => ({ ...f, callmebot_key: "", cloud_token: "", cloud_phone_id: "" }));
      setWaMsg(
        d?.configured
          ? t("Notifications WhatsApp configurÃ©es âœ…")
          : t("RÃ©glages enregistrÃ©s â€” WhatsApp inactif tant que le fournisseur est incomplet.")
      );
    } catch (err) {
      setWaMsg("âŒ " + err.message);
    } finally {
      setWaBusy(false);
    }
  };

  const testWhatsApp = async () => {
    setWaMsg("");
    setWaBusy(true);
    try {
      const d = await api.adminTestWhatsApp();
      setWaMsg(
        d?.ok
          ? t("Test envoyÃ© â€” vÃ©rifiez votre WhatsApp et/ou votre boÃ®te email âœ…")
          : t("Test Ã©chouÃ©.")
      );
    } catch (err) {
      setWaMsg("âŒ " + err.message);
    } finally {
      setWaBusy(false);
    }
  };

  // Secours : marquer un don Â« en attente Â» comme complÃ©tÃ© (si le webhook n'est
  // jamais arrivÃ©). RÃ©servÃ© Ã  l'admin, Ã  n'utiliser qu'aprÃ¨s vÃ©rification.
  const completeDonation = async (d) => {
    if (
      !window.confirm(
        t("Marquer le don de {amount} F comme complÃ©tÃ© ?", { amount: formatMoney(d.amount) })
      )
    )
      return;
    setPayError("");
    setPayOk("");
    try {
      await api.adminCompleteDonation(d.id);
      setPayments((p) => ({
        ...p,
        donations: (p?.donations || []).map((x) =>
          x.id === d.id ? { ...x, status: "completed", completed_at: new Date().toISOString() } : x
        ),
      }));
      setPayOk(t("Don marquÃ© comme complÃ©tÃ©."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  // Supprimer une ligne de paiement (don ou adhÃ©sion) â€” action admin.
  const deleteDonation = async (d) => {
    if (
      !window.confirm(
        t("Supprimer le don de {amount} F ({ref}) ?", {
          amount: formatMoney(d.amount),
          ref: d.external_reference,
        })
      )
    )
      return;
    setPayError("");
    setPayOk("");
    try {
      await api.adminDeleteDonation(d.id);
      setPayments((p) => ({
        ...p,
        donations: (p?.donations || []).filter((x) => x.id !== d.id),
      }));
      setPayOk(t("Don supprimÃ©."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  const deleteMembership = async (m) => {
    if (
      !window.confirm(
        t("Supprimer le paiement d'adhÃ©sion de {name} ({ref}) ?", {
          name: m.user_name,
          ref: m.external_reference,
        })
      )
    )
      return;
    setPayError("");
    setPayOk("");
    try {
      await api.adminDeleteMembership(m.id);
      setPayments((p) => ({
        ...p,
        memberships: (p?.memberships || []).filter((x) => x.id !== m.id),
      }));
      setPayOk(t("Paiement d'adhÃ©sion supprimÃ©."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  // Secours : complÃ©ter manuellement une adhÃ©sion Â« en attente Â» et activer le
  // compte (le webhook n'a pas rattachÃ© la rÃ©fÃ©rence).
  const completeMembership = async (m) => {
    if (
      !window.confirm(
        t("ComplÃ©ter l'adhÃ©sion de {name} ({amount} F) et activer son compte ?", {
          name: m.user_name,
          amount: formatMoney(m.amount),
        })
      )
    )
      return;
    setPayError("");
    setPayOk("");
    try {
      await api.adminCompleteMembership(m.id);
      setPayments((p) => ({
        ...p,
        memberships: (p?.memberships || []).map((x) =>
          x.id === m.id
            ? { ...x, status: "completed", completed_at: new Date().toISOString() }
            : x
        ),
      }));
      setPayOk(t("AdhÃ©sion complÃ©tÃ©e et compte activÃ©."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  const toggleAdminApproved = async (u) => {
    try {
      await api.adminSetAdminApproved(u.id, !u.admin_approved);
      setUsers((us) =>
        us.map((x) => (x.id === u.id ? { ...x, admin_approved: !x.admin_approved } : x))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleVerified = async (u) => {
    try {
      await api.adminSetVerified(u.id, !u.verified);
      setUsers((us) =>
        us.map((x) => (x.id === u.id ? { ...x, verified: !x.verified } : x))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProduct = async (p) => {
    if (!window.confirm(t("Supprimer Â« {name} Â» ?", { name: p.name }))) return;
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
      setMsgOk(t("Message envoyÃ© avec succÃ¨s."));
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
    if (m.target === "creator") return t("CrÃ©ateurs");
    if (m.target === "user") return `${t("Utilisateur")} : ${m.user_name || "â€”"}`;
    return m.target;
  };

  const resetVisits = async () => {
    if (!window.confirm(t("RÃ©initialiser tous les compteurs de visites ?"))) return;
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
          ? t("Newsletter envoyÃ©e Ã  {sent} abonnÃ©s ({failed} Ã©checs).", {
              sent: d.sent,
              failed: d.failed,
            })
          : t("Newsletter envoyÃ©e Ã  {sent} abonnÃ©s.", { sent: d.sent })
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
    bought: { label: "AchetÃ©", cls: "badge-bought" },
    confirmed: { label: "ConfirmÃ©e", cls: "badge-confirmed" },
    delivered: { label: "LivrÃ©", cls: "badge-bought" },
    cancelled: { label: "AnnulÃ©e", cls: "badge-cancelled" },
  };
  const statusBadge = (s) => {
    const st = statusInfo[s] || { label: s, cls: "badge" };
    return <span className={`badge ${st.cls}`}>{t(st.label)}</span>;
  };

  if (gate) {
    return (
      <main className="container narrow">
        <Seo title={t("Administration") + " â€” Mboppi"} description={t("Administration")} noindex />
        <section className="dash-header">
          <div>
            <h1>ðŸ›¡ï¸ {t("Administration")}</h1>
            <p>{t("Espace rÃ©servÃ©. Entrez le mot de passe administrateur.")}</p>
          </div>
          <PwaInstallButton />
        </section>
        <form onSubmit={submitGate} className="card admin-login">
          <PasswordInput
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
            {busy ? t("VÃ©rificationâ€¦") : t("Entrer")}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title={t("Administration") + " â€” Mboppi"} description={t("Administration")} noindex />
      <section className="dash-header">
        <div>
          <h1>ðŸ›¡ï¸ {t("Administration")}</h1>
          <p>{t("Vue globale de la plateforme.")}</p>
        </div>
        <div className="dash-actions">
          <PwaInstallButton />
          <button type="button" className="btn btn-outline btn-small" onClick={logout}>
            {t("Se dÃ©connecter")}
          </button>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!error && !loading && stats === null && users === null && (
        <p className="hint">{t("Chargement des donnÃ©esâ€¦")}</p>
      )}

      <section className="stats-grid">
        {card(t("Utilisateurs"), stats ? stats.users : "â€¦")}
        {card(t("Boutiques"), stats ? stats.shops : "â€¦")}
        {card(t("CrÃ©ateurs"), stats ? stats.creators : "â€¦")}
        {card(t("Vendeurs"), stats ? stats.sellers : "â€¦")}
        {card(t("Clients"), stats ? stats.clients : "â€¦")}
        {card(t("Livreurs"), stats ? stats.livreurs : "â€¦")}
        {card(t("Produits"), stats ? stats.products : "â€¦")}
        {card(t("Ventes"), stats ? stats.sales : "â€¦")}
        {card(t("En attente"), stats ? stats.pending_sales : "â€¦")}
        {card(t("LivrÃ©es"), stats ? stats.delivered_sales : "â€¦")}
        {card(t("Chiffre d'affaires"), stats ? `${formatMoney(stats.revenue)}` : "â€¦")}
        {card(t("Avis"), stats ? `${stats.reviews} (${stats.rating_avg}/5)` : "â€¦")}
        {card(t("Inscrits aujourd'hui"), stats ? stats.users_today : "â€¦")}
        {card(t("AbonnÃ©s newsletter"), stats ? stats.newsletter_subscribers : "â€¦")}
      </section>

      {stats && (
        <section className="card section" style={{ marginBottom: 18 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            ðŸ‘¥ {t("RÃ©partition des utilisateurs")}
          </h3>
          <div className="role-bars">
            {[
              { k: "shops", label: t("Boutiques"), icon: "ðŸ¬", color: "#ee7d00" },
              { k: "sellers", label: t("Vendeurs"), icon: "ðŸ§‘â€ðŸ’¼", color: "#2563eb" },
              { k: "clients", label: t("Clients"), icon: "ðŸ‘¥", color: "#16a34a" },
              { k: "creators", label: t("CrÃ©ateurs"), icon: "ðŸŽ¨", color: "#7c3aed" },
              { k: "livreurs", label: t("Livreurs"), icon: "ðŸ›µ", color: "#0891b2" },
            ].map((r) => {
              const total = Number(stats.users) || 0;
              const v = Number(stats[r.k]) || 0;
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              return (
                <div className="role-bar-row" key={r.k}>
                  <span className="role-bar-label">
                    {r.icon} {r.label}
                  </span>
                  <div className="role-bar-track">
                    <div className="role-bar-fill" style={{ width: `${pct}%`, background: r.color }} />
                  </div>
                  <span className="role-bar-value">
                    {v} Â· {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visits && (
        <section aria-label={t("Analyse des visites")} className="visits-panel">
          <div className="visits-head">
            <h2 className="section-title">ðŸ“ˆ {t("Analyse des visites")}</h2>
            <div className="visits-range" role="group" aria-label={t("PÃ©riode")}>
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
                  {c.country === "CM" ? "ðŸ‡¨ðŸ‡² Cameroun" : c.country} â€” {c.visitor_count} visiteur(s),{" "}
                  {c.views} vues
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-danger btn-small" onClick={resetVisits}>
              {t("RÃ©initialiser")}
            </button>
          </div>
          <div className="stats-grid">
            {card(t("Pages vues"), formatMoney(visits.page_views))}
            {card(t("Visiteurs uniques"), formatMoney(visits.unique_visitors))}
            {card(t("Jours actifs"), visits.active_days)}
          </div>

        </section>
      )}

      <h2 className="section-title">âœ‰ï¸ {t("Messages aux utilisateurs")}</h2>
      <form onSubmit={sendMessage} className="card msg-form">
        <p className="hint">
          {t(
            "Envoyez un message qui s'affichera en popup Ã  la prochaine connexion des utilisateurs (une seule fois)."
          )}
        </p>
        <textarea
          className="msg-textarea"
          rows="4"
          maxLength="2000"
          placeholder={t("Votre messageâ€¦")}
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
            <span>{t("Ã€ tous les utilisateurs")}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "user"}
              onChange={() => setMsgTarget("user")}
            />
            <span>{t("Ã€ un utilisateur")}</span>
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
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "creator"}
              onChange={() => setMsgTarget("creator")}
            />
            <span>{t("Aux crÃ©ateurs")}</span>
          </label>
        </div>
        {msgTarget === "user" && (
          <select
            className="msg-select"
            value={msgUserId}
            onChange={(e) => setMsgUserId(e.target.value)}
            required
          >
            <option value="">{t("Choisir un utilisateurâ€¦")}</option>
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} â€” {u.email} ({u.role})
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
          {msgBusy ? t("Envoiâ€¦") : t("Envoyer")}
        </button>
      </form>

      <h3>{t("Messages envoyÃ©s")}</h3>
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
                  {t("Aucun message envoyÃ©")}
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

      <h2 className="section-title">âœ‰ï¸ {t("Newsletter")}</h2>
      <form onSubmit={sendNewsletter} className="card msg-form">
        <p className="hint">
          {t(
            "Envoyez une newsletter par email Ã  tous les abonnÃ©s. Chaque abonnÃ© reÃ§oit le lien de dÃ©sabonnement automatiquement."
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
          placeholder={t("Contenu de la newsletterâ€¦")}
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
              ? t("Aucun abonnÃ© pour le moment.")
              : t("Envoyer Ã  {count} abonnÃ©s", { count: newsletter.count })
            : t("Chargementâ€¦")}
        </p>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={nlBusy || !nlSubject.trim() || !nlBody.trim()}
        >
          {nlBusy ? t("Envoiâ€¦") : t("Envoyer la newsletter")}
        </button>
      </form>

      {/* ===== SystÃ¨me de paiement : bascule manuel â†” automatique (toujours visible) ===== */}
      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          âš™ï¸ {t("SystÃ¨me de paiement")}
        </h2>
        <div className="payment-mode-toggle">
          <span className={`payment-mode-badge ${payMode}`}>
            {payMode === "auto" ? "ðŸŸ¢ " + t("Automatique (iKeePay)") : "ðŸ”µ " + t("Manuel")}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={payBusy}
            onClick={togglePaymentMode}
          >
            {payBusy
              ? "â€¦"
              : payMode === "auto"
                ? "ðŸ” " + t("Basculer vers le manuel")
                : "ðŸ” " + t("Basculer vers l'automatique")}
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>
          {payMode === "auto"
            ? t(
                "Mode automatique : les adhÃ©sions et les dons se paient en ligne via iKeePay. Les retraits des commissions d'activation restent manuels (validÃ©s ici)."
              )
            : t(
                "Mode manuel : l'administration valide chaque adhÃ©sion et chaque paiement (adhÃ©sions, dons, parrainages)."
              )}
        </p>
        {payError && <p className="error">{payError}</p>}
        {payOk && <p className="success">{payOk}</p>}
        <form
          onSubmit={savePaymentKeys}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>
              {t("ClÃ© publique iKeePay")}
            </label>
            <input
              className="input"
              value={payPublicKey}
              onChange={(e) => setPayPublicKey(e.target.value)}
              placeholder="pk_..."
            />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>
              {t("ClÃ© secrÃ¨te iKeePay")}
            </label>
            <input
              type="password"
              className="input"
              value={paySecretKey}
              onChange={(e) => setPaySecretKey(e.target.value)}
              placeholder={paySettings?.ikeepay?.secret_key_set ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : "sk_..."}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-small" disabled={payBusy}>
            {payBusy ? "â€¦" : t("Enregistrer")}
          </button>
        </form>
        {paySettings?.ikeepay_configured ? (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            âœ… {t("iKeePay configurÃ©.")}
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            âš ï¸ {t("iKeePay non configurÃ© : le mode automatique restera indisponible.")}
          </p>
        )}
        {paySettings?.webhook_url ? (
          <div style={{ marginTop: 10 }}>
            <p className="hint" style={{ marginBottom: 6 }}>
              ðŸ” {t("Webhook Ã  enregistrer chez iKeePay (URL protÃ©gÃ©e par un token secret) :")}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code
                style={{
                  background: "rgba(0,0,0,.05)",
                  padding: "6px 8px",
                  borderRadius: 6,
                  wordBreak: "break-all",
                  flex: "1 1 240px",
                }}
              >
                {paySettings.webhook_url}
              </code>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(paySettings.webhook_url);
                    setPayOk(t("URL du webhook copiÃ©e."));
                  } catch {
                    /* clipboard indisponible */
                  }
                }}
              >
                ðŸ“‹ {t("Copier")}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
              âš ï¸ {t("Sans ce token dans l'URL, iKeePay ne peut plus confirmer les paiements.")}
            </p>
          </div>
        ) : null}

        {/* Notifications WhatsApp automatiques (demandes de retrait d'activation) */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eee" }}>
          <h3 style={{ marginTop: 0 }}>ðŸ“± {t("Notifications WhatsApp (retraits d'activation)")}</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            {t(
              "Recevez automatiquement (WhatsApp et/ou email) chaque demande de retrait envoyÃ©e par un vendeur parrain."
            )}
          </p>
          <form onSubmit={saveWhatsAppSettings} className="ikeepay-keys-form">
            <div className="form-row">
              <label>
                {t("Fournisseur")}
                <select
                  value={waForm.provider}
                  onChange={(e) => setWaForm((f) => ({ ...f, provider: e.target.value }))}
                >
                  <option value="">{t("â€” DÃ©sactivÃ© â€”")}</option>
                  <option value="callmebot">CallMeBot (gratuit, simple)</option>
                  <option value="cloud">WhatsApp Cloud API (Meta)</option>
                </select>
              </label>
              <label>
                {t("Votre numÃ©ro WhatsApp (format international)")}
                <input
                  type="tel"
                  placeholder="237699486146"
                  value={waForm.admin_phone}
                  onChange={(e) => setWaForm((f) => ({ ...f, admin_phone: e.target.value }))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                {t("Email de notification (retraits d'activation)")}
                <input
                  type="email"
                  placeholder="vous@exemple.com"
                  value={waForm.notify_email}
                  onChange={(e) => setWaForm((f) => ({ ...f, notify_email: e.target.value }))}
                />
              </label>
            </div>
            {waForm.provider === "callmebot" && (
              <div className="form-row">
                <label>
                  {t("ClÃ© API CallMeBot")}
                  <input
                    type="text"
                    placeholder={waSettings?.provider === "callmebot" ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : "clÃ© reÃ§ue par WhatsApp"}
                    value={waForm.callmebot_key}
                    onChange={(e) => setWaForm((f) => ({ ...f, callmebot_key: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {waForm.provider === "cloud" && (
              <>
                <div className="form-row">
                  <label>
                    {t("Token d'accÃ¨s permanent (Meta)")}
                    <input
                      type="password"
                      placeholder={waSettings?.provider === "cloud" ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : "EAAG..."}
                      value={waForm.cloud_token}
                      onChange={(e) => setWaForm((f) => ({ ...f, cloud_token: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    {t("Phone Number ID (Meta)")}
                    <input
                      type="text"
                      placeholder="1234567890"
                      value={waForm.cloud_phone_id}
                      onChange={(e) => setWaForm((f) => ({ ...f, cloud_phone_id: e.target.value }))}
                    />
                  </label>
                </div>
              </>
            )}
            {waMsg && (
              <p className="hint" style={{ color: waMsg.startsWith("âŒ") ? "#c0392b" : "#1e7d32" }}>
                {waMsg}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary btn-small" disabled={waBusy}>
                {waBusy ? "â€¦" : "ðŸ’¾ " + t("Enregistrer")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={waBusy || (!waForm.provider && !waForm.notify_email.trim())}
                onClick={testWhatsApp}
              >
                {waBusy ? "â€¦" : "ðŸ“¨ " + t("Envoyer un test")}
              </button>
            </div>
            {waForm.provider === "callmebot" && (
              <p className="hint" style={{ marginBottom: 0 }}>
                {t(
                  "CallMeBot : envoyez Â« I allow callmebot to send me messages Â» au +34 644 51 95 23 depuis votre WhatsApp pour recevoir votre clÃ©, puis collez-la ici."
                )}
              </p>
            )}
          </form>
        </div>
      </div>

      {/* Mode automatique : suivi des paiements en ligne (sections manuelles masquÃ©es) */}
      {!isManual && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            ðŸ“Š {t("Paiements en ligne (iKeePay)")}
          </h2>
          {payments === null ? (
            <div className="skeleton-block" style={{ height: 40 }}></div>
          ) : (
            <>
              <h3>{t("AdhÃ©sions")}</h3>
              {!(payments.memberships && payments.memberships.length) ? (
                <p className="hint">{t("Aucune adhÃ©sion payÃ©e en ligne pour le moment.")}</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("Utilisateur")}</th>
                        <th>{t("RÃ´le")}</th>
                        <th>{t("Parrain")}</th>
                        <th>{t("Montant")}</th>
                        <th>{t("RÃ©fÃ©rence")}</th>
                        <th>{t("Statut")}</th>
                        <th>{t("Date")}</th>
                        <th>{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.memberships.map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.user_name}
                            <div className="hint">{m.user_email}</div>
                          </td>
                          <td>
                            <span className="badge">{t(m.user_role || "")}</span>
                            {m.is_referred && (
                              <span className="badge badge-paid" style={{ marginLeft: 6 }}>
                                {t("Vendeur parrainÃ©")}
                              </span>
                            )}
                          </td>
                          <td>
                            {m.parrain_name ? (
                              <>
                                {m.parrain_name}
                                <div className="hint" style={{ fontSize: 12 }}>
                                  <code>{m.parrain_reference || "â€”"}</code>
                                </div>
                              </>
                            ) : (
                              "â€”"
                            )}
                          </td>
                          <td>
                            <strong>{formatMoney(m.amount)} F</strong>
                          </td>
                          <td>
                            <code>{m.external_reference}</code>
                          </td>
                          <td>
                            {m.status === "completed" ? (
                              <span className="badge badge-paid">{t("ComplÃ©tÃ©")}</span>
                            ) : m.status === "failed" ? (
                              <span className="badge badge-pending">{t("Ã‰chouÃ©")}</span>
                            ) : (
                              <span className="badge badge-warn">{t("En attente")}</span>
                            )}
                          </td>
                          <td className="hint">
                            {m.completed_at
                              ? new Date(m.completed_at).toLocaleString()
                              : new Date(m.created_at).toLocaleString()}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              onClick={() => deleteMembership(m)}
                            >
                              ðŸ—‘ {t("Supprimer")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h3 style={{ marginTop: 18 }}>{t("Dons")}</h3>
              {!(payments.donations && payments.donations.length) ? (
                <p className="hint">{t("Aucun don reÃ§u en ligne pour le moment.")}</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("Montant")}</th>
                        <th>{t("OpÃ©rateur")}</th>
                        <th>{t("RÃ©fÃ©rence")}</th>
                        <th>{t("Statut")}</th>
                        <th>{t("Date")}</th>
                        <th>{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.donations.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{formatMoney(d.amount)} F</strong>
                          </td>
                          <td>{d.operator || "â€”"}</td>
                          <td>
                            <code>{d.external_reference}</code>
                          </td>
                          <td>
                            {d.status === "completed" ? (
                              <span className="badge badge-paid">{t("ComplÃ©tÃ©")}</span>
                            ) : d.status === "failed" ? (
                              <span className="badge badge-pending">{t("Ã‰chouÃ©")}</span>
                            ) : (
                              <span className="badge badge-warn">{t("En attente")}</span>
                            )}
                          </td>
                          <td className="hint">
                            {d.completed_at
                              ? new Date(d.completed_at).toLocaleString()
                              : new Date(d.created_at).toLocaleString()}
                          </td>
                          <td>
                            {d.status !== "completed" && (
                              <button
                                type="button"
                                className="btn btn-small btn-outline"
                                onClick={() => completeDonation(d)}
                              >
                                âœ… {t("Marquer complÃ©tÃ©")}
                              </button>
                            )}{" "}
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              onClick={() => deleteDonation(d)}
                            >
                              ðŸ—‘ {t("Supprimer")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Utilisateurs : toujours visibles, quel que soit le mode (l'admin doit
          vÃ©rifier les comptes : ouvrir/fermer, vÃ©rifier, adhÃ©sion). */}
      <h2 className="section-title">ðŸ‘¥ {t("Utilisateurs")}</h2>
          <form onSubmit={searchUsers} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">
          ðŸ”
        </span>
        <input
          type="search"
          placeholder={t("Rechercher un utilisateur (nom, email ou rÃ©fÃ©rence)â€¦")}
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
              <th>{t("TÃ©lÃ©phone")}</th>
              <th>{t("RÃ´le")}</th>
              <th>{t("Pays")}</th>
              <th>{t("RÃ©fÃ©rence")}</th>
              <th>{t("Code vendeur")}</th>
              <th>{t("Code boutique")}</th>
              <th>{t("Inscription")}</th>
              <th>{t("AdhÃ©sion")}</th>
              <th>{t("VÃ©rifiÃ©")}</th>
              <th>{t("AccÃ¨s")}</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr>
                <td colSpan="12">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="12" className="empty">
                  {t("Aucun utilisateur")}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="hint">{u.email}</td>
                  <td>{u.phone || "â€”"}</td>
                  <td>
                    <span className="badge">{t(u.role)}</span>
                  </td>
                  <td>{u.country || "â€”"}</td>
                  <td>
                    <code>{u.reference_number || "â€”"}</code>
                  </td>
                  <td>
                    <code>{u.seller_code || "â€”"}</code>
                  </td>
                  <td>
                    <code>{u.shop_code || "â€”"}</code>
                  </td>
                  <td className="hint">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="hint">
                    {u.membership_fee ? (
                      <span
                        className={`membership-badge membership-badge--${getMembershipCountdownState(u.membership_expires_at).tone}${
                          getMembershipCountdownState(u.membership_expires_at).blinking
                            ? " membership-badge--blink"
                            : ""
                        }`}
                      >
                        {getMembershipCountdownState(u.membership_expires_at).label}
                      </span>
                    ) : (
                      t("Non requise")
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-small ${u.verified ? "btn-primary" : "btn-outline"}`}
                      onClick={() => toggleVerified(u)}
                    >
                      {u.verified ? `âœ“ ${t("VÃ©rifiÃ©")}` : t("VÃ©rifier")}
                    </button>
                  </td>
                  <td>
                    {"shop" === u.role || "seller" === u.role || "creator" === u.role ? (
                      <button
                        type="button"
                        className={`btn btn-small ${u.admin_approved ? "btn-primary" : "btn-outline"}`}
                        onClick={() => toggleAdminApproved(u)}
                      >
                        {u.admin_approved ? t("Fermer") : t("Ouvrir")}
                      </button>
                    ) : (
                      <span className="hint">â€”</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Parrainages : actions manuelles de l'admin (mode manuel). En automatique,
          les adhÃ©sions parrainÃ©es se confirment via le webhook iKeePay. */}
      {isManual && (
        <>
      <h2 className="section-title">ðŸ¤ {t("Parrainages (vendeurs / crÃ©ateurs)")}</h2>
      <form onSubmit={searchReferrals} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">
          ðŸ”
        </span>
        <input
          type="search"
          placeholder={t("Rechercher par numÃ©ro de rÃ©fÃ©rence (parrainÃ© ou parrain)â€¦")}
          value={refSearch}
          onChange={(e) => setRefSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          {t("Rechercher")}
        </button>
      </form>
      {refError && <p className="error">{refError}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("ParrainÃ©")}</th>
              <th>{t("RÃ´le")}</th>
              <th>{t("RÃ©fÃ©rence parrainÃ©")}</th>
              <th>{t("TÃ©lÃ©phone parrainÃ©")}</th>
              <th>{t("AdhÃ©sion")}</th>
              <th>{t("Son parrain")}</th>
              <th>{t("RÃ©fÃ©rence parrain")}</th>
              <th>{t("TÃ©lÃ©phone parrain")}</th>
            </tr>
          </thead>
          <tbody>
            {referrals === null ? (
              <tr>
                <td colSpan="8">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : referrals.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty">
                  {t("Aucun parrainage")}
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr key={r.parraine.id}>
                  <td>{r.parraine.name}</td>
                  <td>
                    <span className="badge">{t(r.parraine.role)}</span>
                  </td>
                  <td>
                    <code>{r.parraine.reference_number || "â€”"}</code>
                  </td>
                  <td>{r.parraine.phone || "â€”"}</td>
                  <td>
                    {r.parraine.membership_paid ? (
                      <span className="badge badge-paid">{t("AdhÃ©sion payÃ©e")}</span>
                    ) : (
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => markReferralPaid(r)}
                      >
                        âœ“ {t("PayÃ©")}
                      </button>
                    )}
                  </td>
                  <td>{r.parrain.name}</td>
                  <td>
                    <code>{r.parrain.reference_number || "â€”"}</code>
                  </td>
                  <td>{r.parrain.phone || "â€”"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Retraits d'activation : payÃ©s manuellement par l'admin dans les deux modes */}
      {withdrawals && withdrawals.length > 0 && (
        <>
          <h2 className="section-title">ðŸ’¸ {t("Demandes de retrait (commissions d'activation)")}</h2>
          {wdError && <p className="error">{wdError}</p>}
          <div className="table-wrap">
            <table className="table">
          <thead>
            <tr>
              <th>{t("Parrain")}</th>
              <th>{t("RÃ©fÃ©rence parrain")}</th>
              <th>{t("ParrainÃ©s (adhÃ©sion confirmÃ©e)")}</th>
              <th>{t("Montant")}</th>
              <th>{t("Moyen de paiement parrain")}</th>
              <th>{t("Email")}</th>
              <th>{t("Commentaire")}</th>
              <th>{t("Date")}</th>
              <th>{t("Statut")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {withdrawals === null ? (
              <tr>
                <td colSpan="10">
                  <div className="skeleton-block" style={{ height: 30 }}></div>
                </td>
              </tr>
            ) : withdrawals.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty">
                  {t("Aucune demande de retrait")}
                </td>
              </tr>
            ) : (
              withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.seller.name}</td>
                  <td>
                    <code>{w.seller.reference_number || "â€”"}</code>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {w.items.map((it) => (
                        <li key={it.member_id}>
                          {it.name} â€” <code>{it.reference_number || "â€”"}</code>{" "}
                          {it.membership_paid ? (
                            <span className="badge badge-paid">{t("PayÃ©e")}</span>
                          ) : (
                            <span className="badge badge-pending">{t("Non payÃ©e")}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <strong>{formatMoney(w.amount)} F</strong>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {w.seller.paymentMethods ? (
                      <>
                        {w.seller.paymentMethods.full_name && (
                          <div>
                            <strong>{w.seller.paymentMethods.full_name}</strong>
                          </div>
                        )}
                        {(w.seller.paymentMethods.wallets || []).length > 0 ? (
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                            {(w.seller.paymentMethods.wallets || []).map((wlt, i) => (
                              <li key={i}>
                                <div>
                                  <strong>{wlt.name || t("OpÃ©rateur")}</strong>
                                  {wlt.primary ? " â­" : ""}
                                </div>
                                <code>{wlt.value || "â€”"}</code>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="hint">{t("Aucun moyen de paiement configurÃ©")}</span>
                        )}
                      </>
                    ) : (
                      <span className="hint">{t("Aucun moyen de paiement configurÃ©")}</span>
                    )}
                  </td>
                  <td className="hint">{w.email || "â€”"}</td>
                  <td className="hint" style={{ maxWidth: 200 }}>
                    {w.comment || "â€”"}
                  </td>
                  <td className="hint">
                    {w.created_at ? new Date(w.created_at).toLocaleDateString() : "â€”"}
                  </td>
                  <td>
                    {w.status === "paid" ? (
                      <span className="badge badge-paid">{t("PayÃ©")}</span>
                    ) : (
                      <span className="badge badge-warn">{t("En attente")}</span>
                    )}
                  </td>
                  <td>
                    {w.status === "pending" && (
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => payWithdrawal(w)}
                      >
                        ðŸ’° {t("Payer")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
        </>
      )}

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
                    {p.shop_verified && <span className="badge badge-verified">âœ“</span>}
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

    </main>
  );
}
