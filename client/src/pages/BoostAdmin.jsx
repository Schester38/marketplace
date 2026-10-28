import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

const STATUS_LABELS = {
  draft: "Brouillon",
  pending_payment: "Paiement en attente",
  paid: "Payé",
  submitted: "Transmise au prestataire",
  processing: "En cours",
  completed: "Terminée",
  failed: "Échouée",
  cancelled: "Annulée",
  refund_pending: "Remboursement en attente",
  refunded: "Remboursée",
};

const WORKFLOW_STATUSES = [
  "paid",
  "submitted",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "refund_pending",
  "refunded",
];

function money(value, currency = "XAF") {
  const n = Number(value);
  return `${Number.isFinite(n) ? n.toLocaleString("fr-FR") : value} ${currency || ""}`.trim();
}

const usd = (value) =>
  `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

const WALLET_TX_LABELS = {
  topup: "Recharge",
  order_payment: "Commande Boost",
  admin_credit: "Crédit administrateur",
  refund: "Remboursement",
  adjustment: "Ajustement",
};

export default function BoostAdmin() {
  const { t } = useLang();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsDays, setStatsDays] = useState(30);
  const [busyId, setBusyId] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [syncing, setSyncing] = useState(false);

  const [provider, setProvider] = useState(null);
  const [providerForm, setProviderForm] = useState({
    enabled: false,
    key: "smm_africa",
    baseUrl: "https://smm.africa/api/v3",
    timeoutMs: 30000,
    apiKey: "",
    marginPercent: 50,
    usdToXaf: 655.957,
  });
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [balance, setBalance] = useState(null);
  const [balanceBusy, setBalanceBusy] = useState(false);

  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceNotice, setServiceNotice] = useState("");
  const [editingService, setEditingService] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    category_id: "",
    name: "",
    description: "",
    short_description: "",
    price: "",
    currency: "XAF",
    billing_unit: "service",
    status: "active",
    is_automated: false,
    is_consulting: false,
    is_campaign: false,
    external_service_id: "",
    delivery_days: "",
    conditions: "",
    sort_order: 0,
  });
  const [savingService, setSavingService] = useState(false);
  const [categories, setCategories] = useState([]);
  const [importForm, setImportForm] = useState({
    markup: 1.5,
    usd_to_xaf: 655.957,
    category_id: "",
    types: "default",
    limit: 0,
    dry_run: false,
  });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [paymentInfo, setPaymentInfo] = useState(null);
  const [paymentForm, setPaymentForm] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");

  const [walletSearch, setWalletSearch] = useState("");
  const [walletUsers, setWalletUsers] = useState([]);
  const [walletUser, setWalletUser] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const [walletForm, setWalletForm] = useState({
    amount_usd: "",
    note: "",
    transaction_type: "admin_credit",
  });

  useEffect(() => {
    loadOrders();
    loadProvider();
    loadStats();
    loadPaymentInfo();
  }, []);

  async function loadOrders(override = {}) {
    const params = {
      limit: 50,
      status: override.status !== undefined ? override.status : filter,
      q: override.q !== undefined ? override.q : searchQuery,
      from: override.from !== undefined ? override.from : fromDate,
      to: override.to !== undefined ? override.to : toDate,
    };
    setLoading(true);
    try {
      const resp = await api.adminSmmOrders(params);
      setOrders(resp.orders || []);
      setCursor(resp.next_cursor || null);
      setHasMore(!!resp.has_more);
      setTotal(resp.total || 0);
      setError("");
    } catch (err) {
      setError(err.message || "Impossible de charger les commandes Boost.");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(days) {
    const d = days || statsDays;
    setStatsLoading(true);
    try {
      const resp = await api.adminSmmStats({ days: d });
      setStats(resp);
    } catch (err) {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = {
        limit: 50,
        status: filter,
        q: searchQuery,
        from: fromDate,
        to: toDate,
        cursor: cursor,
      };
      const resp = await api.adminSmmOrders(params);
      setOrders((prev) => [...prev, ...(resp.orders || [])]);
      setCursor(resp.next_cursor || null);
      setHasMore(!!resp.has_more);
      setTotal(resp.total || total);
    } catch (err) {
      setError(err.message || "Impossible de charger la suite.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openOrderDetail(order) {
    setDetailLoading(true);
    setDetailError("");
    setDetailOrder(null);
    try {
      const resp = await api.adminSmmOrder(order.id);
      setDetailOrder(resp);
    } catch (err) {
      setDetailError(err.message || "Impossible de charger le détail de la commande.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadProvider() {
    try {
      const resp = await api.adminSmmProvider();
      setProvider(resp);
      setProviderForm({
        enabled: !!resp.enabled,
        key: resp.provider_key || "smm_africa",
        baseUrl: resp.config?.baseUrl || "https://smm.africa/api/v3",
        timeoutMs: Number(resp.config?.timeoutMs) || 30000,
        apiKey: "",
        marginPercent: Math.round(((Number(resp.markup) || 1.5) - 1) * 100),
        usdToXaf: Number(resp.usd_to_xaf) || 655.957,
      });
      setImportForm((f) => ({
        ...f,
        markup: Number(resp.markup) || f.markup,
        usd_to_xaf: Number(resp.usd_to_xaf) || f.usd_to_xaf,
      }));
    } catch (err) {
      setProviderMessage(err.message || "Configuration fournisseur indisponible.");
    }
  }

  async function loadServices() {
    setServicesLoading(true);
    try {
      const resp = await api.adminSmmServices();
      setServices(resp.services || []);
    } catch (err) {
      setServiceNotice(err.message || "Impossible de charger les services.");
    } finally {
      setServicesLoading(false);
    }
  }

  function startNewService() {
    setEditingService({ id: null });
    setServiceForm({
      category_id: categories[0]?.id || "",
      name: "",
      description: "",
      short_description: "",
      price: "",
      currency: "XAF",
      billing_unit: "service",
      status: "active",
      is_automated: false,
      is_consulting: false,
      is_campaign: false,
      external_service_id: "",
      delivery_days: "",
      conditions: "",
      sort_order: 0,
    });
    setServiceNotice("");
  }

  function startEditService(svc) {
    setEditingService(svc);
    setServiceForm({
      category_id: svc.category_id || "",
      name: svc.name || "",
      description: svc.description || "",
      short_description: svc.short_description || "",
      price: svc.price ?? "",
      currency: svc.currency || "XAF",
      billing_unit: svc.billing_unit || "service",
      status: svc.status || "active",
      is_automated: !!svc.is_automated,
      is_consulting: !!svc.is_consulting,
      is_campaign: !!svc.is_campaign,
      external_service_id: svc.external_service_id || "",
      delivery_days: svc.delivery_days || "",
      conditions: svc.conditions || "",
      sort_order: svc.sort_order ?? 0,
    });
    setServiceNotice("");
  }

  function cancelServiceEdit() {
    setEditingService(null);
    setServiceNotice("");
  }

  async function saveService(e) {
    e?.preventDefault();
    if (!editingService) return;
    setSavingService(true);
    setServiceNotice("");
    const payload = {
      category_id: Number(serviceForm.category_id),
      name: serviceForm.name,
      description: serviceForm.description || null,
      short_description: serviceForm.short_description || null,
      price: Number(serviceForm.price),
      currency: serviceForm.currency,
      billing_unit: serviceForm.billing_unit,
      status: serviceForm.status,
      is_automated: !!serviceForm.is_automated,
      is_consulting: !!serviceForm.is_consulting,
      is_campaign: !!serviceForm.is_campaign,
      external_service_id: serviceForm.external_service_id || null,
      delivery_days: serviceForm.delivery_days ? Number(serviceForm.delivery_days) : null,
      conditions: serviceForm.conditions || null,
      sort_order: Number(serviceForm.sort_order) || 0,
    };
    try {
      if (editingService.id) {
        await api.adminSmmUpdateService(editingService.id, payload);
        setServiceNotice("Service mis à jour.");
      } else {
        await api.adminSmmCreateService(payload);
        setServiceNotice("Service créé.");
      }
      setEditingService(null);
      await loadServices();
    } catch (err) {
      setServiceNotice(err.message || "Enregistrement impossible.");
    } finally {
      setSavingService(false);
    }
  }

  async function toggleServiceStatus(svc) {
    const next = svc.status === "active" ? "inactive" : "active";
    try {
      await api.adminSmmPatchService(svc.id, { status: next });
      await loadServices();
    } catch (err) {
      setServiceNotice(err.message || "Mise à jour impossible.");
    }
  }

  async function deleteService(svc) {
    if (!window.confirm(`Supprimer le service « ${svc.name} » ?`)) return;
    try {
      await api.adminSmmDeleteService(svc.id);
      setServiceNotice("Service supprimé.");
      await loadServices();
    } catch (err) {
      setServiceNotice(err.message || "Suppression impossible.");
    }
  }
  async function loadPaymentInfo() {
    try {
      const resp = await api.adminSmmPaymentInfo();
      setPaymentInfo(resp.payment_info || null);
      setPaymentForm(resp.payment_info || {});
    } catch {
      /* pas bloquant */
    }
  }

  async function searchWalletUsers(e) {
    e?.preventDefault();
    const query = walletSearch.trim();
    if (query.length < 2) {
      setWalletMessage("Saisissez au moins 2 caractères (nom, e-mail ou référence).");
      return;
    }
    setWalletBusy(true);
    setWalletMessage("");
    try {
      const resp = await api.adminUsers(query);
      const users = (resp.users || []).slice(0, 8);
      setWalletUsers(users);
      if (!users.length) setWalletMessage("Aucun utilisateur trouvé.");
    } catch (err) {
      setWalletMessage(err.message || "Recherche impossible.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function openWalletUser(user) {
    setWalletBusy(true);
    setWalletMessage("");
    try {
      const resp = await api.adminSmmWallet(user.id);
      setWalletUser(resp.user);
      setWalletData(resp.wallet);
      setWalletUsers([]);
      setWalletForm({ amount_usd: "", note: "", transaction_type: "admin_credit" });
    } catch (err) {
      setWalletMessage(err.message || "Impossible de charger le portefeuille.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function creditWallet(e) {
    e.preventDefault();
    if (!walletUser) return;
    setWalletBusy(true);
    setWalletMessage("");
    try {
      const resp = await api.adminSmmCreditWallet({
        user_id: walletUser.id,
        amount_usd: Number(walletForm.amount_usd),
        note: walletForm.note || null,
        transaction_type: walletForm.transaction_type,
      });
      const message = `Portefeuille crédité. Nouveau solde : $${Number(resp.balance_usd).toFixed(2)}`;
      setWalletForm((f) => ({ ...f, amount_usd: "", note: "" }));
      await openWalletUser(walletUser);
      setWalletMessage(message);
    } catch (err) {
      setWalletMessage(err.message || "Crédit impossible.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function saveProvider(e) {
    e.preventDefault();
    setSavingProvider(true);
    setProviderMessage("");
    try {
      await api.adminSmmSaveProvider({
        smm_provider_enabled: !!providerForm.enabled,
        smm_provider_key: providerForm.key,
        smm_api_base_url: providerForm.baseUrl,
        smm_api_timeout: Number(providerForm.timeoutMs) || 30000,
        smm_markup: 1 + (Number(providerForm.marginPercent) || 0) / 100,
        smm_usd_to_xaf: Number(providerForm.usdToXaf) || 655.957,
        ...(providerForm.apiKey ? { smm_api_key: providerForm.apiKey } : {}),
      });
      setProviderMessage("Configuration fournisseur enregistrée.");
      setProviderForm((f) => ({ ...f, apiKey: "" }));
      setImportForm((f) => ({
        ...f,
        markup: 1 + (Number(providerForm.marginPercent) || 0) / 100,
        usd_to_xaf: Number(providerForm.usdToXaf) || f.usd_to_xaf,
      }));
      await loadProvider();
    } catch (err) {
      setProviderMessage(err.message || "Erreur d'enregistrement.");
    } finally {
      setSavingProvider(false);
    }
  }

  async function checkBalance() {
    setBalanceBusy(true);
    setProviderMessage("");
    try {
      const resp = await api.adminSmmBalance();
      setBalance(resp);
    } catch (err) {
      setProviderMessage(err.message || "Solde fournisseur indisponible.");
    } finally {
      setBalanceBusy(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setImportResult(null);
    setProviderMessage("");
    try {
      const types = String(importForm.types || "default")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const resp = await api.adminSmmImportCatalog({
        markup: Number(importForm.markup) || 1,
        usd_to_xaf: Number(importForm.usd_to_xaf) || 655.957,
        category_id: importForm.category_id ? Number(importForm.category_id) : null,
        types: types.length ? types : ["default"],
        limit: Number(importForm.limit) || 0,
        dry_run: Boolean(importForm.dry_run),
      });
      setImportResult(resp);
    } catch (err) {
      setProviderMessage(err.message || "Import du catalogue impossible.");
    } finally {
      setImporting(false);
    }
  }

  async function savePaymentInfo(e) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoMessage("");
    try {
      const resp = await api.adminSmmSavePaymentInfo(paymentForm);
      setPaymentInfo(resp.payment_info || paymentForm);
      setPaymentForm(resp.payment_info || paymentForm);
      setInfoMessage("Instructions de paiement enregistrées.");
    } catch (err) {
      setInfoMessage(err.message || "Erreur d'enregistrement.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function confirmPayment(order) {
    setBusyId(order.id);
    setNotice("");
    try {
      const resp = await api.adminSmmConfirmPayment(order.id, { dispatch: true });
      const dispatchError = resp.dispatch && !resp.dispatch.ok ? ` — ${resp.dispatch.error}` : "";
      setNotice(
        `Paiement #${order.id} confirmé (statut : ${STATUS_LABELS[resp.status] || resp.status})${dispatchError}`
      );
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Impossible de confirmer le paiement.");
    } finally {
      setBusyId(null);
    }
  }

  async function dispatchOrder(order) {
    setBusyId(order.id);
    setNotice("");
    try {
      const resp = await api.adminSmmDispatch(order.id);
      setNotice(
        `Commande #${order.id} transmise au fournisseur${resp.external_reference ? ` (réf. ${resp.external_reference})` : ""}.`
      );
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Transmission impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function refundOrder(order) {
    const amount = window.prompt(
      `Montant à rembourser en USD (laisser vide pour rembourser le débit original) pour la commande #${order.id} :`,
      ""
    );
    if (amount === null) return;
    setBusyId(order.id);
    setNotice("");
    try {
      const payload = amount.trim() ? { amount_usd: Number(amount) } : {};
      const resp = await api.adminSmmRefund(order.id, payload);
      setNotice(
        `Commande #${order.id} remboursée${resp.refunded_usd ? ` (${resp.refunded_usd} USD)` : ""}.`
      );
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Remboursement impossible.");
    } finally {
      setBusyId(null);
    }
  }
  async function cancelOrder(order) {
    if (!window.confirm(`Annuler la commande #${order.id} et rembourser automatiquement ?`)) return;
    setBusyId(order.id);
    setNotice("");
    try {
      const resp = await api.adminSmmCancel(order.id, {});
      setNotice(
        `Commande #${order.id} annulee${resp.refunded_usd ? ` (${resp.refunded_usd} USD rembourses)` : ""}.`
      );
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Annulation impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(order, status) {
    if (!status || status === order.status) return;
    setBusyId(order.id);
    setNotice("");
    try {
      await api.adminSmmUpdateOrder(order.id, { status });
      setNotice(`Commande #${order.id} mise a jour : ${STATUS_LABELS[status] || status}.`);
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Mise a jour impossible.");
    } finally {
      setBusyId(null);
    }
  }


  async function syncStatuses() {
    setSyncing(true);
    setNotice("");
    try {
      const resp = await api.adminSmmSync();
      const parts = [`${resp.checked || 0} commande(s) verifiee(s)`, `${resp.updated || 0} mise(s) a jour`];
      if (resp.errors?.length) parts.push(`${resp.errors.length} erreur(s)`);
      setNotice(parts.join(" - "));
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  }


  const visibleOrders = orders;
  const pendingCount = orders.filter((order) => ["draft", "pending_payment"].includes(order.status)).length;

  return (
    <div className="boost-admin">
      {notice && <p className="success">{notice}</p>}

﻿      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <div className="boost-admin-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            📊 {t("Statistiques Boost")}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="input"
              value={statsDays}
              onChange={(e) => { const d = Number(e.target.value); setStatsDays(d); loadStats(d); }}
              style={{ width: 120 }}
            >
              <option value={7}>{t("7 jours")}</option>
              <option value={30}>{t("30 jours")}</option>
              <option value={90}>{t("90 jours")}</option>
            </select>
            <button className="btn btn-outline btn-small" onClick={() => loadStats()} disabled={statsLoading}>
              {statsLoading ? "…" : t("Actualiser")}
            </button>
          </div>
        </div>
        {statsLoading && !stats && <p className="hint">{t("Chargement…")}</p>}
        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
              <div className="card" style={{ padding: 12 }}>
                <div className="hint">{t("CA total (USD)")}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{usd(stats.revenue_usd)}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="hint">{t("CA période (USD)")}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{usd(stats.period_revenue_usd)}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="hint">{t("Commandes")}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_orders}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="hint">{t("Payées")}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.paid_count}</div>
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="hint">{t("Taux de réussite")}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Math.round((stats.success_rate || 0) * 100)}%</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 8px" }}>{t("Commandes par statut")}</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.entries(stats.by_status || {}).map(([st, c]) => (
                  <span key={st} className="badge" style={{ padding: "4px 8px" }}>
                    {t(STATUS_LABELS[st] || st)}: {c}
                  </span>
                ))}
              </div>
            </div>
            {stats.top_services && stats.top_services.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: "0 0 8px" }}>{t("Top services")}</h4>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table className="table" style={{ width: "100%", minWidth: 320 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>{t("Service")}</th>
                        <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>{t("Commandes")}</th>
                        <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>{t("CA (USD)")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.top_services.map((s, i) => (
                        <tr key={i}>
                          <td style={{ wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>{s.service_name}</td>
                          <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{s.count}</td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{usd(s.revenue_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {stats.daily && stats.daily.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: "0 0 8px" }}>{t("Évolution")}</h4>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, overflowX: "auto" }}>
                  {stats.daily.map((d) => {
                    const max = Math.max(...stats.daily.map((x) => x.count), 1);
                    const h = Math.round((d.count / max) * 70);
                    return (
                      <div key={d.date} title={d.date + " : " + d.count} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 14 }}>
                        <div style={{ width: 10, height: h, background: "var(--primary)", borderRadius: 2 }} />
                      </div>
                    );
                  })}
                </div>
                <div className="hint" style={{ marginTop: 4 }}>
                  {t("Commandes par jour sur la période")}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <div className="boost-admin-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            🚀 {t("MboppiBoost — commandes")}
            {pendingCount > 0 && <span className="boost-admin-count">{pendingCount}</span>}
          </h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-small" onClick={loadOrders} disabled={loading}>
              {loading ? "…" : t("Actualiser")}
            </button>
            <button className="btn btn-outline btn-small" onClick={syncStatuses} disabled={syncing}>
              {syncing ? t("Synchronisation…") : t("Synchroniser les statuts")}
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {t(
            "Confirmez le paiement reçu, puis la commande est transmise automatiquement au fournisseur configuré. Sans fournisseur, traitez-la manuellement."
          )}
        </p>
        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
          <label className="label">{t("Filtrer")}</label>
          <select
            className="input"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              loadOrders({ status: e.target.value });
            }}
          >
            <option value="all">{t("Toutes les commandes")}</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder={t("Recherche (réf, client, email, service)")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadOrders({ q: searchQuery });
            }}
            style={{ minWidth: 220 }}
          />
          <input
            className="input"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              loadOrders({ from: e.target.value });
            }}
          />
          <input
            className="input"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              loadOrders({ to: e.target.value });
            }}
          />
          <button className="btn btn-outline btn-small" onClick={() => loadOrders()} disabled={loading}>
            {loading ? "…" : t("Appliquer")}
          </button>
          <span className="hint">
            {visibleOrders.length} / {total || orders.length}
          </span>
        </div>

        {hasMore && (
          <div style={{ margin: "8px 0" }}>
            <button className="btn btn-outline btn-small" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("Chargement…") : t("Charger la suite")}
            </button>
          </div>
        )}

        {visibleOrders.length === 0 ? (
          <p className="hint">{t("Aucune commande dans ce filtre.")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("N°")}</th>
                  <th>{t("Client")}</th>
                  <th>{t("Service")}</th>
                  <th>{t("Qté")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Paiement")}</th>
                  <th>{t("Statut")}</th>
                  <th>{t("Fournisseur")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const info = order.client_info || {};
                  const contact = [info.name || order.user_name, info.phone || order.user_phone, info.email || order.user_email]
                    .filter(Boolean)
                    .join(" · ");
                  const target = info.profile_url || info.link || "";
                  return (
                    <tr key={order.id}>
                      <td>
                        #{order.id}
                        <div className="hint">{new Date(order.created_at).toLocaleDateString("fr-FR")}</div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {contact || "—"}
                        {target && (
                          <div className="hint" style={{ overflowWrap: "anywhere" }}>
                            <a href={target} target="_blank" rel="noopener noreferrer">
                              {target}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        {order.service_name}
                        <div className="hint">
                          {order.quantity} × {money(order.service_price, order.currency)}
                        </div>
                      </td>
                      <td>{order.quantity}</td>
                      <td>{money(order.total, order.currency)}</td>
                      <td>
                        <span className="hint">
                          {order.status === "refund_pending"
                            ? t("Remboursement en cours")
                            : order.status === "refunded" || order.payment_status === "refunded"
                              ? t("Remboursé")
                              : order.payment_status === "paid"
                            ? t("Confirmé")
                            : order.payment_status === "declared"
                              ? t("Déclaré")
                              : t("Non payé")}
                        </span>
                        {(order.payment_reference || order.payment_external_reference) && (
                          <div className="hint" style={{ overflowWrap: "anywhere" }}>
                            Réf. {order.payment_reference || order.payment_external_reference}
                          </div>
                        )}
                        {order.payment_provider && (
                          <div className="hint">{order.payment_provider}</div>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-${order.status}`}>
                          {t(STATUS_LABELS[order.status] || order.status)}
                        </span>
                        {order.provider_status && (
                          <div className="hint">
                            {order.provider_status}
                            {order.external_reference ? ` · ${order.external_reference}` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        {order.provider_status === "dispatch_error" ? (
                          <span className="error-msg">{t("Échec d'envoi")}</span>
                        ) : order.external_reference ? (
                          t("Envoyée")
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="boost-admin-actions">
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => openOrderDetail(order)}
                          >
                            {t("Détail / progression")}
                          </button>
                          {["draft", "pending_payment"].includes(order.status) && (
                            <button
                              className="btn btn-primary btn-small"
                              disabled={busyId === order.id}
                              onClick={() => confirmPayment(order)}
                            >
                              {t("Confirmer le paiement")}
                            </button>
                          )}
                          {order.status === "paid" && (
                            <button
                              className="btn btn-outline btn-small"
                              disabled={busyId === order.id}
                              onClick={() => dispatchOrder(order)}
                            >
                              {t("Envoyer au fournisseur")}
                            </button>
                          )}
                          {["failed", "cancelled"].includes(order.status) && (
                            <button
                              className="btn btn-primary btn-small"
                              disabled={busyId === order.id}
                              onClick={() => dispatchOrder(order)}
                            >
                              {t("Réessayer la transmission")}
                            </button>
                          )}
                          {order.status === "paid" && !order.external_reference && (
                            <button
                              className="btn btn-outline btn-small"
                              disabled={busyId === order.id}
                              onClick={() => cancelOrder(order)}
                            >
                              {t("Annuler")}
                            </button>
                          )}
                          {!["refunded", "cancelled"].includes(order.status) && (
                            <button
                              className="btn btn-outline btn-small"
                              disabled={busyId === order.id}
                              onClick={() => refundOrder(order)}
                            >
                              {t("Rembourser")}
                            </button>
                          )}
                          {order.status === "paid" &&
                            order.provider_status === "dispatch_error" && (
                              <span className="hint">{t("Vérifiez la configuration fournisseur.")}</span>
                            )}
                          <select
                            className="input boost-admin-status"
                            value=""
                            disabled={busyId === order.id}
                            onChange={(e) => changeStatus(order, e.target.value)}
                          >
                            <option value="">{t("Changer le statut…")}</option>
                            {WORKFLOW_STATUSES.filter((status) => status !== order.status).map((status) => (
                              <option key={status} value={status}>
                                {t(STATUS_LABELS[status])}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          👛 {t("Portefeuille Boost")}
        </h2>
        <p className="hint">
          {t(
            "Recherchez un utilisateur pour consulter son solde ou le créditer (remboursement, geste commercial)."
          )}
        </p>
        <form onSubmit={searchWalletUsers} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input
            className="input"
            style={{ flex: "1 1 260px", minWidth: 0 }}
            value={walletSearch}
            onChange={(e) => setWalletSearch(e.target.value)}
            placeholder={t("Nom, e-mail ou référence")}
          />
          <button className="btn btn-outline btn-small" type="submit" disabled={walletBusy}>
            {walletBusy ? "…" : t("Rechercher")}
          </button>
        </form>
        {walletMessage && <p className="hint" style={{ marginTop: 8 }}>{walletMessage}</p>}
        {walletUsers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {walletUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className="btn btn-outline btn-small"
                style={{ justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => openWalletUser(user)}
              >
                {user.name || user.email || `#${user.id}`}
                {user.email ? ` · ${user.email}` : ""}
                {user.role ? ` · ${user.role}` : ""}
              </button>
            ))}
          </div>
        )}

        {walletUser && walletData && (
          <div className="boost-admin-grid" style={{ marginTop: 14 }}>
            <div>
              <p className="hint">
                <strong>{walletUser.name || walletUser.email || `#${walletUser.id}`}</strong>
                {walletUser.email ? ` · ${walletUser.email}` : ""}
              </p>
              <p style={{ fontSize: 24, fontWeight: 800, margin: "6px 0" }}>
                {usd(walletData.balance_usd)}
              </p>
              <p className="hint">
                {t("Dernière mise à jour")} :{" "}
                {walletData.updated_at
                  ? new Date(walletData.updated_at).toLocaleString("fr-FR")
                  : "—"}
              </p>
              <form onSubmit={creditWallet} style={{ marginTop: 10 }}>
                <div className="form-row">
                  <label>{t("Montant en USD")}</label>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    value={walletForm.amount_usd}
                    onChange={(e) =>
                      setWalletForm((f) => ({ ...f, amount_usd: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="form-row">
                  <label>{t("Type d'opération")}</label>
                  <select
                    className="input"
                    value={walletForm.transaction_type}
                    onChange={(e) =>
                      setWalletForm((f) => ({ ...f, transaction_type: e.target.value }))
                    }
                  >
                    <option value="admin_credit">{t("Crédit administrateur")}</option>
                    <option value="refund">{t("Remboursement")}</option>
                    <option value="adjustment">{t("Ajustement")}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>{t("Note (optionnel)")}</label>
                  <input
                    className="input"
                    value={walletForm.note}
                    onChange={(e) => setWalletForm((f) => ({ ...f, note: e.target.value }))}
                    maxLength={300}
                  />
                </div>
                <button className="btn btn-primary btn-small" type="submit" disabled={walletBusy}>
                  {walletBusy ? "…" : t("Créditer le portefeuille")}
                </button>
              </form>
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>{t("Dernières opérations")}</h3>
              {walletData.transactions?.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("Date")}</th>
                        <th>{t("Type")}</th>
                        <th>{t("Montant")}</th>
                        <th>{t("Solde")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletData.transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="hint">
                            {new Date(tx.created_at).toLocaleString("fr-FR")}
                          </td>
                          <td>
                            {t(WALLET_TX_LABELS[tx.transaction_type] || tx.transaction_type)}
                            {tx.description && <div className="hint">{tx.description}</div>}
                          </td>
                          <td style={{ color: Number(tx.amount_usd) >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                            {Number(tx.amount_usd) > 0 ? "+" : ""}
                            {usd(tx.amount_usd)}
                          </td>
                          <td>{usd(tx.balance_after_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hint">{t("Aucune opération.")}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="boost-admin-grid">
        <div className="card" style={{ padding: 18 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            🔌 {t("Fournisseur SMM")}
          </h2>
          <p className="hint">
            {provider?.enabled
              ? `✅ ${t("Fournisseur actif")} : ${provider.provider || "smm_africa"}${
                  provider.has_api_key ? " · clé enregistrée" : " · aucune clé"
                }`
              : t("Aucun fournisseur actif : les commandes payées restent à traiter manuellement.")}
          </p>
          <form onSubmit={saveProvider}>
            <label className="boost-admin-check">
              <input
                type="checkbox"
                checked={!!providerForm.enabled}
                onChange={(e) => setProviderForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              {t("Activer le fournisseur automatique")}
            </label>
            <div className="form-row">
              <label>{t("Fournisseur")}</label>
              <select
                className="input"
                value={providerForm.key}
                onChange={(e) => setProviderForm((f) => ({ ...f, key: e.target.value }))}
              >
                <option value="smm_africa">SMM Africa</option>
              </select>
            </div>
            <div className="form-row">
              <label>{t("URL de l'API")}</label>
              <input
                className="input"
                type="url"
                value={providerForm.baseUrl}
                onChange={(e) => setProviderForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://smm.africa/api/v3"
              />
            </div>
            <div className="form-row">
              <label>{t("Délai (ms)")}</label>
              <input
                className="input"
                type="number"
                min="1000"
                max="120000"
                value={providerForm.timeoutMs}
                onChange={(e) => setProviderForm((f) => ({ ...f, timeoutMs: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>{t("Clé API (laisser vide pour conserver)")}</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={provider?.has_api_key ? "••••••••" : t("Clé fournisseur")}
              />
            </div>
            <div className="form-row">
              <label>{t("Marge (%)")}</label>
              <input
                className="input"
                type="number"
                min="0"
                max="900"
                step="1"
                value={providerForm.marginPercent}
                onChange={(e) =>
                  setProviderForm((f) => ({ ...f, marginPercent: e.target.value }))
                }
              />
            </div>
            <div className="form-row">
              <label>{t("Taux USD → XAF")}</label>
              <input
                className="input"
                type="number"
                min="1"
                max="10000"
                step="0.001"
                value={providerForm.usdToXaf}
                onChange={(e) =>
                  setProviderForm((f) => ({ ...f, usdToXaf: e.target.value }))
                }
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-small" type="submit" disabled={savingProvider}>
                {savingProvider ? t("Enregistrement…") : t("Enregistrer")}
              </button>
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={checkBalance}
                disabled={balanceBusy || !provider?.enabled}
              >
                {balanceBusy ? "…" : t("Vérifier le solde")}
              </button>
            </div>
            {balance && (
              <p className="hint" style={{ marginTop: 8 }}>
                {t("Solde fournisseur")} : <strong>{balance.balance}</strong> {balance.currency}
                {balance.reserved_balance !== undefined &&
                  balance.reserved_balance !== null && (
                    <>
                      {" · "}
                      {t("Réservé")} : <strong>{balance.reserved_balance}</strong>{" "}
                      {balance.currency}
                    </>
                  )}
                {" · "}
                {t("Marge")} : <strong>{Number(providerForm.marginPercent) || 0}%</strong>
                {" · "}
                {t("Gain")} :{" "}
                <strong>
                  {usd(
                    (Number(balance.balance) || 0) *
                      ((Number(providerForm.marginPercent) || 0) / 100)
                  )}
                </strong>
              </p>
            )}
            {providerMessage && <p className="hint">{providerMessage}</p>}
          </form>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            📥 {t("Importer le catalogue fournisseur")}
          </h2>
          <p className="hint">
            {t(
              "Le prix de vente = taux fournisseur (USD / 1000) × taux XAF × marge. Les services sont créés ou mis à jour, puis associés au fournisseur."
            )}
          </p>
          <div className="form-row">
            <label>{t("Marge (ex. 1,2 = +20 %)")}</label>
            <input
              className="input"
              type="number"
              min="1"
              max="10"
              step="0.01"
              value={importForm.markup}
              onChange={(e) => setImportForm((f) => ({ ...f, markup: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>{t("Taux USD → XAF")}</label>
            <input
              className="input"
              type="number"
              min="1"
              step="0.001"
              value={importForm.usd_to_xaf}
              onChange={(e) => setImportForm((f) => ({ ...f, usd_to_xaf: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>{t("Forcer une catégorie (optionnel)")}</label>
            <select
              className="input"
              value={importForm.category_id}
              onChange={(e) => setImportForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">{t("Catégories du fournisseur")}</option>
              {categories
                .filter((category) => category.is_active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("Types de services (séparés par virgule)")}</label>
            <input
              className="input"
              type="text"
              value={importForm.types}
              onChange={(e) => setImportForm((f) => ({ ...f, types: e.target.value }))}
              placeholder="default"
            />
            <p className="hint">
              {t("« default » couvre les services standards. Ajoutez d'autres types séparés par une virgule si nécessaire.")}
            </p>
          </div>
          <div className="form-row">
            <label>{t("Limite (0 = tout importer)")}</label>
            <input
              className="input"
              type="number"
              min="0"
              max="20000"
              step="1"
              value={importForm.limit}
              onChange={(e) => setImportForm((f) => ({ ...f, limit: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(importForm.dry_run)}
                onChange={(e) => setImportForm((f) => ({ ...f, dry_run: e.target.checked }))}
              />
              {t("Simulation (aucun changement en base)")}
            </label>
          </div>
          <button
            className="btn btn-primary btn-small"
            type="button"
            onClick={runImport}
            disabled={importing || !provider?.enabled}
          >
            {importing
              ? t("Import en cours…")
              : importForm.dry_run
                ? t("Simuler l'import")
                : t("Importer le catalogue")}
          </button>
          {!provider?.enabled && (
            <p className="hint">{t("Activez d'abord le fournisseur et enregistrez sa clé API.")}</p>
          )}
          {importResult && (
            <p className="hint">
              {importResult.dry_run ? (
                <>
                  {t("Simulation")} : {importResult.would_import ?? 0} {t("services seraient importés")} ·{" "}
                  {importResult.would_activate ?? 0} {t("activés")} · {importResult.would_hide ?? 0}{" "}
                  {t("masqués")}
                  {importResult.skipped ? ` · ${t("ignorés")} : ${importResult.skipped}` : ""}
                </>
              ) : (
                <>
                  {t("Importés")} : {importResult.imported} · {t("créés")} : {importResult.created} ·{" "}
                  {t("mis à jour")} : {importResult.updated}
                  {importResult.skipped ? ` · ${t("ignorés")} : ${importResult.skipped}` : ""}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 20 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          💳 {t("Instructions de paiement Boost")}
        </h2>
        <p className="hint">
          {t(
            "Ces coordonnées sont affichées au client après la création de sa commande. Il déclare ensuite sa référence de transaction, que vous validez."
          )}
        </p>
        <form onSubmit={savePaymentInfo}>
          <div className="boost-admin-grid">
            <div className="form-row">
              <label>Orange Money</label>
              <input
                className="input"
                value={paymentForm.orange_money || ""}
                onChange={(e) => setPaymentForm((f) => ({ ...f, orange_money: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>MTN Mobile Money</label>
              <input
                className="input"
                value={paymentForm.mtn_mobile_money || ""}
                onChange={(e) => setPaymentForm((f) => ({ ...f, mtn_mobile_money: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>MoneyFusion</label>
              <input
                className="input"
                value={paymentForm.moneyfusion_phone || ""}
                onChange={(e) => setPaymentForm((f) => ({ ...f, moneyfusion_phone: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>{t("Nom du compte")}</label>
              <input
                className="input"
                value={paymentForm.account_name || ""}
                onChange={(e) => setPaymentForm((f) => ({ ...f, account_name: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>{t("WhatsApp support")}</label>
              <input
                className="input"
                value={paymentForm.whatsapp || ""}
                onChange={(e) => setPaymentForm((f) => ({ ...f, whatsapp: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row">
            <label>{t("Note affichée au client")}</label>
            <textarea
              className="input"
              rows={2}
              value={paymentForm.note || ""}
              onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary btn-small" type="submit" disabled={savingInfo}>
            {savingInfo ? t("Enregistrement…") : t("Enregistrer les instructions")}
          </button>
          {infoMessage && <p className="hint">{infoMessage}</p>}
          {paymentInfo && !infoMessage && (
            <p className="hint">
              {t("Numéros actuels")} : {paymentInfo.orange_money} (Orange) · {paymentInfo.mtn_mobile_money} (MTN)
            </p>
          )}
        </form>
      </div>
      {detailLoading && (
        <div className="modal-overlay" onClick={() => !detailLoading && setDetailOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="hint">{t("Chargement…")}</p>
          </div>
        </div>
      )}
      {detailError && (
        <div className="modal-overlay" onClick={() => setDetailError("")}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="error">{detailError}</p>
            <button className="btn btn-outline btn-small" onClick={() => setDetailError("")}>
              {t("Fermer")}
            </button>
          </div>
        </div>
      )}
      {detailOrder && (
        <div className="modal-overlay" onClick={() => setDetailOrder(null)}>
          <div className="modal" style={{ maxWidth: 720, width: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                {t("Commande")} #{detailOrder.order?.id}
              </h3>
              <button className="btn btn-outline btn-small" onClick={() => setDetailOrder(null)}>
                {t("Fermer")}
              </button>
            </div>
            {detailOrder.final_outcome && (
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <strong>{t("Résultat final")} :</strong>{" "}
                <span className={`badge badge-${detailOrder.final_outcome.status}`}>
                  {t(STATUS_LABELS[detailOrder.final_outcome.status] || detailOrder.final_outcome.status)}
                </span>
                {detailOrder.final_outcome.remains != null && (
                  <div className="hint">
                    {t("Restant")} : {detailOrder.final_outcome.remains}
                  </div>
                )}
                {detailOrder.final_outcome.charge != null && (
                  <div className="hint">
                    {t("Charge")} : {detailOrder.final_outcome.charge}
                  </div>
                )}
                {detailOrder.final_outcome.completed_at && (
                  <div className="hint">
                    {t("Terminée le")} : {new Date(detailOrder.final_outcome.completed_at).toLocaleString("fr-FR")}
                  </div>
                )}
              </div>
            )}
            <h4 style={{ marginTop: 8 }}>{t("Progression")}</h4>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {(detailOrder.events || []).length === 0 ? (
                <p className="hint">{t("Aucun événement.")}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(detailOrder.events || []).map((ev) => (
                    <li key={ev.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <strong>{ev.event_type}</strong>
                        <span className="hint">{new Date(ev.created_at).toLocaleString("fr-FR")}</span>
                      </div>
                      {(ev.old_status || ev.new_status) && (
                        <div className="hint">
                          {ev.old_status || "—"} → {ev.new_status || "—"}
                        </div>
                      )}
                      {ev.message && <div className="hint" style={{ overflowWrap: "anywhere" }}>{ev.message}</div>}
                      {ev.provider_payload && Object.keys(ev.provider_payload).length > 0 && (
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                          {JSON.stringify(ev.provider_payload)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
