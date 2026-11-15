import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import SalesFunnelPageView from "../components/SalesFunnelPageView.jsx";
import { api } from "../api.js";
import { BASE_URL } from "../config.js";
import { useLang } from "../i18n.jsx";

export default function SalesFunnelLanding() {
  const { slug } = useParams();
  const { t } = useLang();
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    api.publicSalesFunnel(slug)
      .then((data) => {
        if (active) setFunnel(data.funnel);
      })
      .catch(() => {
        if (active) setNotFound(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!funnel?.id) return;
    const key = `mboppi_funnel_view_${funnel.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Analytics are best effort when browser storage is unavailable.
    }
    api.trackSalesFunnelEvent(funnel.id, "view").catch(() => {});
  }, [funnel?.id]);

  if (loading) {
    return <main className="tw-flex tw-min-h-[60vh] tw-items-center tw-justify-center tw-bg-slate-950 tw-p-6 tw-text-white">{t("Chargement…")}</main>;
  }
  if (notFound || !funnel) {
    return (
      <main className="tw-flex tw-min-h-[60vh] tw-flex-col tw-items-center tw-justify-center tw-gap-4 tw-bg-slate-950 tw-p-6 tw-text-center tw-text-white">
        <Seo title={`${t("Ce tunnel n’est pas disponible.")} | MboppiShop`} noindex />
        <p>{t("Ce tunnel n’est pas disponible.")}</p>
        <Link to="/tunnel/creer" className="tw-rounded-xl tw-bg-white tw-px-4 tw-py-2 tw-font-bold tw-text-slate-900">{t("Retour à mes tunnels")}</Link>
      </main>
    );
  }

  const shareUrl = `${BASE_URL}/tunnel/${funnel.slug}`;
  const share = () => {
    setShareError("");
    const shareData = {
      title: funnel.content?.title || funnel.title,
      text: funnel.content?.subtitle || funnel.title,
      url: shareUrl,
    };
    if (navigator.share) {
      navigator.share(shareData).catch((error) => {
        if (error?.name !== "AbortError") setShareError(t("Impossible de partager cette page."));
      });
      return;
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${shareData.title}\n${shareData.text}\n${shareUrl}`)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };
  const trackEvent = (event, productId) => {
    api.trackSalesFunnelEvent(funnel.id, event, productId).catch(() => {});
  };

  return (
    <>
      <Seo
        title={`${funnel.content?.title || funnel.title} | MboppiShop`}
        description={funnel.content?.subtitle || ""}
        noindex={false}
      />
      {shareError && <p role="alert" className="tw-bg-rose-50 tw-p-3 tw-text-center tw-text-sm tw-text-rose-800">{shareError}</p>}
      <SalesFunnelPageView funnel={funnel} onEvent={trackEvent} onShare={share} />
    </>
  );
}
