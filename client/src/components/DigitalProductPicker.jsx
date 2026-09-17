import React, { useRef, useState } from "react";
import { formatBytes } from "../imageKit.js";
import { useLang } from "../i18n.jsx";

/**
 * Choix du FICHIER d'un produit digital (PDF, ZIP, EPUB, Office, audio…).
 *
 * Le fichier est envoyé au serveur en data-URI base64 avec le produit ; il est
 * ensuite stocké dans le bucket PRIVÉ Supabase et remis à l'acheteur par URL
 * signée. L'API serverless Vercel plafonne le corps d'une requête à 4,5 Mo et
 * le base64 pèse ≈ 4/3 du fichier : 3 Mo est donc le maximum acceptable
 * aujourd'hui (au-delà, le serveur refuserait la requête).
 */
export const DIGITAL_MAX_BYTES = 3 * 1024 * 1024;

const DIGITAL_ACCEPT =
  ".pdf,.zip,.rar,.7z,.epub,.mobi,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.json,.xml,.mp3,.m4a,.wav,.ogg,.mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.svg";

export default function DigitalProductPicker({ value, existing, onChange, required = false }) {
  const { t } = useLang();
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const inputRef = useRef(null);
  // `required` : la case est cochée et NON décochable (compte créateur, dont
  // chaque publication est un produit digital).
  const enabled = required || Boolean(value?.enabled);

  const readFile = (file) => {
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
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      onChange({
        enabled: true,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        data: String(reader.result || ""),
      });
    };
    reader.onerror = () => {
      setReading(false);
      setError(t("Lecture du fichier impossible."));
    };
    reader.readAsDataURL(file);
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
                disabled={reading}
                onChange={(e) => {
                  readFile(e.target.files && e.target.files[0]);
                  e.target.value = "";
                }}
              />
              {reading ? t("Lecture…") : t("📎 Choisir le fichier")}
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
                  onClick={() => onChange({ enabled: true, name: null, data: null })}
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