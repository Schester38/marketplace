import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";
import { IconShare } from "./icons.jsx";

function shareMessage(t) {
  return t(
    "🛍️ Découvrez Mboppi : le marché en ligne du Cameroun et de l'Afrique. Boutiques, vendeurs et créateurs — commandez facilement ! 👉 {url}",
    { url: BASE_URL }
  );
}

function openUrl(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function ShareMboppiButton({ onOpened }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const msg = shareMessage(t);

  const close = () => {
    setOpen(false);
    setCopied(false);
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: t("Partager Mboppi"), text: msg, url: BASE_URL });
      close();
    } catch {
      /* partage annulé par l'utilisateur */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const encoded = encodeURIComponent(msg);
  const encodedUrl = encodeURIComponent(BASE_URL);

  const networks = [
    {
      name: "WhatsApp",
      color: "#25D366",
      icon: "💬",
      onClick: () => openUrl(`https://wa.me/?text=${encoded}`),
    },
    {
      name: "Facebook",
      color: "#1877F2",
      icon: "📘",
      onClick: () =>
        openUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encoded}`),
    },
    {
      name: "Telegram",
      color: "#26A5E4",
      icon: "✈️",
      onClick: () => openUrl(`https://t.me/share/url?url=${encodedUrl}&text=${encoded}`),
    },
    {
      name: "X (Twitter)",
      color: "#000000",
      icon: "🐦",
      onClick: () => openUrl(`https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`),
    },
    {
      name: "E-mail",
      color: "#EA4335",
      icon: "📧",
      onClick: () =>
        openUrl(`mailto:?subject=${encodeURIComponent(t("Découvre Mboppi"))}&body=${encoded}`),
    },
    {
      name: t("Copier le lien"),
      color: "#6b7280",
      icon: copied ? "✅" : "🔗",
      onClick: copyLink,
    },
  ];

  return (
    <>
      <button
        type="button"
        className="suggest-toggle share-mboppi-toggle"
        aria-label={t("Partager Mboppi")}
        title={t("Partager Mboppi")}
        onClick={() => setOpen(true)}
      >
        <span className="share-mboppi-icon">
          <IconShare size={16} />
        </span>
        <span>{t("Partager Mboppi")}</span>
      </button>
      {open &&
        createPortal(
          <div
            className="modal-overlay suggest-overlay"
            onClick={close}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{t("Partager Mboppi")}</h3>
                <button
                  type="button"
                  className="drawer-close"
                  aria-label={t("Fermer")}
                  onClick={close}
                >
                  ✕
                </button>
              </div>

              {navigator.share && (
                <button className="btn btn-primary btn-block" onClick={shareNative}>
                  {t("📲 Partager via l'appareil")}
                </button>
              )}

              <div className="share-grid">
                {networks.map((n) => (
                  <button
                    key={n.name}
                    className="share-btn"
                    style={{ "--share-color": n.color }}
                    onClick={n.onClick}
                  >
                    <span className="share-icon">{n.icon}</span>
                    {n.name}
                  </button>
                ))}
              </div>

              <div className="share-preview">
                <pre>{msg}</pre>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
