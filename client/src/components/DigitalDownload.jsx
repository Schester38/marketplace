import React, { useState } from "react";
import { api } from "../api.js";
import { formatBytes } from "../imageKit.js";
import { useLang } from "../i18n.jsx";
import ProtectedVideo from "./ProtectedVideo.jsx";
import {
  isPdfFile,
  stampPdf,
  authenticityCertificate,
  saveBlob,
  downloadMeta,
} from "../digitalStamp.js";

/**
 * Téléchargement d'un produit DIGITAL.
 *
 * Le serveur délivre une URL SIGNÉE (bucket privé Supabase, 10 minutes) : le
 * fichier part alors DIRECTEMENT sur l'appareil de l'acheteur, sans transiter
 * par notre API (donc sans la limite de 4,5 Mo des fonctions Vercel).
 * Pour un achat effectué sans compte, le code de confirmation de la commande
 * (prop `code`) fait office de preuve d'achat.
 *
 * SIGNATURE MBOPPI (anti-contrefaçon) : le PDF est tamponné dans le navigateur
 * avant l'enregistrement (pied de page + bloc d'authenticité) ; pour les
 * autres formats, un certificat d'authenticité Mboppi (PDF) accompagne le
 * fichier. Repli automatique sur le lien direct si le tampon échoue.
 */
export default function DigitalDownload({ sale, code, compact = false, label }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [canCert, setCanCert] = useState(false);
  const metaRef = React.useRef(null);

  const start = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const d = await api.digitalDownload(sale.id, code);
      const meta = downloadMeta(sale, code);
      metaRef.current = meta;
      let stamped = false;
      if (isPdfFile(d.file_name, d.mime)) {
        try {
          setMsg(t("Signature Mboppi en cours…"));
          const res = await fetch(d.url, { mode: "cors" });
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const out = await stampPdf(buf, meta);
            saveBlob(
              new Blob([out], { type: "application/pdf" }),
              d.file_name || "document.pdf"
            );
            stamped = true;
          }
        } catch {
          /* repli : lien direct ci-dessous */
        }
      }
      if (!stamped) {
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
      }
      setCanCert(true);
      const okMsg = stamped
        ? t("Téléchargement lancé — signature Mboppi appliquée.")
        : t("Téléchargement lancé.");
      setMsg(
        d.remaining > 0
          ? `${okMsg} ${t("({n} restant(s)).", { n: d.remaining })}`
          : okMsg
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadCert = async () => {
    if (!metaRef.current) return;
    try {
      const blob = await authenticityCertificate(metaRef.current);
      saveBlob(blob, `certificat-mboppi-vente-${metaRef.current.saleId}.pdf`);
    } catch {
      setErr(t("Certificat indisponible pour le moment."));
    }
  };

  if (!sale?.is_digital) return null;
  // Vidéo PROTÉGÉE (YouTube non répertoriée) : lecture après validation
  // serveur — pas de fichier à télécharger (composant dédié).
  if (sale.digital_kind === "youtube") {
    return <ProtectedVideo sale={sale} code={code} compact={compact} />;
  }

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
      {canCert && (
        <button
          type="button"
          className="btn btn-outline btn-small"
          style={{ marginLeft: 8 }}
          onClick={downloadCert}
        >
          📄 {t("Certificat Mboppi")}
        </button>
      )}
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