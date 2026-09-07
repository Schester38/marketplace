import React, { useState } from "react";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";
import { IconShare } from "./icons.jsx";
import { nativeShareWithImage } from "../share.js";

function shareMessage(t) {
  return t(
    "Découvrez Mboppi : le marché en ligne du Cameroun et de l'Afrique. Boutiques, vendeurs, créateurs et livreur — commandez facilement, vendez plus et Gagnez ! 👉 {url}",
    { url: BASE_URL }
  );
}

export default function ShareMboppiButton({ onOpened }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  const copyFallback = async () => {
    try {
      await navigator.clipboard.writeText(BASE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const handleShare = async () => {
    if (onOpened) onOpened();
    const msg = shareMessage(t);

    if (navigator.share) {
      await nativeShareWithImage({ title: t("Partager Mboppi"), text: msg, url: BASE_URL, useLogo: true });
      return;
    }

    // Navigateur sans Web Share : WhatsApp + presse-papiers
    copyFallback();
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      className="suggest-toggle share-mboppi-toggle"
      aria-label={t("Partager Mboppi")}
      title={t("Partager Mboppi")}
      onClick={handleShare}
    >
      <span className="share-mboppi-icon">
        <IconShare size={16} />
      </span>
      <span>{copied ? t("Lien copié !") : t("Partager Mboppi")}</span>
    </button>
  );
}