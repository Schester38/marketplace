import React, { useState } from "react";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";
import { IconShare } from "./icons.jsx";

const LOGO_URL = "/share-logo.png";

function shareMessage(t) {
  return t(
    "Découvrez Mboppi : le marché en ligne du Cameroun et de l'Afrique. Boutiques, vendeurs, créateurs et livreur — commandez facilement, vendez plus et Gagnez ! 👉 {url}",
    { url: BASE_URL }
  );
}

async function logoFile() {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], "mboppi-logo.png", { type: blob.type || "image/png" });
  } catch {
    return null;
  }
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
      const shareData = { title: t("Partager Mboppi"), text: msg, url: BASE_URL };
      const file = await logoFile();
      if (file) {
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        } catch {
          /* canShare indisponible : partage sans image */
        }
      }
      try {
        await navigator.share(shareData);
      } catch {
        /* partage annulé ou indisponible */
      }
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