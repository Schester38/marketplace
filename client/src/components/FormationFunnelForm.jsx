import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { markFunnelSalePaid, rememberFunnelSale } from "../funnelSales.js";
import IkeepayCheckout from "./IkeepayCheckout.jsx";

const inputClass =
  "tw-w-full tw-rounded-xl tw-border tw-border-white/15 tw-bg-white/[0.06] tw-px-3.5 tw-py-2.5 tw-text-sm tw-text-white tw-placeholder-white/30 tw-outline-none focus:tw-border-amber-400/60 focus:tw-ring-2 focus:tw-ring-amber-400/20";

function money(value, currency = "XAF") {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;
}

function splitName(name) {
  const clean = String(name || "").trim();
  if (!clean) return ["", ""];
  const parts = clean.split(/\s+/);
  return [parts[0] || "", parts.slice(1).join(" ")];
}

export default function FormationFunnelForm({ funnel, onClose }) {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [firstName, lastName] = useMemo(() => splitName(user?.name), [user?.name]);

  const [form, setForm] = useState({
    buyer_first_name: firstName,
    buyer_last_name: lastName,
    buyer_email: user?.email || "",
    buyer_phone: user?.phone || "",
    buyer_city: user?.city || "",
    buyer_reason: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("form"); // form | checkout | waiting | timeout
  const [order, setOrder] = useState(null);
  const paidTrackedRef = useRef(false);

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const checkStatus = useCallback(async () => {
    if (!order) return false;
    try {
      const data = await api.funnelStatus(order.saleId, order.code);
      if (data?.paid) {
        markFunnelSalePaid(order.saleId);
        if (!paidTrackedRef.current) {
          paidTrackedRef.current = true;
          api
            .trackFunnel("funnel_paid", {
              product_id: funnel.product_id,
              path: `/f/${funnel.product_id}`,
            })
            .catch(() => {});
        }
        navigate(
          `/f/${funnel.product_id}/merci?sale=${order.saleId}&code=${encodeURIComponent(order.code)}`
        );
        return true;
      }
    } catch {
      // le sondage continue : le webhook peut arriver avec un peu de retard
    }
    return false;
  }, [order, navigate, funnel.product_id]);

  useEffect(() => {
    if (stage !== "waiting" || !order) return undefined;
    let cancelled = false;
    let timer = null;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      const paid = await checkStatus();
      if (cancelled || paid) return;
      if (attempts >= 90) {
        setStage("timeout");
        return;
      }
      timer = setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, order, checkStatus]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!form.buyer_first_name.trim() || !form.buyer_last_name.trim()) {
      setError(t("Renseignez votre prénom et votre nom."));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.buyer_email.trim())) {
      setError(t("Adresse e-mail invalide."));
      return;
    }
    if (form.buyer_phone.replace(/\D/g, "").length < 6) {
      setError(t("Numéro WhatsApp invalide."));
      return;
    }
    if (!form.buyer_city.trim()) {
      setError(t("Indiquez votre ville."));
      return;
    }
    setBusy(true);
    try {
      const data = await api.digitalPayin({
        product_id: funnel.product_id,
        buyer_first_name: form.buyer_first_name.trim(),
        buyer_last_name: form.buyer_last_name.trim(),
        buyer_name: `${form.buyer_first_name} ${form.buyer_last_name}`.trim(),
        buyer_email: form.buyer_email.trim(),
        buyer_phone: form.buyer_phone.trim(),
        buyer_city: form.buyer_city.trim(),
        buyer_reason: form.buyer_reason.trim(),
      });
      setOrder({
        saleId: data.sale_id,
        code: data.confirm_code,
        checkoutUrl: data.checkout_url,
        receiptCode: data.receipt_code,
      });
      rememberFunnelSale({
        saleId: data.sale_id,
        code: data.confirm_code,
        receiptCode: data.receipt_code,
        productId: funnel.product_id,
        name: funnel.name,
        price: funnel.price,
        currency: funnel.currency,
        image: funnel.image || funnel.gallery?.[0] || "",
        paid: false,
      });
      api
        .trackFunnel("funnel_payin_created", {
          product_id: funnel.product_id,
          path: `/f/${funnel.product_id}`,
        })
        .catch(() => {});
      setStage("checkout");
    } catch (err) {
      setError(
        err?.message === "IKEEPAY_NOT_CONFIGURED"
          ? t("Le paiement en ligne n'est pas disponible pour le moment.")
          : err?.message || t("Impossible d'ouvrir le paiement en ligne.")
      );
    } finally {
      setBusy(false);
    }
  };

  const closeCheckout = () => {
    setStage("form");
    setNotice(
      order
        ? t("Paiement interrompu. Si vous avez déjà payé, cliquez sur « J'ai déjà payé ».")
        : t("Paiement interrompu.")
    );
  };

  if (stage === "checkout" && order) {
    return (
      <IkeepayCheckout
        checkoutUrl={order.checkoutUrl}
        onSuccess={() => setStage("waiting")}
        onClose={closeCheckout}
      />
    );
  }

  if (stage === "waiting" || stage === "timeout") {
    return (
      <div className="tw-fixed tw-inset-0 tw-z-[90] tw-flex tw-items-center tw-justify-center tw-bg-black/80 tw-p-4 tw-backdrop-blur-sm">
        <div className="tw-w-full tw-max-w-md tw-rounded-3xl tw-border tw-border-white/10 tw-bg-[#0b1220] tw-p-6 tw-text-center tw-text-white">
          {stage === "waiting" ? (
            <>
              <span className="tw-mx-auto tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center">
                <span className="tw-h-12 tw-w-12 tw-animate-spin tw-rounded-full tw-border-4 tw-border-white/15 tw-border-t-amber-400" />
              </span>
              <h2 className="tw-mt-4 tw-text-xl tw-font-bold">
                {t("Vérification du paiement…")}
              </h2>
              <p className="tw-mt-2 tw-text-sm tw-text-white/60">
                {t(
                  "Confirmez le paiement dans la fenêtre iKeePay. Cette page se met à jour automatiquement."
                )}
              </p>
              <p className="tw-mt-3 tw-text-xs tw-text-white/35">
                {t("Référence : {ref}", { ref: order?.receiptCode || order?.code || "—" })}
              </p>
              <p className="tw-mt-1 tw-text-[11px] tw-text-white/40">
                {t("Votre reçu sera aussi envoyé à {email}.", {
                  email: form.buyer_email || t("votre adresse e-mail"),
                })}
              </p>
            </>
          ) : (
            <>
              <span className="tw-text-4xl">⏳</span>
              <h2 className="tw-mt-3 tw-text-xl tw-font-bold">
                {t("Paiement en cours de confirmation")}
              </h2>
              <p className="tw-mt-2 tw-text-sm tw-text-white/60">
                {t(
                  "Le paiement n'est pas encore confirmé. Vous recevrez une confirmation dès que iKeePay l'aura validé — vous pouvez vérifier à nouveau."
                )}
              </p>
            </>
          )}
          <div className="tw-mt-5 tw-flex tw-flex-col tw-gap-2">
            <button
              type="button"
              onClick={() => {
                setStage("waiting");
              }}
              className="tw-rounded-xl tw-bg-white tw-px-4 tw-py-2.5 tw-text-sm tw-font-bold tw-text-slate-900"
            >
              {t("Vérifier à nouveau")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/mes-recus")}
              className="tw-rounded-xl tw-border tw-border-white/15 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white/70 hover:tw-bg-white/10"
            >
              🧾 {t("Retrouver mon reçu")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="tw-rounded-xl tw-border tw-border-white/15 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white/70"
            >
              {t("Fermer")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="tw-fixed tw-inset-0 tw-z-[90] tw-flex tw-items-start tw-justify-center tw-overflow-y-auto tw-bg-black/70 tw-p-3 tw-py-8 tw-backdrop-blur-sm sm:tw-p-6"
      role="dialog"
      aria-modal="true"
      aria-label={t("Réserver ma place")}
    >
      <div className="tw-w-full tw-max-w-lg tw-overflow-hidden tw-rounded-3xl tw-border tw-border-white/10 tw-bg-[#0b1220] tw-text-white tw-shadow-2xl">
        <div className="tw-flex tw-items-start tw-justify-between tw-gap-3 tw-border-b tw-border-white/10 tw-bg-gradient-to-r tw-from-amber-400/10 tw-to-transparent tw-p-5">
          <div>
            <p className="tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-widest tw-text-amber-300">
              🔒 {t("Commande sécurisée")}
            </p>
            <h2 className="tw-mt-1 tw-text-lg tw-font-bold tw-leading-tight">{funnel.name}</h2>
            <p className="tw-mt-1 tw-text-sm tw-font-semibold tw-text-white/70">
              {money(funnel.price, funnel.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-border tw-border-white/15 tw-text-white/60 hover:tw-bg-white/10"
            aria-label={t("Fermer")}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="tw-space-y-3.5 tw-p-5">
          <div className="tw-grid tw-gap-3.5 sm:tw-grid-cols-2">
            <div>
              <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-first">
                {t("Prénom")} *
              </label>
              <input
                id="ff-first"
                className={`${inputClass} tw-mt-1`}
                value={form.buyer_first_name}
                onChange={update("buyer_first_name")}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-last">
                {t("Nom")} *
              </label>
              <input
                id="ff-last"
                className={`${inputClass} tw-mt-1`}
                value={form.buyer_last_name}
                onChange={update("buyer_last_name")}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div>
            <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-email">
              {t("Adresse e-mail")} *
            </label>
            <input
              id="ff-email"
              type="email"
              className={`${inputClass} tw-mt-1`}
              value={form.buyer_email}
              onChange={update("buyer_email")}
              autoComplete="email"
              placeholder="vous@exemple.com"
              required
            />
            <p className="tw-mt-1 tw-text-[10px] tw-text-white/35">
              {t("Le reçu officiel y sera associé.")}
            </p>
          </div>

          <div className="tw-grid tw-gap-3.5 sm:tw-grid-cols-2">
            <div>
              <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-phone">
                {t("WhatsApp")} *
              </label>
              <input
                id="ff-phone"
                type="tel"
                className={`${inputClass} tw-mt-1`}
                value={form.buyer_phone}
                onChange={update("buyer_phone")}
                autoComplete="tel"
                placeholder="6 XX XX XX XX"
                required
              />
            </div>
            <div>
              <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-city">
                {t("Ville")} *
              </label>
              <input
                id="ff-city"
                className={`${inputClass} tw-mt-1`}
                value={form.buyer_city}
                onChange={update("buyer_city")}
                autoComplete="address-level2"
                placeholder="Douala"
                required
              />
            </div>
          </div>

          <div>
            <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="ff-reason">
              {t("Pourquoi souhaitez-vous rejoindre cette formation ? (optionnel)")}
            </label>
            <textarea
              id="ff-reason"
              rows={2}
              className={`${inputClass} tw-mt-1 tw-resize-none`}
              value={form.buyer_reason}
              onChange={update("buyer_reason")}
              placeholder={t("Votre objectif en une phrase…")}
            />
          </div>

          {notice && (
            <p className="tw-rounded-xl tw-border tw-border-sky-400/30 tw-bg-sky-400/10 tw-p-3 tw-text-xs tw-text-sky-200">
              {notice}
              {order && (
                <button
                  type="button"
                  onClick={() => setStage("waiting")}
                  className="tw-ml-2 tw-font-bold tw-underline"
                >
                  {t("J'ai déjà payé")}
                </button>
              )}
            </p>
          )}
          {error && (
            <p className="tw-rounded-xl tw-border tw-border-rose-400/30 tw-bg-rose-400/10 tw-p-3 tw-text-xs tw-text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="tw-w-full tw-rounded-2xl tw-bg-gradient-to-r tw-from-amber-400 tw-via-orange-500 tw-to-rose-500 tw-px-5 tw-py-3.5 tw-text-sm tw-font-black tw-text-slate-950 tw-shadow-lg tw-shadow-orange-500/25 tw-transition hover:tw-brightness-110 disabled:tw-cursor-wait disabled:tw-opacity-60"
          >
            {busy
              ? t("Ouverture du paiement…")
              : `${t("Payer")} ${money(funnel.price, funnel.currency)}`}
          </button>
          <p className="tw-text-center tw-text-[10px] tw-text-white/35">
            🔐 {t("Paiement traité par iKeePay — Mobile Money ou carte bancaire.")}
          </p>
        </form>
      </div>
    </div>
  );
}
