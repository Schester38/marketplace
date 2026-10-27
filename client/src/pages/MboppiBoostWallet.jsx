import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";

const CURRENCY_KEY = "boost_currency";
const DEFAULT_CURRENCY = "USD";

const TYPE_LABELS = {
  topup: "Recharge",
  order_payment: "Commande Boost",
  admin_credit: "Crédit administrateur",
  refund: "Remboursement",
  adjustment: "Ajustement",
};

const formatUsd = (value) =>
  `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

function formatMoney(value, code, decimals = 2) {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount)} ${code}`;
  }
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function readStoredCurrency() {
  try {
    const stored = localStorage.getItem(CURRENCY_KEY);
    return stored && /^[A-Z]{3}$/.test(stored) ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export default function MboppiBoostWallet() {
  const { t } = useLang();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currency, setCurrency] = useState(readStoredCurrency);
  const [amount, setAmount] = useState("");
  const [creating, setCreating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [topupRef, setTopupRef] = useState("");
  const [topupStatus, setTopupStatus] = useState("");
  const [topupError, setTopupError] = useState("");
  const [success, setSuccess] = useState(null);
  const pollRef = useRef(0);

  const topupMeta = data?.topup;
  const rates = data?.fx?.rates;
  const balanceUsd = Number(data?.wallet?.balance_usd) || 0;
  const currentMeta = useMemo(
    () => topupMeta?.currencies?.find((item) => item.code === currency) || null,
    [topupMeta, currency]
  );
  const rate = currency === "USD" ? 1 : Number(rates?.[currency]);
  const displayBalance =
    currency === "USD" ? balanceUsd : Number.isFinite(rate) && rate > 0 ? balanceUsd * rate : null;

  const quickAmounts = useMemo(() => {
    if (!currentMeta) return [];
    const values =
      currency === "XAF" || currency === "XOF"
        ? [5000, 10000, 25000, 50000]
        : [5, 10, 25, 50];
    return values.filter(
      (value) =>
        value >= Number(currentMeta.min_amount || 0) &&
        value <= Number(currentMeta.max_amount || Infinity)
    );
  }, [currentMeta, currency]);

  async function loadWallet() {
    setError("");
    try {
      const resp = await api.smmWallet();
      setData(resp);
      return resp;
    } catch (err) {
      setError(err.message || "Impossible de charger le portefeuille.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadWallet();
  }, [user]);

  useEffect(() => {
    if (!topupRef) return undefined;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const resp = await api.smmWalletTopupStatus(topupRef);
        if (cancelled) return;
        setTopupStatus(resp.status);
        if (resp.status === "completed") {
          setCheckoutUrl("");
          setTopupRef("");
          setSuccess({
            creditUsd: resp.credit_usd,
            balanceUsd: resp.balance_usd,
            reference: topupRef,
          });
          setAmount("");
          await loadWallet();
          return;
        }
        if (resp.status === "failed") {
          setTopupError("Cette recharge a échoué. Aucun montant n'a été crédité.");
          setTopupRef("");
        }
      } catch {
        /* nouvelle tentative dans 4 s */
      }
      if (attempts >= 90) {
        setTopupError(
          "La confirmation prend plus de temps que prévu. Votre paiement sera crédité automatiquement dès réception."
        );
        setTopupRef("");
      }
    };
    pollRef.current += 1;
    const run = pollRef.current;
    const id = setInterval(() => {
      if (pollRef.current === run) tick();
    }, 4000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [topupRef]);

  useEffect(() => {
    const meta = topupMeta?.currencies || [];
    if (!meta.length) return;
    const match = meta.find((item) => item.code === currency);
    if (!match || !match.enabled) {
      const fallback = meta.find((item) => item.code === DEFAULT_CURRENCY && item.enabled);
      if (fallback) setCurrency(fallback.code);
    }
  }, [topupMeta, currency]);

  function changeCurrency(code) {
    setCurrency(code);
    setAmount("");
    setTopupError("");
    try {
      localStorage.setItem(CURRENCY_KEY, code);
    } catch {
      /* stockage indisponible */
    }
  }

  async function startTopup(e) {
    e.preventDefault();
    setTopupError("");
    setSuccess(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setTopupError("Saisissez un montant valide.");
      return;
    }
    setCreating(true);
    try {
      const resp = await api.smmWalletTopup({ amount: value, currency });
      setTopupRef(resp.reference);
      setTopupStatus("pending");
      setCheckoutUrl(resp.checkout_url);
    } catch (err) {
      setTopupError(err.message || "Impossible d'ouvrir le paiement.");
    } finally {
      setCreating(false);
    }
  }

  if (!user) {
    return (
      <main className="boost-page">
        <Seo title="Portefeuille Boost — MboppiBoost" />
        <div className="boost-shell">
          <section className="boost-card boost-card-pad boost-order-state">
            <span className="boost-empty-icon">👛</span>
            <h1 className="boost-section-title">{t("Portefeuille Boost")}</h1>
            <p className="boost-section-lead">
              {t("Connectez-vous pour recharger votre solde et payer vos commandes MboppiBoost.")}
            </p>
            <Link to="/login" className="boost-btn boost-btn-primary">
              {t("Se connecter")}
            </Link>
          </section>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="boost-page">
        <Seo title="Portefeuille Boost — MboppiBoost" />
        <div className="boost-shell">
          <section className="boost-card boost-card-pad boost-order-state">
            <span className="boost-skeleton tw-h-5 tw-w-48" />
            <p className="boost-muted tw-mt-4">{t("Chargement…")}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="boost-page">
      <Seo
        title="Portefeuille Boost — MboppiBoost"
        description="Rechargez votre portefeuille MboppiBoost et payez vos commandes de services digitaux."
      />
      <div className="boost-shell">
        <section className="boost-hero boost-wallet-hero">
          <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
          <span className="boost-orb boost-orb-a" aria-hidden="true" />
          <span className="boost-orb boost-orb-b" aria-hidden="true" />
          <div className="boost-wallet-hero-inner">
            <div className="tw-min-w-0">
              <Link to="/mboppi-boost" className="boost-back">
                ← {t("Retour à MboppiBoost")}
              </Link>
              <span className="boost-eyebrow">👛 MboppiBoost</span>
              <h1 className="boost-title">
                {t("Votre portefeuille")} <span className="boost-title-accent">Boost.</span>
              </h1>
              <p className="boost-lead">
                {t(
                  "Rechargez en ligne, conservez votre solde en dollars et payez vos commandes en un clic."
                )}
              </p>
            </div>
            <div className="boost-wallet-balance-card">
              <p className="boost-stat-label">{t("Solde disponible")}</p>
              <p className="boost-wallet-balance">
                {displayBalance == null ? formatUsd(balanceUsd) : formatMoney(displayBalance, currency, currentMeta?.decimals ?? 2)}
              </p>
              {currency !== "USD" && (
                <p className="boost-wallet-balance-usd">
                  {t("Équivalent")} : {formatUsd(balanceUsd)}
                </p>
              )}
              <label className="boost-wallet-currency">
                <span>{t("Devise d'affichage")}</span>
                <select value={currency} onChange={(e) => changeCurrency(e.target.value)}>
                  {(topupMeta?.currencies || []).map((item) => (
                    <option key={item.code} value={item.code} disabled={!item.enabled}>
                      {item.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        {error && (
          <div className="boost-card boost-card-pad tw-mt-6">
            <p className="error-msg">{error}</p>
            <button type="button" className="boost-btn boost-btn-secondary" onClick={loadWallet}>
              {t("Réessayer")}
            </button>
          </div>
        )}

        {success && (
          <div className="boost-card boost-card-pad boost-wallet-success tw-mt-6">
            <strong>✅ {t("Recharge confirmée")}</strong>
            <p>
              {formatUsd(success.creditUsd)} {t("ont été ajoutés à votre portefeuille.")}{" "}
              {t("Nouveau solde")} : {formatUsd(success.balanceUsd)}
            </p>
          </div>
        )}

        <div className="boost-wallet-grid">
          <section className="boost-card boost-card-pad">
            <p className="boost-kicker">{t("Recharge")}</p>
            <h2 className="boost-section-title">{t("Ajouter des fonds")}</h2>
            <p className="boost-section-lead">
              {t(
                "Le montant est débité dans la devise choisie puis crédité en dollars au taux du jour."
              )}
            </p>

            {!topupMeta?.enabled ? (
              <div className="boost-wallet-unavailable">
                <strong>⚠️ {t("Recharge en ligne indisponible")}</strong>
                <p>
                  {topupMeta?.reason === "fx_unavailable"
                    ? t("Les taux de change sont momentanément indisponibles. Réessayez dans quelques minutes.")
                    : t(
                        "Le paiement en ligne est désactivé. Contactez l'administration pour recharger votre portefeuille."
                      )}
                </p>
              </div>
            ) : (
              <form onSubmit={startTopup} className="boost-wallet-topup-form">
                <label>
                  <span>{t("Montant à recharger")}</span>
                  <div className="boost-wallet-amount">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={currentMeta?.min_amount || 1}
                      max={currentMeta?.max_amount || undefined}
                      step={currentMeta?.decimals === 0 ? 1 : 0.01}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={String(currentMeta?.min_amount || 1)}
                      required
                    />
                    <span>{currency}</span>
                  </div>
                </label>
                {quickAmounts.length > 0 && (
                  <div className="boost-wallet-quick">
                    {quickAmounts.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAmount(String(value))}
                        className={Number(amount) === value ? "is-active" : ""}
                      >
                        {formatMoney(value, currency, currentMeta?.decimals ?? 2)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="boost-wallet-quote">
                  <span>{t("Crédit estimé")}</span>
                  <strong>
                    {rate > 0 && Number(amount) > 0
                      ? formatUsd(Number(amount) / rate)
                      : formatUsd(0)}
                  </strong>
                </div>
                <p className="boost-hint">
                  {t("Minimum")} : {formatMoney(currentMeta?.min_amount, currency, currentMeta?.decimals ?? 2)} ·{" "}
                  {t("Maximum")} : {formatMoney(currentMeta?.max_amount, currency, currentMeta?.decimals ?? 2)}
                </p>
                <button
                  type="submit"
                  className="boost-btn boost-btn-primary boost-btn-block"
                  disabled={creating || Boolean(topupRef)}
                >
                  {creating ? t("Ouverture du paiement…") : t("Recharger avec iKeePay")}
                </button>
                {topupError && <p className="error-msg">{topupError}</p>}
                {topupStatus === "pending" && topupRef && (
                  <p className="boost-hint">
                    {t("En attente de confirmation du paiement")} · {topupRef}
                  </p>
                )}
              </form>
            )}
            {topupMeta?.enabled && data?.fx?.stale && (
              <p className="boost-hint">
                {t("Taux de change mis en cache. Le montant exact sera confirmé au paiement.")}
              </p>
            )}
          </section>

          <section className="boost-card boost-card-pad">
            <p className="boost-kicker">{t("Historique")}</p>
            <h2 className="boost-section-title">{t("Dernières opérations")}</h2>
            {data?.wallet?.transactions?.length ? (
              <ul className="boost-wallet-tx">
                {data.wallet.transactions.map((tx) => {
                  const positive = Number(tx.amount_usd) > 0;
                  return (
                    <li key={tx.id}>
                      <div>
                        <strong>{TYPE_LABELS[tx.transaction_type] || tx.transaction_type}</strong>
                        <span>{tx.description || formatDate(tx.created_at)}</span>
                        {tx.description && <span>{formatDate(tx.created_at)}</span>}
                      </div>
                      <div className={positive ? "is-credit" : "is-debit"}>
                        <strong>
                          {positive ? "+" : ""}
                          {formatUsd(tx.amount_usd)}
                        </strong>
                        <span>{formatUsd(tx.balance_after_usd)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="boost-wallet-empty">
                <span>🧾</span>
                <p>{t("Aucune opération pour le moment.")}</p>
              </div>
            )}
          </section>
        </div>

        <div className="boost-wallet-actions">
          <Link to="/mboppi-boost" className="boost-btn boost-btn-secondary">
            {t("Retour aux services")}
          </Link>
          <Link to="/mboppi-boost/mes-commandes" className="boost-btn boost-btn-secondary">
            {t("Mes commandes")}
          </Link>
          <Link to="/contact" className="boost-btn boost-btn-ghost">
            {t("Besoin d'aide ?")}
          </Link>
        </div>
      </div>

      {checkoutUrl && (
        <IkeepayCheckout
          checkoutUrl={checkoutUrl}
          onSuccess={() => {
            setCheckoutUrl("");
          }}
          onClose={() => setCheckoutUrl("")}
        />
      )}
    </main>
  );
}
