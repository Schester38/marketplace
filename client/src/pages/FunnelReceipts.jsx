import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import Seo from "../components/Seo.jsx";
import { forgetFunnelSale, listFunnelSales } from "../funnelSales.js";

function money(value, currency = "XAF") {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function FunnelReceipts() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [sales, setSales] = useState(() => listFunnelSales());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openSale = (sale) => {
    navigate(
      `/f/${sale.productId || sale.product_id}/merci?sale=${sale.saleId}&code=${encodeURIComponent(sale.code || "")}`
    );
  };

  const remove = (saleId) => {
    forgetFunnelSale(saleId);
    setSales(listFunnelSales());
  };

  const lookup = async (event) => {
    event.preventDefault();
    setError("");
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError(t("Saisissez le code de reçu figurant dans votre e-mail."));
      return;
    }
    setBusy(true);
    try {
      const data = await api.funnelFind(clean);
      navigate(
        `/f/${data.product_id}/merci?sale=${data.sale_id}&code=${encodeURIComponent(data.confirm_code || "")}`
      );
    } catch (err) {
      setError(err?.message || t("Aucun reçu ne correspond à ce code."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tw-min-h-screen tw-bg-[#050914] tw-font-sans tw-text-white">
      <Seo
        title={`${t("Retrouver mon reçu")} | MboppiShop`}
        description={t(
          "Retrouvez le reçu de votre formation achetée sur MboppiShop, sur cet appareil ou avec votre code MBP."
        )}
      />
      <div className="tw-mx-auto tw-max-w-3xl tw-px-4 tw-py-10 md:tw-py-14">
        <Link to="/" className="tw-text-xs tw-font-semibold tw-text-white/50 hover:tw-text-white">
          ← {t("Retour à l'accueil")}
        </Link>
        <h1 className="tw-mt-3 tw-text-3xl tw-font-black tw-tracking-tight">
          🧾 {t("Retrouver mon reçu")}
        </h1>
        <p className="tw-mt-2 tw-text-sm tw-leading-relaxed tw-text-white/60">
          {t(
            "Saisissez le code de reçu reçu par e-mail (MBP-…) ou retrouvez un achat effectué sur cet appareil."
          )}
        </p>

        <form
          onSubmit={lookup}
          className="tw-mt-6 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-white/[0.04] tw-p-4 md:tw-p-5"
        >
          <label className="tw-text-xs tw-font-semibold tw-text-white/70" htmlFor="receipt-code">
            {t("Code du reçu")}
          </label>
          <div className="tw-mt-2 tw-flex tw-flex-col tw-gap-2 sm:tw-flex-row">
            <input
              id="receipt-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MBP-XXXXXXXX"
              autoComplete="off"
              className="tw-w-full tw-rounded-xl tw-border tw-border-white/15 tw-bg-white/[0.06] tw-px-3.5 tw-py-2.5 tw-font-mono tw-text-sm tw-text-white tw-placeholder-white/30 tw-outline-none focus:tw-border-amber-400/60 focus:tw-ring-2 focus:tw-ring-amber-400/20"
            />
            <button
              type="submit"
              disabled={busy}
              className="tw-shrink-0 tw-rounded-xl tw-bg-gradient-to-r tw-from-amber-400 tw-via-orange-500 tw-to-rose-500 tw-px-5 tw-py-2.5 tw-text-sm tw-font-black tw-text-slate-950 disabled:tw-cursor-wait disabled:tw-opacity-60"
            >
              {busy ? t("Recherche…") : t("Ouvrir mon reçu")}
            </button>
          </div>
          {error && <p className="tw-mt-2 tw-text-xs tw-text-rose-300">{error}</p>}
        </form>

        <section className="tw-mt-8">
          <h2 className="tw-text-sm tw-font-bold tw-uppercase tw-tracking-wider tw-text-white/50">
            {t("Achats sur cet appareil")}
          </h2>
          {sales.length === 0 ? (
            <div className="tw-mt-3 tw-rounded-2xl tw-border tw-border-dashed tw-border-white/15 tw-p-6 tw-text-center">
              <p className="tw-text-sm tw-text-white/50">
                {t("Aucun achat mémorisé sur cet appareil pour le moment.")}
              </p>
              <p className="tw-mt-2 tw-text-xs tw-text-white/35">
                {t("Utilisez le code MBP-… reçu par e-mail pour retrouver un reçu.")}
              </p>
            </div>
          ) : (
            <div className="tw-mt-3 tw-space-y-3">
              {sales.map((sale) => (
                <article
                  key={sale.saleId}
                  className="tw-flex tw-flex-col tw-gap-3 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-[#0b1220] tw-p-4 sm:tw-flex-row sm:tw-items-center"
                >
                  {sale.image ? (
                    <img
                      src={sale.image}
                      alt=""
                      className="tw-h-16 tw-w-16 tw-shrink-0 tw-rounded-xl tw-object-cover"
                    />
                  ) : (
                    <span className="tw-flex tw-h-16 tw-w-16 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-500/15 tw-text-2xl">
                      🎓
                    </span>
                  )}
                  <div className="tw-min-w-0 tw-flex-1">
                    <p className="tw-truncate tw-text-sm tw-font-bold">
                      {sale.name || t("Formation")}
                    </p>
                    <p className="tw-mt-0.5 tw-font-mono tw-text-xs tw-text-blue-300">
                      {sale.receiptCode || "—"}
                    </p>
                    <p className="tw-mt-1 tw-text-[11px] tw-text-white/40">
                      {fmtDate(sale.at)}
                      {sale.price != null
                        ? ` · ${money(sale.price, sale.currency || "XAF")}`
                        : ""}
                    </p>
                  </div>
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                    <span
                      className={`tw-rounded-full tw-px-2 tw-py-1 tw-text-[10px] tw-font-bold ${
                        sale.paid
                          ? "tw-bg-emerald-400/15 tw-text-emerald-300"
                          : "tw-bg-amber-400/15 tw-text-amber-300"
                      }`}
                    >
                      {sale.paid ? `✓ ${t("Payé")}` : `⏳ ${t("En attente")}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => openSale(sale)}
                      className="tw-rounded-xl tw-bg-white tw-px-3.5 tw-py-2 tw-text-xs tw-font-bold tw-text-slate-900"
                    >
                      {t("Ouvrir mon reçu")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(sale.saleId)}
                      className="tw-rounded-xl tw-border tw-border-white/15 tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-text-white/60 hover:tw-bg-white/10"
                    >
                      {t("Retirer")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="tw-mt-8 tw-text-center tw-text-[11px] tw-leading-relaxed tw-text-white/35">
          {t(
            "Cette liste reste uniquement sur cet appareil. Votre code MBP-… est la preuve d'accès acceptée par le serveur."
          )}
        </p>
      </div>
    </div>
  );
}
