import React, { useRef, useState } from "react";
import { formatBytes } from "../imageKit.js";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

/**
 * Choix du FICHIER d'un produit digital (PDF, ZIP, EPUB, Office, audio…).
 *
 * Le fichier est téléversé DIRECTEMENT par le navigateur vers le bucket PRIVÉ
 * Supabase via une URL d'upload signée délivrée par l'API (`/digital/upload-url`)
 * — le fichier ne traverse pas le serveur MboppiShop, ce qui permet d'accepter
 * jusqu'à 20 Mo (le corps d'une requête API Vercel étant plafonné à 4,5 Mo, un
 * envoi en base64 est limité à ~3 Mo ; il reste accepté en secours côté serveur,
 * mais le formulaire n'utilise plus que l'upload direct).
 */
export const DIGITAL_MAX_BYTES = 20 * 1024 * 1024;

const DIGITAL_ACCEPT =
  ".pdf,.zip,.rar,.7z,.epub,.mobi,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.json,.xml,.mp3,.m4a,.wav,.ogg,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.svg";

/** Empreinte SHA-256 hex (déduplication côté Storage) ; repli : valeur aléatoire. */
async function sha256Hex(file) {
  try {
    if (!crypto?.subtle?.digest) throw new Error("no-subtle");
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    const bytes = new Uint8Array(32);
    self.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}

export default function DigitalProductPicker({ value, existing, onChange, required = false }) {
  const { t } = useLang();
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // null = inactif ; 0-100 = téléversement
  const inputRef = useRef(null);
  // `required` : la case est cochée et NON décochable (compte créateur, dont
  // chaque publication est un produit digital).
  const enabled = required || Boolean(value?.enabled);
  const busy = progress !== null;

  const pickFile = async (file) => {
    if (!file) return;
    setError("");
    if (file.size > DIGITAL_MAX_BYTES) {
      setError(
        t("Fichier trop volumineux ({size}) : maximum {max} Mo.", {
          size: formatBytes(file.size),
          max: Math.round(DIGITAL_MAX_BYTES / 1024 / 1024),
        })
      );
      return;
    }
    if (file.size <= 0) {
      setError(t("Fichier illisible ou vide."));
      return;
    }
    setProgress(0);
    try {
      const hash = await sha256Hex(file);
      // URL d'upload signée : un seul chemin d'objet, appartenant au compte.
      const signed = await api.digitalUploadUrl({
        name: file.name,
        size: file.size,
        hash,
      });
      const mime = file.type || "application/octet-stream";
      // Téléversement DIRECT vers Supabase (PUT) avec progression.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.max(1, Math.min(99, Math.round((e.loaded / e.total) * 100))));
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error("network"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.open("PUT", signed.uploadUrl);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", mime);
        xhr.send(file);
      });
      setProgress(null);
      onChange({
        enabled: true,
        name: file.name,
        size: file.size,
        mime,
        key: signed.key,
      });
    } catch (err) {
      setProgress(null);
      setError(
        err.message === "network" || err.message === "aborted"
          ? t("Téléversement interrompu. Vérifiez la connexion puis réessayez.")
          : t("Téléversement impossible : {msg}", { msg: err.message })
      );
    }
  };

  const current = value?.name ? value : existing?.name ? existing : null;

  return (
    <div className="card" style={{ background: "var(--soft)", margin: "12px 0" }}>
      <label className="terms-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={required}
          onChange={(e) =>
            onChange({ ...(value || {}), enabled: e.target.checked })
          }
        />
        <span>
          📁{" "}
          {required
            ? t(
                "Produit digital : joignez le fichier que le client téléchargera (obligatoire pour un compte créateur)"
              )
            : t("Produit digital : un fichier que le client télécharge")}
        </span>
      </label>

      {enabled && (
        <div style={{ marginTop: 10 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {t(
              "PDF, ZIP, EPUB, Word/Excel, audio, vidéo… Maximum {max} Mo. Le client télécharge directement le fichier sur son appareil après confirmation du paiement.",
              { max: Math.round(DIGITAL_MAX_BYTES / 1024 / 1024) }
            )}
          </p>
          <div className="photo-input">
            <label className="photo-picker">
              <input
                ref={inputRef}
                type="file"
                accept={DIGITAL_ACCEPT}
                hidden
                disabled={busy}
                onChange={(e) => {
                  pickFile(e.target.files && e.target.files[0]);
                  e.target.value = "";
                }}
              />
              {busy
                ? `${t("Téléversement…")} ${progress} %`
                : t("📎 Choisir le fichier")}
            </label>
            {current && (
              <div className="photo-thumb">
                <span style={{ fontSize: 26 }}>📄</span>
                <span className="photo-saved" style={{ position: "static" }}>
                  {formatBytes(Number(current.size || 0))}
                </span>
              </div>
            )}
          </div>
          {current && (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              {value?.name ? t("Nouveau fichier :") : t("Fichier actuel :")}{" "}
              <strong>{current.name}</strong>
              {" — "}
              {required ? (
                <span>{t("remplacez-le en choisissant un autre fichier.")}</span>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChange({ enabled: true, name: null, size: 0, key: null })}
                >
                  {t("retirer")}
                </button>
              )}
            </p>
          )}
          {!current && (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              {t("Aucun fichier sélectionné : le produit ne sera pas publiable en digital.")}
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}