import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";

// NOTE : le paiement d'adhésion en ligne (iKeePay) a été supprimé. Cette page
// est désormais purement informative : l'accès aux espaces professionnels est
// accordé à l'inscription (admin_approved) et l'administration peut « Ouvrir »
// ou « Fermer » un compte. En cas de blocage, l'utilisateur contacte le support.

export default function MembershipPage() {
  const { user } = useAuth();
  const { t } = useLang();

  return (
    <main className="container narrow">
      <Seo
        title={t("Adhésion Mboppi") + " — Mboppi"}
        description={t("Accédez à votre espace professionnel Mboppi.")}
        noindex
      />
      <div className="card form-card">
        <div className="auth-brand">💳</div>
        <h1>{t("Votre espace professionnel")}</h1>
        <p className="hint">
          {t(
            "L'accès à votre tableau de bord professionnel est accordé dès l'inscription de votre compte. Aucun paiement en ligne n'est demandé."
          )}
        </p>
        <div className="card fee-card" style={{ borderColor: "var(--border)" }}>
          <strong>
            {t(
              user?.role === "shop"
                ? "Espace boutique"
                : user?.role === "creator"
                  ? "Espace créateur"
                  : "Espace vendeur"
            )}
          </strong>
          <p className="hint">
            {t(
              "Si votre accès est fermé, contactez le support : l'équipe Mboppi peut réactiver votre compte après vérification."
            )}
          </p>
        </div>
        <p className="hint">
          {t(
            "Les paiements sur Mboppi sont manuels : espèces à la livraison ou Mobile Money direct entre le client et la boutique. Aucun frais de paiement en ligne ne s'applique."
          )}
        </p>
        <Link to="/contact" className="btn btn-outline btn-block">
          {t("Contacter le support")}
        </Link>
      </div>
    </main>
  );
}
