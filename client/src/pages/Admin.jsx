import { storage, sessionStore } from "../storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import PwaInstallButton from "../components/PwaInstallButton.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { countrySymbol, COUNTRIES } from "../config.js";
import MiniChart from "../components/MiniChart.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import TrackMap from "../components/TrackMap.jsx";

const VISIT_RANGES = [
  { days: 1, label: "1 jour" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "1 mois" },
];

function getMembershipCountdownState(expiresAt) {
  if (!expiresAt) {
    return { label: "—", tone: "neutral", daysLeft: null, blinking: false };
  }
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  if (diffMs <= 0) {
    return { label: "Expiré", tone: "danger", daysLeft: 0, blinking: false };
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
    setGate(!storage.getItem("admin_token"));
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

  // --- Suivi GPS des livraisons en cours (liste + carte) ---
  const [deliveries, setDeliveries] = useState([]);
  const [trackSaleId, setTrackSaleId] = useState(null);
  const [trackData, setTrackData] = useState(null);

  const loadTracking = useCallback(() => {
    api
      .adminTracking()
      .then((d) => setDeliveries(d.deliveries || []))
      .catch(() => {});
  }, []);

  // Suppression d'une commande du suivi GPS = retrait de la LISTE ADMIN
  // uniquement : aucun impact utilisateur (la commande reste dans le système).
  const deleteTrackingSale = async (d) => {
    if (
      !window.confirm(
        t(
          "Retirer la commande #{id} ({product}) de votre liste de suivi ? Les utilisateurs ne sont pas affectés : la commande reste intacte dans le système."
        )
      )
    )
      return;
    try {
      await api.adminTrackingDelete(d.id);
      setDeliveries((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      // silencieux : la liste se rafraîchit au prochain cycle
    }
  };

  // Retrait de TOUTES les commandes de la liste (admin uniquement).
  const deleteAllTracking = async () => {
    if (!deliveries.length) return;
    if (
      !window.confirm(
        t(
          "Retirer TOUTES les {n} commandes de votre liste de suivi ? Les utilisateurs ne sont pas affectés : les commandes restent intactes dans le système."
        )
      )
    )
      return;
    try {
      await api.adminTrackingDeleteAll();
      setDeliveries([]);
    } catch (err) {
      // silencieux
    }
  };
  // --- fin suppression suivi GPS ---

  useEffect(() => {
    if (gate) return;
    loadTracking();
  }, [gate, loadTracking]);

  // Polling 12 s pendant qu'une carte est ouverte ; 60 s sinon.
  useEffect(() => {
    if (gate) return undefined;
    if (!trackSaleId) {
      const slow = setInterval(() => {
        if (document.hidden) return;
        loadTracking();
      }, 60000);
      return () => clearInterval(slow);
    }
    const iv = setInterval(() => {
      loadTracking();
      api
        .saleTrack(trackSaleId, "")
        .then(setTrackData)
        .catch(() => {});
    }, 12000);
    return () => clearInterval(iv);
  }, [gate, trackSaleId, loadTracking]);
  // --- fin suivi GPS ---

  // --- Campagne PUSH + EMAIL (gratuits) ---
  const [campAudience, setCampAudience] = useState("all");
  const [campTitle, setCampTitle] = useState("");
  const [campMessage, setCampMessage] = useState("");
  const [campUrl, setCampUrl] = useState("/");
  const [campPush, setCampPush] = useState(true);
  const [campEmail, setCampEmail] = useState(false);
  const [campRecipients, setCampRecipients] = useState(null);
  const [campSending, setCampSending] = useState(false);
  const [campResult, setCampResult] = useState(null);

  useEffect(() => {
    if (gate) return;
    setCampRecipients(null);
    api
      .adminCampaignRecipients(campAudience)
      .then(setCampRecipients)
      .catch(() => {});
  }, [gate, campAudience]);

  const sendCampaign = async () => {
    if (!campTitle.trim() || !campMessage.trim()) return;
    const channels = [campPush ? "push" : null, campEmail ? "email" : null].filter(Boolean);
    if (!channels.length) return;
    if (
      !window.confirm(
        t(
          "Envoyer « {title} » à {audience} via {channels} ? Cette action est irréversible.",
          {
            title: campTitle.trim(),
            audience: campAudience,
            channels: channels.join(" + "),
          }
        )
      )
    )
      return;
    setCampSending(true);
    setCampResult(null);
    try {
      const d = await api.adminCampaignSend({
        title: campTitle.trim(),
        message: campMessage.trim(),
        audience: campAudience,
        channels,
        url: campUrl.trim() || "/",
      });
      setCampResult(d);
      setCampTitle("");
      setCampMessage("");
    } catch (err) {
      setCampResult({ error: err.message });
    } finally {
      setCampSending(false);
    }
  };
  // --- fin campagne ---
  const [visitDays, setVisitDays] = useState(30);
  const [visitCountry, setVisitCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [referrals, setReferrals] = useState(null);
  const [refSearch, setRefSearch] = useState("");
  const [refError, setRefError] = useState("");
  const [withdrawals, setWithdrawals] = useState(null);
  const [wdError, setWdError] = useState("");
  // Système de paiement (manuel ↔ automatique)
  const [paySettings, setPaySettings] = useState(null);
  const [waSettings, setWaSettings] = useState(null);
  const [waForm, setWaForm] = useState({
    provider: "",
    admin_phone: "",
    callmebot_key: "",
    cloud_token: "",
    cloud_phone_id: "",
    cloud_template: "",
    notify_email: "",
  });
  const [waBusy, setWaBusy] = useState(false);
  const [waMsg, setWaMsg] = useState("");
  const [payPublicKey, setPayPublicKey] = useState("");
  const [paySecretKey, setPaySecretKey] = useState("");
  const [payments, setPayments] = useState(null);
  const [webhookHealth, setWebhookHealth] = useState(null);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateReport, setMigrateReport] = useState(null);
  const [prodSearch, setProdSearch] = useState("");
  // Refs synchrones des recherches en cours : le rechargement silencieux
  // (30 s / retour sur l'onglet) lit ces refs pour ne PAS écraser les
  // résultats d'une recherche active.
  const searchRef = useRef("");
  const prodSearchRef = useRef("");
  searchRef.current = search;
  prodSearchRef.current = prodSearch;
  const [paySearch, setPaySearch] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [payOk, setPayOk] = useState("");
  // Maintenance Storage (egress images) : correction du cache + migration inline
  const [storageBusy, setStorageBusy] = useState(false);
  const [storageReport, setStorageReport] = useState(null);
  const [storageMsg, setStorageMsg] = useState("");

  // ─── Compte administrateur personnel (notifications push + cloche) ────────
  // L'admin « virtuel » (mot de passe ADMIN_PASSWORD, id 0) ne peut pas
  // s'abonner au push : il lui faut un VRAI compte utilisateur. Ces formulaires
  // ne sont visibles qu'après le mot de passe admin (gate).
  const { user, login: loginUser } = useAuth();
  const [acctTab, setAcctTab] = useState("login");
  const [acctLogin, setAcctLogin] = useState({ email: "", password: "" });
  const [acctLoginErr, setAcctLoginErr] = useState("");
  const [acctLoginBusy, setAcctLoginBusy] = useState(false);
  const [acctReg, setAcctReg] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    country: "",
  });
  const [acctRegErr, setAcctRegErr] = useState("");
  const [acctRegBusy, setAcctRegBusy] = useState(false);

  const payMode = paySettings?.mode === "auto" ? "auto" : "manual";
  const isManual = payMode === "manual";

  const load = useCallback(
    (silent) => {
      if (!silent) setLoading(true);
      const onErr = (e) => {
        if (e && (e.status === 401 || e.status === 403)) {
          storage.removeItem("admin_token");
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
      // Ne pas écraser les résultats d'une recherche en cours lors des
      // rechargements silencieux (30 s / retour sur l'onglet).
      if (!searchRef.current.trim()) {
        api
          .adminUsers()
          .then((d) => setUsers(d.users))
          .catch(onErr);
      }
      if (!prodSearchRef.current.trim()) {
        api
          .adminProducts()
          .then((d) => setProducts(d.products))
          .catch(onErr);
      }
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
            cloud_template: d?.cloud_template || "",
          }));
        })
        .catch(() => {});
      api
        .adminPayments()
        .then((d) => setPayments(d))
        .catch(() => {});
      // Santé du webhook : un paiement resté « en attente » sans trace est
      // presque toujours un webhook rejeté (URL iKeePay obsolète, token
      // invalide) ou jamais reçu. Ce résumé rend le cas visible en un coup
      // d'œil dans la section « Paiements en ligne (iKeePay) ».
      api
        .adminWebhooks()
        .then((d) => {
          const rows = d?.webhooks || [];
          const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recent = rows.filter(
            (w) => w && new Date(w.created_at).getTime() > dayAgo
          );
          const last = recent[0] || null;
          setWebhookHealth({
            total: recent.length,
            rejected: recent.filter((w) => w.error === "invalid_webhook_token").length,
            lastEvent: last ? last.event : null,
            lastAt: last ? last.created_at : null,
          });
        })
        .catch(() => setWebhookHealth(null));
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

  // Temps réel : actualisation silencieuse des statistiques, transactions et
  // visites toutes les 30 s, quel que soit le mode de paiement.
  useEffect(() => {
    if (gate) return undefined;
    const id = setInterval(() => {
      // Egress : ne consomme rien quand l'onglet est en arrière-plan.
      if (document.hidden) return;
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
      storage.setItem("admin_token", d.token);
      setGate(false);
      setPassword("");
    } catch (err) {
      setGateError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ─── Compte administrateur : connexion / création ─────────────────────────
  const submitAcctLogin = async (e) => {
    e.preventDefault();
    setAcctLoginErr("");
    setAcctLoginBusy(true);
    try {
      const d = await api.login(acctLogin);
      loginUser(d.user, d.token);
      setAcctLogin({ email: "", password: "" });
    } catch (err) {
      setAcctLoginErr(err.message);
    } finally {
      setAcctLoginBusy(false);
    }
  };

  const submitAcctRegister = async (e) => {
    e.preventDefault();
    setAcctRegErr("");
    if (
      !acctReg.name.trim() ||
      !acctReg.email ||
      !acctReg.password ||
      !acctReg.confirm ||
      !acctReg.country
    ) {
      setAcctRegErr(t("Veuillez remplir tous les champs."));
      return;
    }
    if (acctReg.password !== acctReg.confirm) {
      setAcctRegErr(t("Les mots de passe ne correspondent pas."));
      return;
    }
    setAcctRegBusy(true);
    try {
      // Le compte créé est déjà vérifié (email_verified = TRUE) → connexion
      // immédiate avec le token renvoyé, sans email de confirmation.
      const d = await api.adminCreateAccount({
        name: acctReg.name,
        email: acctReg.email,
        password: acctReg.password,
        country: acctReg.country,
      });
      loginUser(d.user, d.token);
      setAcctReg({ name: "", email: "", password: "", confirm: "", country: "" });
    } catch (err) {
      setAcctRegErr(err.message);
    } finally {
      setAcctRegBusy(false);
    }
  };

  const logout = () => {
    storage.removeItem("admin_token");
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

  // Migration email (boutique<->livreur) — outil de maintenance admin.
  const runMigrateEmail = async () => {
    if (!window.confirm("Appliquer la migration email boutique<->livreur (supprime la contrainte UNIQUE(email) globale) ?")) return;
    setMigrateBusy(true);
    setMigrateReport(null);
    try {
      const r = await api.adminMigrateEmailShare();
      setMigrateReport(r);
    } catch (err) {
      setMigrateReport({ error: err.message });
    } finally {
      setMigrateBusy(false);
    }
  };

  // Section Produits : 5 derniers par défaut, recherche instantanée sur
  // toute la liste chargée (nom du produit ou boutique). Les résultats de
  // recherche sont plafonnés (20) pour ne jamais saturer le rendu.
  const prodQuery = prodSearch.trim().toLowerCase();
  const prodMatches = Array.isArray(products)
    ? prodQuery
      ? products.filter(
          (p) =>
            String(p.name || "").toLowerCase().includes(prodQuery) ||
            String(p.shop_name || "").toLowerCase().includes(prodQuery)
        )
      : products
    : [];

  // Filtre local des paiements en ligne (nom, email, référence, parrain…).
  const filterPayments = (list) => {
    if (!Array.isArray(list)) return [];
    const q = paySearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) =>
      [
        m.user_name,
        m.user_email,
        m.user_reference,
        m.user_role,
        m.external_reference,
        m.parrain_name,
        m.parrain_reference,
      ].some((v) => String(v || "").toLowerCase().includes(q))
    );
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
        t("Marquer l'adhésion de {name} comme payée et avertir son parrain ?", {
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
          ? t("Mode automatique activé : les adhésions et dons se paient en ligne (iKeePay).")
          : t("Mode manuel activé : les paiements se font sous contrôle de l'administrateur.")
      );
      load(true);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
  };

  const toggleMembershipGate = async () => {
    setPayError("");
    setPayOk("");
    setPayBusy(true);
    try {
      const next = (paySettings?.membership_gate === "all") ? "seller" : "all";
      await api.adminUpdatePaymentSettings({ membership_gate: next });
      setPaySettings((s) => ({ ...s, membership_gate: next }));
      setPayOk(
        next === "all"
          ? t("Blocage global activé : boutiques, vendeurs et créateurs doivent payer l'adhésion (30 jours).")
          : t("Boutiques et créateurs libérés : seul le vendeur paie l'adhésion.")
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
      setPayOk(t("Clés iKeePay enregistrées."));
      load(true);
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
  };

  // ─── WhatsApp : sauvegarde des réglages + test d'envoi ────────────────────
  // Le numéro masqué renvoyé par le serveur (••••) n'est jamais renvoyé tel
  // quel : on ne modifie le numéro que si l'admin en saisit un nouveau.
  const buildWhatsAppPayload = () => {
    const p = { provider: waForm.provider };
    const phone = waForm.admin_phone.trim();
    if (phone && !phone.includes("••••")) p.admin_phone = phone;
    if (waForm.callmebot_key.trim()) p.callmebot_key = waForm.callmebot_key.trim();
    if (waForm.cloud_token.trim()) p.cloud_token = waForm.cloud_token.trim();
    if (waForm.cloud_phone_id.trim()) p.cloud_phone_id = waForm.cloud_phone_id.trim();
    if (waForm.cloud_template.trim()) p.cloud_template = waForm.cloud_template.trim();
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
          ? t("Notifications WhatsApp configurées ✅")
          : t("Réglages enregistrés — WhatsApp inactif tant que le fournisseur est incomplet.")
      );
    } catch (err) {
      setWaMsg("❌ " + err.message);
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
          ? t("Test envoyé — vérifiez votre WhatsApp et/ou votre boîte email ✅")
          : t("Test échoué.")
      );
    } catch (err) {
      setWaMsg("❌ " + err.message);
    } finally {
      setWaBusy(false);
    }
  };

  // Secours : marquer un don « en attente » comme complété (si le webhook n'est
  // jamais arrivé). Réservé à l'admin, à n'utiliser qu'après vérification.
  const completeDonation = async (d) => {
    if (
      !window.confirm(
        t("Marquer le don de {amount} F comme complété ?", { amount: formatMoney(d.amount) })
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
      setPayOk(t("Don marqué comme complété."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  // Supprimer une ligne de paiement (don ou adhésion) — action admin.
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
      setPayOk(t("Don supprimé."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  const deleteMembership = async (m) => {
    if (
      !window.confirm(
        t("Supprimer le paiement d'adhésion de {name} ({ref}) ?", {
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
      setPayOk(t("Paiement d'adhésion supprimé."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  // Secours : compléter manuellement une adhésion « en attente » et activer le
  // compte (le webhook n'a pas rattaché la référence).
  const completeMembership = async (m) => {
    if (
      !window.confirm(
        t("Compléter l'adhésion de {name} ({amount} F) et activer son compte ?", {
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
      setPayOk(t("Adhésion complétée et compte activé."));
    } catch (err) {
      setPayError(err.message);
    }
  };

  const toggleAdminApproved = async (u) => {
    try {
      const d = await api.adminSetAdminApproved(u.id, !u.admin_approved);
      setUsers((us) =>
        us.map((x) => (x.id === u.id ? { ...x, admin_approved: Boolean(d.admin_approved) } : x))
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
    if (m.target === "creator") return t("Créateurs");
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

      {/* Compte administrateur : visible uniquement après le mot de passe admin */}
      <section className="card section" style={{ marginBottom: 18 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          👤 {t("Compte administrateur")}
        </h3>
        {user ? (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {t("Connecté en tant que")} <strong>{user.name}</strong> — {user.email} (
              {user.role})
            </p>
            <p className="hint" style={{ marginTop: 6 }}>
              {t(
                "Pour recevoir les notifications (push + cloche 🔔) comme n'importe quel utilisateur, activez-les depuis « Mon compte »."
              )}
            </p>
            <div className="dash-actions">
              <Link to="/compte" className="btn btn-outline btn-small">
                {t("Ouvrir Mon compte")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {t(
                "Le portail admin n'est pas un compte utilisateur : pour recevoir les notifications, connectez ou créez votre compte personnel ci-dessous. Ces formulaires ne sont visibles qu'après le mot de passe administrateur."
              )}
            </p>
            <div className="dash-actions" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`btn btn-small ${acctTab === "login" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setAcctTab("login")}
              >
                {t("Connexion")}
              </button>
              <button
                type="button"
                className={`btn btn-small ${acctTab === "register" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setAcctTab("register")}
              >
                {t("Créer mon compte")}
              </button>
            </div>
            {acctTab === "login" ? (
              <form onSubmit={submitAcctLogin} style={{ maxWidth: 420 }}>
                <label>{t("Email")}</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={acctLogin.email}
                  onChange={(e) => setAcctLogin({ ...acctLogin, email: e.target.value })}
                />
                <label>{t("Mot de passe")}</label>
                <PasswordInput
                  className="input"
                  required
                  value={acctLogin.password}
                  onChange={(e) => setAcctLogin({ ...acctLogin, password: e.target.value })}
                  autoComplete="current-password"
                />
                {acctLoginErr && (
                  <p className="error" role="alert">
                    {acctLoginErr}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={acctLoginBusy}
                >
                  {acctLoginBusy ? "⏳ …" : t("Se connecter")}
                </button>
              </form>
            ) : (
              <form onSubmit={submitAcctRegister} style={{ maxWidth: 420 }}>
                <label>{t("Nom")}</label>
                <input
                  className="input"
                  required
                  minLength={2}
                  maxLength={100}
                  value={acctReg.name}
                  onChange={(e) => setAcctReg({ ...acctReg, name: e.target.value })}
                />
                <label>{t("Email")}</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={acctReg.email}
                  onChange={(e) => setAcctReg({ ...acctReg, email: e.target.value })}
                />
                <label>{t("Mot de passe (8 caractères minimum)")}</label>
                <PasswordInput
                  className="input"
                  required
                  minLength={8}
                  value={acctReg.password}
                  onChange={(e) => setAcctReg({ ...acctReg, password: e.target.value })}
                  autoComplete="new-password"
                />
                <label>{t("Confirmer le mot de passe")}</label>
                <PasswordInput
                  className="input"
                  required
                  minLength={8}
                  value={acctReg.confirm}
                  onChange={(e) => setAcctReg({ ...acctReg, confirm: e.target.value })}
                  autoComplete="new-password"
                />
                <label>{t("Pays")}</label>
                <select
                  className="input"
                  required
                  value={acctReg.country}
                  onChange={(e) => setAcctReg({ ...acctReg, country: e.target.value })}
                >
                  <option value="">{t("Choisir un pays…")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
                {acctRegErr && (
                  <p className="error" role="alert">
                    {acctRegErr}
                  </p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={acctRegBusy}
                >
                  {acctRegBusy ? "⏳ …" : t("Créer mon compte")}
                </button>
                <p className="hint" style={{ marginTop: 8 }}>
                  {t(
                    "Le compte est créé avec le rôle « admin », email déjà vérifié : connexion immédiate, aucune confirmation par email."
                  )}
                </p>
              </form>
            )}
          </>
        )}
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

      {stats && (
        <section className="card section" style={{ marginBottom: 18 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            👥 {t("Répartition des utilisateurs")}
          </h3>
          <div className="role-bars">
            {[
              { k: "shops", label: t("Boutiques"), icon: "🏬", color: "#ee7d00" },
              { k: "sellers", label: t("Vendeurs"), icon: "🧑‍💼", color: "#2563eb" },
              { k: "clients", label: t("Clients"), icon: "👥", color: "#16a34a" },
              { k: "creators", label: t("Créateurs"), icon: "🎨", color: "#7c3aed" },
              { k: "livreurs", label: t("Livreurs"), icon: "🛵", color: "#0891b2" },
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
                    {v} · {pct}%
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

      <h2 className="section-title">🛰️ {t("Suivi GPS des livraisons")}</h2>
      <section className="card">
        <div className="row2" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="hint" style={{ margin: 0 }}>
            {deliveries.length
              ? `${deliveries.length} ${t("commande(s) dans le suivi")}`
              : ""}
          </span>
          {deliveries.length > 0 && (
            <button className="btn btn-small btn-danger" onClick={deleteAllTracking}>
              🗑️ {t("Supprimer tout")}
            </button>
          )}
        </div>
        {deliveries.length === 0 ? (
          <p className="empty">{t("Aucune livraison en cours pour le moment.")}</p>
        ) : (
          <div className="livreur-list">
            {deliveries.map((d) => (
              <div className="livreur-item" key={d.id}>
                <div className="livreur-item-info">
                  <div className="livreur-item-top">
                    <strong>
                      #{d.id} — {d.product_name}
                    </strong>
                    <span className={`badge badge-pending`}>{t("En cours")}</span>
                  </div>
                  <p className="hint">
                    🏪 {d.shop_name} · 🧑 {d.buyer_name || "—"}
                    {d.buyer_city ? ` · ${d.buyer_city}` : ""}
                  </p>
                  <p className="hint">
                    {d.livreur
                      ? `🛵 ${t("Position livreur :")} ${d.livreur.lat.toFixed(4)}, ${d.livreur.lng.toFixed(4)}`
                      : `🛵 ${t("Position livreur non partagée")}`}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className="btn btn-small btn-outline"
                    onClick={() => {
                      setTrackSaleId(d.id);
                      setTrackData(null);
                      api.saleTrack(d.id, "").then(setTrackData).catch(() => {});
                    }}
                  >
                    🗺️ {t("Carte")}
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => deleteTrackingSale(d)}
                    title={t("Retirer de votre liste (sans impact sur les utilisateurs)")}
                  >
                    🗑️ {t("Supprimer")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modale carte de suivi GPS (toutes positions de la commande) */}
      {trackSaleId && (
        <div className="modal-overlay" onClick={() => setTrackSaleId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🛰️ {t("Suivi GPS — commande #{id}", { id: trackSaleId })}</h3>
              <button className="drawer-close" onClick={() => setTrackSaleId(null)}>
                ✕
              </button>
            </div>
            <TrackMap
              livreur={trackData?.livreur || null}
              buyer={trackData?.buyer || null}
              shop={trackData?.shop || null}
              height={320}
            />
            {trackData && !trackData.tracking_active && (
              <p className="hint" style={{ marginTop: 8 }}>
                {t("Livraison terminée — les positions restent visibles (figées).")}
              </p>
            )}
          </div>
        </div>
      )}

      <h2 className="section-title">📣 {t("Campagne (Push + Email gratuits)")}</h2>
      <section className="card msg-form">
        <p className="hint">
          {t(
            "Diffusez un message à vos contacts via les deux canaux gratuits : notifications push (appareils abonnés) et email (adresses vérifiées). Aucun SMS payant."
          )}
        </p>
        <div className="msg-target-row">
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "all"}
              onChange={() => setCampAudience("all")}
            />
            {t("Tous")}
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "clients"}
              onChange={() => setCampAudience("clients")}
            />
            {t("Clients")}
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "sellers"}
              onChange={() => setCampAudience("sellers")}
            />
            {t("Vendeurs")}
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "shops"}
              onChange={() => setCampAudience("shops")}
            />
            {t("Boutiques")}
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "livreurs"}
              onChange={() => setCampAudience("livreurs")}
            />
            {t("Livreurs")}
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="camp-audience"
              checked={campAudience === "newsletter"}
              onChange={() => setCampAudience("newsletter")}
            />
            {t("Abonnés newsletter")}
          </label>
        </div>
        <input
          className="input"
          placeholder={t("Titre de la campagne")}
          value={campTitle}
          maxLength={120}
          onChange={(e) => setCampTitle(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <textarea
          className="msg-textarea"
          rows="4"
          maxLength={2000}
          placeholder={t("Votre message…")}
          value={campMessage}
          onChange={(e) => setCampMessage(e.target.value)}
        />
        <input
          className="input"
          placeholder={t("Lien (optionnel, ex : /produit/12)")}
          value={campUrl}
          onChange={(e) => setCampUrl(e.target.value)}
          style={{ margin: "8px 0" }}
        />
        <div className="msg-target-row">
          <label className="msg-radio">
            <input
              type="checkbox"
              checked={campPush}
              onChange={(e) => setCampPush(e.target.checked)}
            />
            🔔 {t("Push")}
            {campRecipients ? ` (${campRecipients.push_count})` : ""}
          </label>
          <label className="msg-radio">
            <input
              type="checkbox"
              checked={campEmail}
              onChange={(e) => setCampEmail(e.target.checked)}
            />
            📧 {t("Email")}
            {campRecipients ? ` (${campRecipients.email_count})` : ""}
          </label>
        </div>
        {campRecipients && !campRecipients.mail_configured && (
          <p className="hint">
            ⚠️ {t("SMTP non configuré : les emails seront simulés (non envoyés).")}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={campSending || !campTitle.trim() || !campMessage.trim() || (!campPush && !campEmail)}
          onClick={sendCampaign}
          style={{ marginTop: 10 }}
        >
          {campSending ? "…" : `📣 ${t("Envoyer la campagne")}`}
        </button>
        {campResult && (
          <p className={campResult.error ? "error" : "success"} style={{ marginTop: 8 }}>
            {campResult.error
              ? campResult.error
              : `✅ ${t(
                  "Campagne envoyée : {push} push, {email}/{total} emails.",
                  {
                    push: campResult.push_sent,
                    email: campResult.email_sent,
                    total: campResult.email_total != null ? campResult.email_total : campResult.email_sent,
                  }
                )}${campResult.email_simulated ? ` (${t("SMTP simulé")})` : ""}${
                  campResult.email_failed ? ` — ${campResult.email_failed} ${t("échecs")}` : ""
                }`}
          </p>
        )}
      </section>

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
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === "creator"}
              onChange={() => setMsgTarget("creator")}
            />
            <span>{t("Aux créateurs")}</span>
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

      {/* ===== Système de paiement : bascule manuel ↔ automatique (toujours visible) ===== */}
      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          ⚙️ {t("Système de paiement")}
        </h2>
        <div className="payment-mode-toggle">
          <span className={`payment-mode-badge ${payMode}`}>
            {payMode === "auto" ? "🟢 " + t("Automatique (iKeePay)") : "🔵 " + t("Manuel")}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={payBusy}
            onClick={togglePaymentMode}
          >
            {payBusy
              ? "…"
              : payMode === "auto"
                ? "🔁 " + t("Basculer vers le manuel")
                : "🔁 " + t("Basculer vers l'automatique")}
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 14 }}>
          {payMode === "auto"
            ? t(
                "Mode automatique : les adhésions et les dons se paient en ligne via iKeePay. Les retraits des commissions d'activation restent manuels (validés ici)."
              )
            : t(
                "Mode manuel : l'administration valide chaque adhésion et chaque paiement (adhésions, dons, parrainages)."
              )}
        </p>

        {/* ─── Bascule « adhésion obligatoire » (vendeurs seuls ↔ tout le monde) ─── */}
        <div
          style={{
            borderTop: "1px solid var(--border, rgba(128,128,128,0.25))",
            paddingTop: 14,
            marginBottom: 14,
          }}
        >
          <div className="payment-mode-toggle">
            <span className={`payment-mode-badge ${paySettings?.membership_gate === "all" ? "auto" : "manual"}`}>
              {paySettings?.membership_gate === "all"
                ? "🔒 " + t("Tous (boutique, vendeur, créateur)")
                : "🟢 " + t("Vendeurs seulement")}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-small"
              disabled={payBusy}
              onClick={toggleMembershipGate}
            >
              {payBusy
                ? "…"
                : paySettings?.membership_gate === "all"
                  ? "🔓 " + t("Libérer boutiques et créateurs")
                  : "🔒 " + t("Bloquer aussi les boutiques et créateurs")}
            </button>
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            {paySettings?.membership_gate === "all"
              ? t(
                  "Blocage global : boutiques, vendeurs et créateurs doivent payer l'adhésion (30 jours) pour accéder à leur espace. Les clients et livreurs ne sont pas concernés."
                )
              : t(
                  "Seuls les vendeurs paient l'adhésion. Les boutiques et créateurs accèdent gratuitement à leur espace — activez le blocage global le moment venu."
                )}
          </p>
        </div>

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
              {t("Clé publique iKeePay")}
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
              {t("Clé secrète iKeePay")}
            </label>
            <input
              type="password"
              className="input"
              value={paySecretKey}
              onChange={(e) => setPaySecretKey(e.target.value)}
              placeholder={paySettings?.ikeepay?.secret_key_set ? "••••••••" : "sk_..."}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-small" disabled={payBusy}>
            {payBusy ? "…" : t("Enregistrer")}
          </button>
        </form>
        {paySettings?.ikeepay_configured ? (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            ✅ {t("iKeePay configuré.")}
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            ⚠️ {t("iKeePay non configuré : le mode automatique restera indisponible.")}
          </p>
        )}
        {paySettings?.webhook_url ? (
          <div style={{ marginTop: 10 }}>
            <p className="hint" style={{ marginBottom: 6 }}>
              🔐 {t("Webhook à enregistrer chez iKeePay (URL protégée par un token secret) :")}
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
                    setPayOk(t("URL du webhook copiée."));
                  } catch {
                    /* clipboard indisponible */
                  }
                }}
              >
                📋 {t("Copier")}
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
              ⚠️ {t("Sans ce token dans l'URL, iKeePay ne peut plus confirmer les paiements.")}
            </p>
          </div>
        ) : null}

        {/* Notifications WhatsApp automatiques (demandes de retrait d'activation) */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eee" }}>
          <h3 style={{ marginTop: 0 }}>📱 {t("Notifications WhatsApp (retraits d'activation)")}</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            {t(
              "Recevez automatiquement (WhatsApp et/ou email) chaque demande de retrait envoyée par un vendeur parrain."
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
                  <option value="">{t("— Désactivé —")}</option>
                  <option value="callmebot">CallMeBot (gratuit, simple)</option>
                  <option value="cloud">WhatsApp Cloud API (Meta)</option>
                </select>
              </label>
              <label>
                {t("Votre numéro WhatsApp (format international)")}
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
                  {t("Clé API CallMeBot")}
                  <input
                    type="text"
                    placeholder={waSettings?.provider === "callmebot" ? "••••••••" : "clé reçue par WhatsApp"}
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
                    {t("Token d'accès permanent (Meta)")}
                    <input
                      type="password"
                      placeholder={waSettings?.provider === "cloud" ? "••••••••" : "EAAG..."}
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
                <div className="form-row">
                  <label>
                    {t("Nom du template Meta (optionnel)")}
                    <input
                      type="text"
                      placeholder="mboppi_alerte_retrait"
                      value={waForm.cloud_template}
                      onChange={(e) =>
                        setWaForm((f) => ({ ...f, cloud_template: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <p className="hint" style={{ marginTop: 0, marginBottom: 4 }}>
                  {t(
                    "Template conseillé : catégorie « Utilitaire », langue fr, avec 9 variables (type « Nom »/texte) : {{1}} parrain (nom + réf), {{2}} montant, {{3}} nb parrainés, {{4}} email, {{5}} commentaire, {{6}} titulaire, {{7}} wallet 1, {{8}} wallet 2, {{9}} wallet 3. Ex. de corps : « 🔔 Mboppi — Demande de retrait / 👤 Parrain : {{1}} / 💰 Montant : {{2}} / 👥 Parrainés payés : {{3}} / 📧 Email : {{4}} / 💬 Commentaire : {{5}} / Moyens de paiement : Titulaire {{6}} / 1. {{7}} / 2. {{8}} / 3. {{9}} »."
                  )}
                </p>
              </>
            )}
            {waMsg && (
              <p className="hint" style={{ color: waMsg.startsWith("❌") ? "#c0392b" : "#1e7d32" }}>
                {waMsg}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-primary btn-small" disabled={waBusy}>
                {waBusy ? "…" : "💾 " + t("Enregistrer")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={waBusy || (!waForm.provider && !waForm.notify_email.trim())}
                onClick={testWhatsApp}
              >
                {waBusy ? "…" : "📨 " + t("Envoyer un test")}
              </button>
            </div>
            {waForm.provider === "callmebot" && (
              <p className="hint" style={{ marginBottom: 0 }}>
                {t(
                  "CallMeBot : envoyez « I allow callmebot to send me messages » au +34 644 51 95 23 depuis votre WhatsApp pour recevoir votre clé, puis collez-la ici."
                )}
              </p>
            )}
          </form>
        </div>
      </div>
{/* ─── Maintenance Storage (egress images) ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          🖼️ {t("Maintenance des images (egress)")}
        </h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          {t(
            "Les photos sont servies via le proxy /api/photo avec un cache « eternal » : chaque image n'est chargée depuis Supabase qu'une seule fois, puis est servie par le CDN. « Vérifier la santé » teste le chemin réel depuis ce navigateur — la migration des vieilles photos en texte est déjà faite."
          )}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={storageBusy}
            onClick={async () => {
              setStorageBusy(true);
              setStorageMsg("");
              setStorageReport(null);
              try {
                // Santé du proxy : test réel depuis ce navigateur (proxy + CDN + cache).
                const d = await api.listProducts({ limit: 8 });
                const photos = (d?.products || [])
                  .map((p) => (p.photos || [])[0])
                  .filter((u) => typeof u === "string" && u.includes("/api/photo"));
                const sample = [...new Set(photos)].slice(0, 6);
                if (!sample.length) {
                  setStorageMsg(t("Aucune image proxée trouvée — vérifiez que le proxy est actif."));
                  return;
                }
                const lines = [];
                let bad = 0;
                for (const u of sample) {
                  const t0 = Date.now();
                  let r;
                  try {
                    r = await fetch(u, { method: "HEAD" });
                  } catch (err) {
                    bad += 1;
                    lines.push({ url: u.slice(-50), erreur: err.message });
                    continue;
                  }
                  const cc = r.headers.get("cache-control") || "";
                  const xc = r.headers.get("x-vercel-cache") || "";
                  const good = r.status === 200 && cc.includes("max-age=31536000");
                  if (!good) bad += 1;
                  lines.push({
                    p: (u.split("?p=")[1] || "").slice(0, 45) || u.slice(-45),
                    status: r.status,
                    cache: cc || "(aucun)",
                    cdn: xc || "—",
                    ms: Date.now() - t0,
                  });
                }
                                setStorageReport({
                  ok: bad === 0,
                  sample: lines,
                  note: bad === 0
                    ? t("Cache éternal confirmé : chaque image n'est chargée depuis Supabase qu'une seule fois.")
                    : t("Problème détecté — voir le détail ci-dessous."),
                });
                // Preuve du cache CDN : deux GET sur la première image
                // (le 1ᵉʳ peuple le cache edge, le 2ᵉ doit être un HIT).
                try {
                  const u0 = sample[0];
                  // cache: "reload" force le réseau (sinon le 2ᵉ GET est servi
                  // par le cache HTTP du navigateur et recopie le MISS du 1ᵉʳ).
                  const g1 = await fetch(u0, { cache: "reload" });
                  await g1.arrayBuffer();
                  const g2 = await fetch(u0, { cache: "reload" });
                  await g2.arrayBuffer();
                  const c1 = g1.headers.get("x-vercel-cache") || "—";
                  const c2 = g2.headers.get("x-vercel-cache") || "—";
                  setStorageReport((prev) => ({
                    ...prev,
                    sample: [
                      ...(prev?.sample || []),
                      { preuve_cdn: "GET #1", x_vercel_cache: c1 },
                      { preuve_cdn: "GET #2", x_vercel_cache: c2, attendu: "HIT" },
                    ],
                  }));
                } catch {
                  /* preuve CDN best-effort */
                }
              } catch (err) {
                setStorageMsg(err.message);
              } finally {
                setStorageBusy(false);
              }
            }}
          >
            {storageBusy ? "…" : "🩺 " + t("Vérifier la santé des images")}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={storageBusy}
            onClick={async () => {
              setStorageBusy(true);
              setStorageMsg("");
              try {
                const r = await api.adminMigrateInlinePhotos();
                setStorageReport(r);
              } catch (err) {
                setStorageMsg(err.message);
              } finally {
                setStorageBusy(false);
              }
            }}
          >
            {storageBusy ? "…" : "♻️ " + t("Migrer les photos en texte")}
          </button>
        </div>
        {storageMsg && <p className="error">{storageMsg}</p>}
        {storageReport && (
          <>
            {storageReport.note && (
              <p className={storageReport.ok ? "success" : "error"} style={{ marginTop: 8 }}>
                {storageReport.ok ? "✅ " : "⚠️ "}
                {storageReport.note}
              </p>
            )}
            <pre
              className="hint"
              style={{
                marginTop: 8,
                whiteSpace: "pre-wrap",
                fontSize: 12,
                background: "rgba(128,128,128,0.08)",
                padding: 8,
                borderRadius: 6,
              }}
            >
              {JSON.stringify(storageReport.sample ?? storageReport, null, 2)}
            </pre>
          </>
        )}
      </div>

      {/* Mode automatique : suivi des paiements en ligne (sections manuelles masquées) */}
      {!isManual && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            📊 {t("Paiements en ligne (iKeePay)")}
          </h2>
          <form onSubmit={(e) => e.preventDefault()} className="hero-search" role="search">
            <span className="emoji" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              placeholder={t("Rechercher un paiement (nom, email ou référence)…")}
              value={paySearch}
              onChange={(e) => setPaySearch(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              🔍
            </button>
          </form>

          {/* Santé du webhook iKeePay : un paiement resté « en attente » sans
              trace est presque toujours un webhook rejeté (URL obsolète,
              token invalide) ou jamais reçu. Résumé mis à jour à chaque
              chargement de la section. */}
          {webhookHealth && (
            webhookHealth.rejected > 0 ? (
              <div
                style={{
                  backgroundColor: "rgba(220, 53, 69, 0.08)",
                  border: "1px solid #dc3545",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <strong>
                  ⚠️{" "}
                  {t("Webhooks iKeePay rejetés (token invalide) : {n} sur 24 h", {
                    n: webhookHealth.rejected,
                  })}
                </strong>
                <p className="hint" style={{ marginBottom: 0 }}>
                  {t(
                    "iKeePay envoie bien les confirmations, mais l'URL enregistrée dans son dashboard est obsolète. Ouvrez la carte « Système de paiement » ci-dessus, recopiez l'URL de webhook (bouton Copier) et mettez-la à jour chez iKeePay : les paiements en attente seront alors confirmés automatiquement."
                  )}
                </p>
              </div>
            ) : (
              <p className="hint" style={{ marginBottom: 10 }}>
                ✅{" "}
                {t("Webhooks iKeePay reçus (24 h) : {total} — aucun rejet de token.", {
                  total: webhookHealth.total,
                })}
                {webhookHealth.lastEvent
                  ? " " +
                    t("Dernier : {event}", {
                      event: `${webhookHealth.lastEvent} (${new Date(
                        webhookHealth.lastAt
                      ).toLocaleString()})`,
                    })
                  : ""}
              </p>
            )
          )}

          {payments === null ? (
            <div className="skeleton-block" style={{ height: 40 }}></div>
          ) : (
            <>
              <h3>{t("Adhésions")}</h3>
              {!(filterPayments(payments.memberships).length) ? (
                <p className="hint">
                  {payments.memberships && payments.memberships.length
                    ? t("Aucun paiement ne correspond à cette recherche.")
                    : t("Aucune adhésion payée en ligne pour le moment.")}
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("Utilisateur")}</th>
                        <th>{t("Rôle")}</th>
                        <th>{t("Parrain")}</th>
                        <th>{t("Montant")}</th>
                        <th>{t("Référence")}</th>
                        <th>{t("Statut")}</th>
                        <th>{t("Date")}</th>
                        <th>{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterPayments(payments.memberships).map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.user_name}
                            <div className="hint">{m.user_email}</div>
                            {m.user_reference && (
                              <div className="hint">
                                <code>{m.user_reference}</code>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge">{t(m.user_role || "")}</span>
                            {m.is_referred && (
                              <span className="badge badge-paid" style={{ marginLeft: 6 }}>
                                {t("Vendeur parrainé")}
                              </span>
                            )}
                          </td>
                          <td>
                            {m.parrain_name ? (
                              <>
                                {m.parrain_name}
                                <div className="hint" style={{ fontSize: 12 }}>
                                  <code>{m.parrain_reference || "—"}</code>
                                </div>
                              </>
                            ) : (
                              "—"
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
                              <span className="badge badge-paid">{t("Complété")}</span>
                            ) : m.status === "failed" ? (
                              <span className="badge badge-pending">{t("Échoué")}</span>
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
                              🗑 {t("Supprimer")}
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
                <p className="hint">{t("Aucun don reçu en ligne pour le moment.")}</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("Montant")}</th>
                        <th>{t("Opérateur")}</th>
                        <th>{t("Référence")}</th>
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
                          <td>{d.operator || "—"}</td>
                          <td>
                            <code>{d.external_reference}</code>
                          </td>
                          <td>
                            {d.status === "completed" ? (
                              <span className="badge badge-paid">{t("Complété")}</span>
                            ) : d.status === "failed" ? (
                              <span className="badge badge-pending">{t("Échoué")}</span>
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
                                ✅ {t("Marquer complété")}
                              </button>
                            )}{" "}
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              onClick={() => deleteDonation(d)}
                            >
                              🗑 {t("Supprimer")}
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
          vérifier les comptes : ouvrir/fermer, vérifier, adhésion). */}
      <h2 className="section-title">👥 {t("Utilisateurs")}</h2>
          <form onSubmit={searchUsers} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          placeholder={t("Rechercher un utilisateur (nom, email ou référence)…")}
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            // Champ vidé : on recharge la liste par défaut (5 derniers)
            // sans attendre le prochain cycle de rafraîchissement.
            if (!v.trim() && searchRef.current.trim()) {
              api.adminUsers().then((d) => setUsers(d.users)).catch(() => {});
            }
          }}
        />
        <button type="submit" className="btn btn-primary">
          {t("Rechercher")}
        </button>
      </form>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        {search.trim()
          ? t("{n} utilisateur(s) trouvé(s)", {
              n: Array.isArray(users) ? users.length : 0,
            })
          : t("{n} derniers utilisateurs affichés sur {total}", {
              n: Array.isArray(users) ? Math.min(users.length, 5) : 0,
              total: Array.isArray(users) ? users.length : 0,
            })}
        {search.trim() && Array.isArray(users) && users.length > 20
          ? " — " + t("affinez la recherche")
          : ""}
      </p>
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
              <th>{t("Code vendeur")}</th>
              <th>{t("Code boutique")}</th>
              <th>{t("Inscription")}</th>
              <th>{t("Adhésion")}</th>
              <th>{t("Vérifié")}</th>
              <th>{t("Accès")}</th>
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
                  {search.trim()
                    ? t("Aucun utilisateur ne correspond à cette recherche.")
                    : t("Aucun utilisateur")}
                </td>
              </tr>
            ) : (
              users.slice(0, search.trim() ? 20 : 5).map((u) => (
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
                  <td>
                    <code>{u.seller_code || "—"}</code>
                  </td>
                  <td>
                    <code>{u.shop_code || "—"}</code>
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
                      {u.verified ? `✓ ${t("Vérifié")}` : t("Vérifier")}
                    </button>
                  </td>
                  <td>
                    {"seller" === u.role || (("shop" === u.role || "creator" === u.role) && paySettings?.membership_gate === "all") ? (
                      <span className="access-cell">
                        <span
                          className={`access-state ${u.admin_approved ? "access-state--open" : "access-state--closed"}`}
                        >
                          {u.admin_approved ? t("Ouvert") : t("Ferm\u00e9")}
                        </span>
                        <button
                          type="button"
                          className={`btn btn-small ${u.admin_approved ? "btn-outline" : "btn-primary"}`}
                          onClick={() => toggleAdminApproved(u)}
                        >
                          {u.admin_approved ? t("Fermer") : t("Ouvrir")}
                        </button>
                      </span>
                    ) : (("shop" === u.role || "creator" === u.role ? (
            <span className="access-state access-state--open">{t("Accès gratuit")}</span>
          ) : (
            <span className="hint">—</span>
          )))}
          </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Parrainages : actions manuelles de l'admin (mode manuel). En automatique,
          les adhésions parrainées se confirment via le webhook iKeePay. */}
      {isManual && (
        <>
      <h2 className="section-title">🤝 {t("Parrainages (vendeurs / créateurs)")}</h2>
      <form onSubmit={searchReferrals} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          placeholder={t("Rechercher par numéro de référence (parrainé ou parrain)…")}
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
              <th>{t("Parrainé")}</th>
              <th>{t("Rôle")}</th>
              <th>{t("Référence parrainé")}</th>
              <th>{t("Téléphone parrainé")}</th>
              <th>{t("Adhésion")}</th>
              <th>{t("Son parrain")}</th>
              <th>{t("Référence parrain")}</th>
              <th>{t("Téléphone parrain")}</th>
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
                    <code>{r.parraine.reference_number || "—"}</code>
                  </td>
                  <td>{r.parraine.phone || "—"}</td>
                  <td>
                    {r.parraine.membership_paid ? (
                      <span className="badge badge-paid">{t("Adhésion payée")}</span>
                    ) : (
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => markReferralPaid(r)}
                      >
                        ✓ {t("Payé")}
                      </button>
                    )}
                  </td>
                  <td>{r.parrain.name}</td>
                  <td>
                    <code>{r.parrain.reference_number || "—"}</code>
                  </td>
                  <td>{r.parrain.phone || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Retraits d'activation : payés manuellement par l'admin dans les deux modes */}
      {withdrawals && withdrawals.length > 0 && (
        <>
          <h2 className="section-title">💸 {t("Demandes de retrait (commissions d'activation)")}</h2>
          {wdError && <p className="error">{wdError}</p>}
          <div className="table-wrap">
            <table className="table">
          <thead>
            <tr>
              <th>{t("Parrain")}</th>
              <th>{t("Référence parrain")}</th>
              <th>{t("Parrainés (adhésion confirmée)")}</th>
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
                    <code>{w.seller.reference_number || "—"}</code>
                  </td>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {w.items.map((it) => (
                        <li key={it.member_id}>
                          {it.name} — <code>{it.reference_number || "—"}</code>{" "}
                          {it.membership_paid ? (
                            <span className="badge badge-paid">{t("Payée")}</span>
                          ) : (
                            <span className="badge badge-pending">{t("Non payée")}</span>
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
                                  <strong>{wlt.name || t("Opérateur")}</strong>
                                  {wlt.primary ? " ⭐" : ""}
                                </div>
                                <code>{wlt.value || "—"}</code>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="hint">{t("Aucun moyen de paiement configuré")}</span>
                        )}
                      </>
                    ) : (
                      <span className="hint">{t("Aucun moyen de paiement configuré")}</span>
                    )}
                  </td>
                  <td className="hint">{w.email || "—"}</td>
                  <td className="hint" style={{ maxWidth: 200 }}>
                    {w.comment || "—"}
                  </td>
                  <td className="hint">
                    {w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    {w.status === "paid" ? (
                      <span className="badge badge-paid">{t("Payé")}</span>
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
                        💰 {t("Payer")}
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <h2 className="section-title" style={{ margin: 0 }}>
          <Logo className="logo-inline" /> {t("Produits")}
        </h2>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="hero-search"
          role="search"
          style={{ flex: 1, minWidth: 240 }}
        >
          <span className="emoji" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            placeholder={t("Rechercher un produit (nom ou boutique)…")}
            value={prodSearch}
            onChange={(e) => setProdSearch(e.target.value)}
          />
        </form>
      </div>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        {prodQuery
          ? t("{n} produit(s) trouvé(s)", { n: prodMatches.length })
          : t("{n} derniers produits affichés sur {total}", {
              n: Math.min(prodMatches.length, 5),
              total: prodMatches.length,
            })}
        {prodQuery && prodMatches.length > 20 ? " — " + t("affinez la recherche") : ""}
      </p>
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
            ) : prodMatches.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty">
                  {prodQuery
                    ? t("Aucun produit ne correspond à cette recherche.")
                    : t("Aucun produit")}
                </td>
              </tr>
            ) : (
              prodMatches.slice(0, prodQuery ? 20 : 5).map((p) => (
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

    </main>
  );
}
