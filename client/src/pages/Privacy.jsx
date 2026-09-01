import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Privacy() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo
        title={t("Données & confidentialité") + " — Mboppi"}
        description={t("Quelles données collectons-nous ?")}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">🔒 {t("Données personnelles")}</span>
        <h1>{t("Comment vos données sont conservées")}</h1>
        <p>
          {t(
            "La transparence est importante pour nous. Voici comment Mboppi collecte, stocke et protège vos données."
          )}
        </p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t("📦 Quelles données sont collectées ?")}</h2>
          <p>
            {t(
              "Lors de votre inscription, nous collectons votre nom, e-mail, rôle, pays et, selon les cas, téléphone, ville et quartier. Les commandes ajoutent les informations nécessaires à la livraison. Les boutiques, vendeurs et créateurs fournissent aussi les données de leurs produits, offres, photos et coordonnées professionnelles."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("🔐 Comment sont-elles stockées ?")}</h2>
          <p>
            {t(
              "Les données sont stockées dans PostgreSQL, avec des contrôles d’accès côté serveur. Les mots de passe sont hachés avec bcrypt et ne sont jamais lisibles. Les sessions utilisent des jetons temporaires et les échanges avec le site sont protégés par HTTPS."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("⏳ Combien de temps sont-elles conservées ?")}</h2>
          <p>
            {t(
              "Les données de compte sont conservées pendant la durée d’utilisation du compte et aussi longtemps que nécessaire pour l’historique des commandes, la sécurité et les obligations applicables. Les produits, offres et photos retirés sont supprimés lorsque le traitement le permet. Les données ne sont ni vendues ni utilisées pour de la publicité ciblée."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("👀 Qui peut les voir ?")}</h2>
          <p>
            {t(
              "Seule la personne concernée accède à son espace : une boutique voit ses produits, un vendeur ses ventes et commissions. Les montants de vos paiements et versements ne sont visibles que dans votre espace. Les offres de la vitrine sont publiquement visibles par les visiteurs, mais sans vos informations de compte."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("🔒 Paiements directs")}</h2>
          <p>
            {t(
              "Mboppi ne demande jamais de numéro de carte bancaire. Les paiements sont réalisés directement entre les parties par espèces, Mobile Money ou virement bancaire. Les moyens de paiement enregistrés par les bénéficiaires servent uniquement à recevoir les règlements manuels. Mboppi ne collecte pas les paiements et ne prélève aucun frais de plateforme."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("📊 Mesures d’audience")}</h2>
          <p>
            {t(
              "Mboppi mesure les visites de pages et les consultations de produits ou d’offres afin de comprendre l’utilisation du site et d’améliorer le service. Un identifiant technique peut être conservé dans votre navigateur ; il ne constitue pas un profil public et n’est pas vendu."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("🍪 Cookies et stockage local")}</h2>
          <p>
            {t(
              "Le site utilise le stockage local du navigateur pour conserver votre session, votre panier, vos favoris, vos préférences de langue et certains choix d’affichage. Vous pouvez effacer ces données dans les réglages de votre navigateur ; cela peut supprimer votre panier ou vous déconnecter."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("🤝 Qui traite les données ?")}</h2>
          <p>
            {t(
              "L’application est hébergée par Vercel, tandis que PostgreSQL et le stockage des photos peuvent être fournis par Supabase. Des services optionnels peuvent intervenir pour l’e-mail, les notifications push, la supervision des erreurs ou l’assistance conversationnelle, uniquement pour faire fonctionner les fonctionnalités correspondantes."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("✉️ Vos droits")}</h2>
          <p>
            {t(
              "Vous pouvez demander l’accès, la correction ou la suppression de vos données, ainsi que des précisions sur leur utilisation. Écrivez-nous depuis la page Contact en indiquant l’adresse e-mail associée à votre compte afin que nous puissions vérifier votre demande."
            )}
          </p>
        </div>

        <div className="card">
          <h2>{t("🗑️ Supprimer vos données")}</h2>
          <p>
            {t("Vous pouvez retirer vos offres et produits à tout moment depuis votre espace.")}{" "}
            {t("Pour supprimer votre compte, contactez-nous via la page")}{" "}
            <Link to="/contact" className="privacy-link">
              {t("Contact")}
            </Link>{" "}
            {t("et nous le supprimerons rapidement.")}
          </p>
        </div>
      </section>
    </main>
  );
}
