// ─── Page PUBLIQUE de vérification d'authenticité (/verifier/:ref) ──────────
// Destination du QR code imprimé sur chaque document généré. Interroge
// GET /api/generator/verify/<ref> (public, sans authentification) et affiche
// uniquement des informations non sensibles. La vérification prouve l'ORIGINE
// du document ; elle ne rend pas la copie techniquement impossible.

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

export default function VerifyDoc() {
  const { t } = useLang();
  const { ref } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, data: null, error: "" });
    api
      .genVerify(ref)
      .then((d) => alive && setState({ loading: false, data: d, error: "" }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e?.message || "Vérification impossible" }));
    return () => {
      alive = false;
    };
  }, [ref]);

  const d = state.data;
  const ok = d?.verified === true;

  return (
    <div className="page verify-doc">
      <h1 className="section-title">🛡️ {t("Vérifier l'authenticité d'un document")}</h1>
      <p className="hint">
        {t(
          "Chaque document créé avec le Générateur Mboppi porte une référence unique (DOC-2026-XXXXXXXX). Saisissez-la ou scannez le QR code imprimé sur le document."
        )}
      </p>

      <form
        className="verify-form"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.target.elements.ref.value.trim().toUpperCase();
          if (input) window.location.href = `/verifier/${encodeURIComponent(input)}`;
        }}
      >
        <input
          className="input"
          name="ref"
          defaultValue={ref || ""}
          placeholder="DOC-2026-XXXXXXXX"
          maxLength={40}
          aria-label={t("Référence du document")}
        />
        <button type="submit" className="btn btn-primary">
          🔍 {t("Vérifier")}
        </button>
      </form>

      {state.loading && <p className="hint">{t("Vérification en cours…")}</p>}

      {!state.loading && state.error && (
        <div className="verify-result verify-bad" role="alert">
          <strong>❌ {t("Non vérifié")}</strong>
          <p>{state.error}</p>
        </div>
      )}

      {!state.loading && d && !ok && (
        <div className="verify-result verify-bad" role="alert">
          <strong>❌ {t("Non vérifié")}</strong>
          <p>{d.error}</p>
        </div>
      )}

      {!state.loading && d && ok && (
        <div className="verify-result verify-ok">
          <strong>✅ {t("Document authentique")}</strong>
          <p>
            {t("Ce document provient bien du Générateur Mboppi.")}{" "}
            {d.status === "ready" ? t("Il est marqué « prêt » par son auteur.") : t("Il est encore au statut brouillon.")}
          </p>
          <dl className="verify-details">
            <div>
              <dt>{t("Référence")}</dt>
              <dd>
                <code>{d.doc_ref}</code>
              </dd>
            </div>
            <div>
              <dt>{t("Titre")}</dt>
              <dd>{d.title}</dd>
            </div>
            {d.subtitle ? (
              <div>
                <dt>{t("Sous-titre")}</dt>
                <dd>{d.subtitle}</dd>
              </div>
            ) : null}
            {d.author ? (
              <div>
                <dt>{t("Auteur")}</dt>
                <dd>{d.author}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("Créé le")}</dt>
              <dd>{new Date(d.created_at).toLocaleDateString("fr-FR")}</dd>
            </div>
            {d.hash ? (
              <div>
                <dt>{t("Empreinte (tronquée)")}</dt>
                <dd>
                  <code>{d.hash}…</code>
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="hint">
            {t(
              "L'empreinte SHA-256 permet de comparer le fichier que vous détenez au document enregistré. Ce mécanisme prouve l'origine du document ; il n'empêche pas techniquement une copie."
            )}
          </p>
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <Link to="/" className="btn btn-outline btn-small">
          ← {t("Retour à l'accueil")}
        </Link>
      </p>
    </div>
  );
}
