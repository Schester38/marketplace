import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { GoogleIcon } from "../components/icons.jsx";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";

function googleLivreurUrl() {
  const p = new URLSearchParams({ role: "livreur", country: "", accepted: "1" });
  return `/api/auth/google?${p.toString()}`;
}

/**
 * Portail « Espace livreur » — il est OBLIGATOIRE de passer par le compte
 * d'un livreur pour finaliser une commande Mboppi (le livreur enregistre la
 * livraison : code de confirmation client, signature, paiement). Cette page :
 *  - redirige un livreur déjà connecté vers son espace ;
 *  - propose à une boutique de créer son espace livreur associé (même email) ;
 *  - demande à toute autre personne de se connecter/créer un compte livreur.
 */
export default function LivreurInscription() {
  const { user } = useAuth();
  const { t } = useLang();

  if (user && user.role === "livreur") {
    return <Navigate to="/livreur" replace />;
  }

  const isShop = user && user.role === "shop";
  const isConnectedOther = user && !isShop;

  return (
    <main className="container narrow">
      <Seo title={t("Espace livreur") + " — Mboppi"} noindex />
      <div className="card form-card" style={{ padding: 20 }}>
        {/* Bandeau d'obligation : message frappant demandé. */}
        <div
          style={{
            background: "#fff3cd",
            border: "2px solid #f0b429",
            borderRadius: 12,
            padding: "16px 18px",
            marginBottom: 18,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 6 }}>🛵</div>
          <strong
            style={{
              display: "block",
              fontSize: 20,
              lineHeight: 1.35,
              color: "#7a5c00",
              textTransform: "uppercase",
            }}
          >
            {t(
              "AFIN DE FINALISER VOTRE COMMANDE, VEILLEZ VOUS CONNECTER À VOTRE COMPTE LIVREUR."
            )}
          </strong>
          <p className="hint" style={{ color: "#7a5c00", margin: "8px 0 0" }}>
            {t(
              "Les livraisons Mboppi passent obligatoirement par l'espace d'un livreur : c'est lui qui enregistre votre commande, vous fait saisir votre code de confirmation, signer et valider le paiement en toute sécurité."
            )}
          </p>
        </div>

        {/* Boutique connectée : création de l'espace livreur associé (même email). */}
        {isShop && (
          <div
            style={{
              background: "var(--soft)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <Logo className="logo-inline" />
            <h2 style={{ margin: "6px 0 6px", fontSize: 17 }}>
              {t("Votre compte boutique est connecté")}
            </h2>
            <p className="hint" style={{ marginTop: 0 }}>
              {t(
                "Créez votre espace livreur associé — même email, aucune information à ressaisir. Vous pourrez ainsi finaliser vous-même les livraisons de vos commandes."
              )}
            </p>
            <div className="row2" style={{ flexWrap: "wrap", gap: 8 }}>
              <a
                className="btn btn-primary"
                href={googleLivreurUrl()}
                rel="noopener noreferrer"
              >
                <GoogleIcon /> {t("Créer mon espace livreur avec Google")}
              </a>
              <Link
                className="btn btn-outline"
                to={`/login?force=livreur`}
              >
                🔐 {t("J'ai déjà un compte livreur — me connecter")}
              </Link>
              <Link
                className="btn btn-outline"
                to={`/register?role=livreur&email=${encodeURIComponent(user.email || "")}`}
              >
                🔑 {t("Créer mon espace livreur (email + mot de passe)")}
              </Link>
            </div>
          </div>
        )}

        {/* Autre rôle connecté : pas de partage d'email sauf boutique → livreur. */}
        {isConnectedOther && (
          <div style={{ marginBottom: 16 }}>
            <p className="hint">
              {t(
                "Le partage d'email n'est autorisé qu'entre un compte boutique et un compte livreur. Vous pouvez créer un compte livreur avec une autre adresse email."
              )}
            </p>
            <Link className="btn btn-primary" to="/register?role=livreur">
              🛵 {t("Créer un compte livreur")}
            </Link>
          </div>
        )}

        {/* Non connecté : connexion ou inscription forcée en tant que livreur. */}
        {!user && (
          <div className="row2" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <Link className="btn btn-primary btn-block" to="/login?force=livreur">
              🔐 {t("Se connecter comme livreur")}
            </Link>
            <Link className="btn btn-outline btn-block" to="/register?role=livreur">
              🛵 {t("Créer un compte livreur")}
            </Link>
            <a
              className="btn btn-google btn-block"
              href={googleLivreurUrl()}
              rel="noopener noreferrer"
            >
              <GoogleIcon /> {t("Se connecter / créer avec Google (livreur)")}
            </a>
          </div>
        )}

        <p className="hint" style={{ textAlign: "center", marginTop: 18, marginBottom: 0 }}>
          {t("Une question ?")}{" "}
          <Link to="/contact">{t("Contactez-nous")}</Link>
        </p>
      </div>
    </main>
  );
}