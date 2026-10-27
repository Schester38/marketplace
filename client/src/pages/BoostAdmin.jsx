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

export default function BoostAdmin() {
  const { t } = useLang();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const [provider, setProvider] = useState(null);
  const [providerForm, setProviderForm] = useState({
    enabled: false,
    key: "smm_africa",
    baseUrl: "https://smm.africa/api/v3",
    timeoutMs: 30000,
    apiKey: "",
  });
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [balance, setBalance] = useState(null);
  const [balanceBusy, setBalanceBusy] = useState(false);

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

  useEffect(() => {
    loadOrders();
    loadProvider();
    loadPaymentInfo();
    api
      .adminSmmCategories()
      .then((resp) => setCategories(resp.categories || []))
      .catch(() => {});
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const resp = await api.adminSmmOrders(200);
      setOrders(resp.orders || []);
      setError("");
    } catch (err) {
      setError(err.message || "Impossible de charger les commandes Boost.");
    } finally {
      setLoading(false);
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
      });
    } catch (err) {
      setProviderMessage(err.message || "Configuration fournisseur indisponible.");
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
        ...(providerForm.apiKey ? { smm_api_key: providerForm.apiKey } : {}),
      });
      setProviderMessage("Configuration fournisseur enregistrée.");
      setProviderForm((f) => ({ ...f, apiKey: "" }));
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

  async function changeStatus(order, status) {
    if (!status || status === order.status) return;
    setBusyId(order.id);
    setNotice("");
    try {
      await api.adminSmmUpdateOrder(order.id, { status });
      setNotice(`Commande #${order.id} mise à jour : ${STATUS_LABELS[status] || status}.`);
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function syncStatuses() {
    setSyncing(true);
    setNotice("");
    try {
      const resp = await api.adminSmmSync();
      const parts = [`${resp.checked || 0} commande(s) vérifiée(s)`, `${resp.updated || 0} mise(s) à jour`];
      if (resp.errors?.length) parts.push(`${resp.errors.length} erreur(s)`);
      setNotice(parts.join(" · "));
      await loadOrders();
    } catch (err) {
      setNotice(err.message || "Synchronisation impossible.");
    } finally {
      setSyncing(false);
    }
  }

  const visibleOrders =
    filter === "all" ? orders : orders.filter((order) => order.status === filter);
  const pendingCount = orders.filter((order) => ["draft", "pending_payment"].includes(order.status)).length;

  return (
    <div className="boost-admin">
      {notice && <p className="success">{notice}</p>}

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
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("Toutes les commandes")}</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
          <span className="hint">
            {visibleOrders.length} / {orders.length}
          </span>
        </div>

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
    </div>
  );
}
