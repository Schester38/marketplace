import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";

/**
 * Bouton de bascule entre les espaces associés au même email.
 * Seule la paire boutique ↔ livreur peut partager un email : ce composant
 * interroge GET /api/auth/spaces ; s'il existe un espace jumeau, il affiche
 * un bouton qui appelle POST /api/auth/switch (nouveau JWT émis pour le
 * compte associé) et navigue directement vers l'autre tableau de bord —
 * sans déconnexion ni re-saisie du mot de passe.
 *
 * Props :
 *  - noneSlot : nœud React affiché quand aucun espace jumeau n'existe
 *               (ex. le lien « Devenir livreur » dans le dashboard boutique).
 */
export default function SwitchSpaceButton({ noneSlot = null }) {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState(null); // { role, name } de l'espace jumeau
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.mySpaces();
        if (!alive) return;
        setOther(d?.spaces?.[0] || null);
      } catch {
        /* silencieux : le bouton ne s'affiche simplement pas */
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!checked) return null;
  if (!other) return noneSlot;

  const goShop = other.role === "shop";
  const switchSpace = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await api.switchAccount();
      if (!d?.token || !d?.user) throw new Error(t("Changement d'espace impossible. Réessayez."));
      login(d.user, d.token);
      navigate(d.user.role === "shop" ? "/shop" : "/livreur");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
      <button
        className="btn btn-outline btn-sm"
        style={{ flexShrink: 0 }}
        onClick={switchSpace}
        disabled={busy}
        title={other.name ? `${t("Ouvrir l'espace de")} ${other.name}` : undefined}
      >
        {busy ? "⏳ …" : goShop ? `🏪 ${t("Retour à la boutique")}` : `🛵 ${t("Espace livreur")}`}
      </button>
      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
    </span>
  );
}
