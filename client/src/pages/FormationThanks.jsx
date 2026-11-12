import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { downloadFunnelReceipt } from "../funnelReceipt.js";
import { useLang } from "../i18n.jsx";

function money(value, currency = "XAF") {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function FormationThanks() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useLang();
  const saleId = params.get("sale");
  const code = params.get("code") || "";
  const [status, setStatus] = useState("loading"); // loading | pending | timeout | ready | error
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const loadReceipt = useCallback(async () => {
    if (!saleId) {
      setStatus("error");
      setError(t("Lien de reçu incomplet. Utilisez le lien reçu après le paiement."));
      return;
    }
    try {
      const data = await api.funnelReceipt(saleId, code);
      setReceipt(data.receipt);
      setDownloaded(Boolean(data.receipt.receipt_downloaded_at && data.receipt.group_url));
      setStatus("ready");
      setError("");
    } catch (err) {
      if (err?.status === 409) {
        setStatus("pending");
        return;
      }
      setStatus("error");
      setError(err?.message || t("Impossible de charger le reçu."));
    }
  }, [saleId, code, t]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  useEffect(() => {
    if (status !== "pending") return undefined;
    let cancelled = false;
    let timer = null;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const data = await api.funnelStatus(saleId, code);
        if (cancelled) return;
        if (data?.paid) {
          await loadReceipt();
          return;
        }
      } catch {
        // on continue : le webhook iKeePay peut prendre quelques secondes
      }
      if (attempts >= 75) {
        setStatus("timeout");
        return;
      }
      timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, saleId, code, loadReceipt]);

  const handleDownload = async () => {
    if (!receipt) return;
    setDownloading(true);
    setError("");
    try {
      await downloadFunnelReceipt(receipt);
      setDownloaded(true);
      try {
        const data = await api.funnelReceiptDownloaded(saleId, code);
        setReceipt((current) =>
          current
            ? {
                ...current,
                group_url: data?.group_url || current.group_url,
                receipt_downloaded_at: data?.receipt_downloaded_at || new Date().toISOString(),
              }
            : current
        );
      } catch {
        // le PDF est déjà enregistré : le groupe s'ouvre quand même
      }
    } catch {
      setError(t("Le téléchargement du reçu a échoué. Réessayez."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="tw-min-h-screen tw-bg-[#050914] tw-font-sans tw-text-white">
      <div className="tw-mx-auto tw-max-w-2xl tw-px-4 tw-py-10 md:tw-py-14">
        {(status === "loading" || status === "pending") && (
          <div className="tw-rounded-3xl tw-border tw-border-white/10 tw-bg-[#0b1220] tw-p-8 tw-text-center">
            <span className="tw-mx-auto tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center">
              <span className="tw-h-14 tw-w-14 tw-animate-spin tw-rounded-full tw-border-4 tw-border-white/15 tw-border-t-amber-400" />
            </span>
            <h1 className="tw-mt-5 tw-text-2xl tw-font-black">
              {status === "loading"
                ? t("Chargement de votre reçu…")
                : t("Paiement en cours de confirmation…")}
            </h1>
            <p className="tw-mt-2 tw-text-sm tw-text-white/60">
              {t(
                "Cette page se met à jour automatiquement dès que iKeePay confirme votre paiement."
              )}
            </p>
          </div>
        )}

        {status === "timeout" && (
          <div className="tw-rounded-3xl tw-border tw-border-amber-400/25 tw-bg-[#0b1220] tw-p-8 tw-text-center">
            <span className="tw-text-5xl">⏳</span>
            <h1 className="tw-mt-4 tw-text-2xl tw-font-black">
              {t("Confirmation en attente")}
            </h1>
            <p className="tw-mt-2 tw-text-sm tw-text-white/60">
              {t(
                "Votre paiement n'est pas encore confirmé. Gardez cette référence et réessayez dans quelques minutes : aucun nouveau paiement n'est nécessaire."
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("loading");
                loadReceipt();
                setTimeout(() => setStatus((s) => (s === "loading" ? "pending" : s)), 1500);
              }}
              className="tw-mt-5 tw-rounded-xl tw-bg-white tw-px-5 tw-py-2.5 tw-text-sm tw-font-bold tw-text-slate-900"
            >
              {t("Vérifier à nouveau")}
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="tw-rounded-3xl tw-border tw-border-rose-400/25 tw-bg-[#0b1220] tw-p-8 tw-text-center">
            <span className="tw-text-5xl">⚠️</span>
            <h1 className="tw-mt-4 tw-text-2xl tw-font-black">{t("Reçu introuvable")}</h1>
            <p className="tw-mt-2 tw-text-sm tw-text-white/60">{error}</p>
            <div className="tw-mt-5 tw-flex tw-flex-wrap tw-justify-center tw-gap-2">
              <Link
                to={`/f/${id}`}
                className="tw-rounded-xl tw-bg-white tw-px-5 tw-py-2.5 tw-text-sm tw-font-bold tw-text-slate-900"
              >
                {t("Retour à l'offre")}
              </Link>
              <Link
                to="/contact"
                className="tw-rounded-xl tw-border tw-border-white/15 tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white/70"
              >
                {t("Contacter le support")}
              </Link>
            </div>
          </div>
        )}

        {status === "ready" && receipt && (
          <>
            <div className="tw-text-center">
              <span className="tw-inline-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-full tw-bg-emerald-400/15 tw-text-3xl">
                ✅
              </span>
              <h1 className="tw-mt-4 tw-text-3xl tw-font-black tracking-tight">
                {t("Paiement confirmé !")}
              </h1>
              <p className="tw-mt-2 tw-text-sm tw-text-white/60">
                {t("Merci {name}, votre place est réservée.", {
                  name: receipt.buyer?.first_name || "",
                })}
              </p>
            </div>

            <div className="tw-mt-7 tw-overflow-hidden tw-rounded-3xl tw-border tw-border-white/10 tw-bg-[#0b1220]">
              <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3 tw-border-b tw-border-white/10 tw-bg-gradient-to-r tw-from-amber-400/10 tw-to-transparent tw-p-5">
                <div>
                  <p className="tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-widest tw-text-amber-300">
                    🧾 {t("Reçu officiel")}
                  </p>
                  <p className="tw-mt-1 tw-text-sm tw-font-bold">{receipt.product?.name}</p>
                </div>
                <div className="tw-text-right">
                  <p className="tw-text-[10px] tw-uppercase tw-tracking-widest tw-text-white/40">
                    {t("Code du reçu")}
                  </p>
                  <p className="tw-text-lg tw-font-black tw-tracking-wider tw-text-blue-300">
                    {receipt.receipt_code}
                  </p>
                </div>
              </div>

              <div className="tw-grid tw-gap-3 tw-p-5 sm:tw-grid-cols-2">
                {[
                  [t("Montant"), money(receipt.amount, receipt.currency)],
                  [t("Date"), fmtDate(receipt.paid_at || receipt.created_at)],
                  [t("Acheteur"), receipt.buyer?.name || "—"],
                  [t("E-mail"), receipt.buyer?.email || "—"],
                  [t("WhatsApp"), receipt.buyer?.phone || "—"],
                  [t("Ville"), receipt.buyer?.city || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="tw-rounded-xl tw-bg-white/[0.04] tw-p-3">
                    <p className="tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-wider tw-text-white/40">
                      {label}
                    </p>
                    <p className="tw-mt-1 tw-break-words tw-text-sm tw-font-semibold tw-text-white/90">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="tw-border-t tw-border-white/10 tw-p-5">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="tw-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-2xl tw-bg-gradient-to-r tw-from-amber-400 tw-via-orange-500 tw-to-rose-500 tw-px-5 tw-py-3.5 tw-text-sm tw-font-black tw-text-slate-950 tw-shadow-lg tw-shadow-orange-500/25 disabled:tw-cursor-wait disabled:tw-opacity-60"
                >
                  {downloading
                    ? t("Génération du reçu…")
                    : downloaded
                      ? `⬇️ ${t("Retélécharger mon reçu (PDF)")}`
                      : `⬇️ ${t("Télécharger mon reçu (PDF)")}`}
                </button>
                {error && <p className="tw-mt-2 tw-text-center tw-text-xs tw-text-rose-300">{error}</p>}
              </div>
            </div>

            <div className="tw-mt-4 tw-rounded-3xl tw-border tw-border-emerald-400/25 tw-bg-gradient-to-b tw-from-emerald-400/10 tw-to-transparent tw-p-5 tw-text-center">
              <h2 className="tw-text-lg tw-font-black">🎉 {t("Rejoignez le groupe privé")}</h2>
              <p className="tw-mt-1 tw-text-xs tw-text-white/60">
                {receipt.group_url
                  ? t("Votre reçu est téléchargé : le groupe est maintenant accessible.")
                  : downloaded
                    ? t(
                        "Reçu téléchargé. Déblocage du groupe en cours… vérifiez votre connexion."
                      )
                    : t(
                        "Téléchargez d'abord votre reçu (PDF) pour débloquer l'accès au groupe WhatsApp privé."
                      )}
              </p>
              {downloaded && receipt.group_url ? (
                <a
                  href={receipt.group_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tw-mt-4 tw-inline-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-2xl tw-bg-[#25D366] tw-px-5 tw-py-3.5 tw-text-sm tw-font-black tw-text-[#052e16] hover:tw-brightness-105 sm:tw-w-auto sm:tw-px-8"
                >
                  💬 {t("Rejoindre le Groupe WhatsApp")}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="tw-mt-4 tw-inline-flex tw-w-full tw-cursor-not-allowed tw-items-center tw-justify-center tw-gap-2 tw-rounded-2xl tw-bg-white/10 tw-px-5 tw-py-3.5 tw-text-sm tw-font-bold tw-text-white/40 sm:tw-w-auto sm:tw-px-8"
                >
                  {downloaded
                    ? `⏳ ${t("Déblocage du groupe…")}`
                    : `🔒 ${t("Groupe verrouillé — reçu requis")}`}
                </button>
              )}
              <p className="tw-mt-3 tw-text-[10px] tw-text-white/35">
                {t(
                  "Le code du reçu permet à l'équipe MboppiShop de vérifier votre paiement à tout moment."
                )}
              </p>
            </div>

            <div className="tw-mt-6 tw-flex tw-flex-wrap tw-justify-center tw-gap-3 tw-text-xs">
              <Link
                to="/"
                className="tw-rounded-xl tw-border tw-border-white/15 tw-px-4 tw-py-2 tw-font-semibold tw-text-white/60"
              >
                {t("Retour à l'accueil")}
              </Link>
              <Link
                to="/contact"
                className="tw-rounded-xl tw-border tw-border-white/15 tw-px-4 tw-py-2 tw-font-semibold tw-text-white/60"
              >
                {t("Besoin d'aide ?")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
