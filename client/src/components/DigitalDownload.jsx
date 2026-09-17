import React, { useState } from "react";
import { api } from "../api.js";
import { formatBytes } from "../imageKit.js";
import { useLang } from "../i18n.jsx";

/**
 * Téléchargement d'un produit DIGITAL.
 *
 * Le serveur délivre une URL SIGNÉE (bucket privé Supabase, 10 minutes) : le
 * fichier part alors DIRECTEMENT sur l'appareil de l'acheteur, sans transiter
 * par notre API (donc sans la limite de 4,5 Mo des fonctions Vercel).
 * Pour un achat effectué sans compte, le code de confirmation de la commande
 * (prop `code`) fait office de preuve d'achat.
 */
export default function DigitalDownload({ sale, code, compact = false, label }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const start = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const d = await api.digitalDownload(sale.id, code);
      // L'URL signée (10 min) est fournie par le serveur, déjà en mode
      // « pièce jointe » (`download=<nom>`) : le navigateur enregistre le
      // fichier directement sur l'appareil.
      const a = document.createElement("a");
      a.href = d.url;
      a.rel = "noopener";
      if (d.file_name) a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMsg(
        d.remaining > 0
          ? t("Téléchargement lancé ({n} restant(s)).", { n: d.remaining })
          : t("Téléchargement lancé.")
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!sale?.is_digital) return null;

  return (
    <div className="digital-download" style={{ marginTop: 8 }}>
      <button
        type="button"
        className={`btn btn-primary${compact ? " btn-small" : ""}`}
        onClick={start}
        disabled={busy}
      >
        {busy ? `⏳ ${t("Préparation…")}` : `⬇️ ${label || t("Télécharger le fichier")}`}
      </button>
      {sale.digital_name && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          📁 {sale.digital_name}
          {sale.digital_size ? ` — ${formatBytes(Number(sale.digital_size))}` : ""}
        </p>
      )}
      {msg && (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          {msg}
        </p>
      )}
      {err && (
        <p className="error" style={{ margin: "4px 0 0" }}>
          {err}
        </p>
      )}
    </div>
  );
}