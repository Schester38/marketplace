import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function MboppiBoostTerms() {
  const { t } = useLang();
  return (
    <main className="boost-page">
      <Seo
        title={t("Conditions d'utilisation — MboppiBoost")}
        description={t("Conditions générales d'utilisation du service MboppiBoost.")}
      />
      <div className="boost-shell">
        <section className="boost-hero boost-fade-up">
          <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
          <div className="boost-hero-inner">
            <div className="tw-min-w-0">
              <span className="boost-eyebrow">📜 {t("Conditions d'utilisation")}</span>
              <h1 className="boost-title">{t("Conditions d'utilisation — MboppiBoost")}</h1>
              <p className="boost-lead">
                {t("Dernière mise à jour :")} {t("10 août 2025")}
              </p>
            </div>
          </div>
        </section>

        <section className="boost-card boost-card-pad tw-mt-6 tw-space-y-4">
          <h2 className="boost-section-title">{t("1. Informations générales")}</h2>
          <p className="boost-hint">
            {t(
              "En passant une commande sur MboppiBoost, vous acceptez automatiquement les conditions ci-dessous, que vous les ayez lues ou non. Nous nous réservons le droit de modifier ces conditions sans préavis. Nous vous recommandons de consulter cette section régulièrement pour rester informé des règles en vigueur."
            )}
          </p>
          <p className="boost-hint">
            {t(
              "Vous vous engagez à utiliser MboppiBoost conformément aux conditions d'utilisation des plateformes sociales pour lesquelles les services sont commandés (YouTube, Instagram, TikTok, Telegram, etc.). Nous ne sommes pas responsables des conséquences liées au non-respect des règles de ces plateformes."
            )}
          </p>
          <p className="boost-hint">
            {t(
              "Les prix des services sont susceptibles de changer sans préavis. Les tarifs actuels sont toujours disponibles sur le site. Nous visons à respecter les délais de livraison indiqués ; toutefois, des retards peuvent survenir en raison de la charge du système, des mises à jour des plateformes ou d'autres problèmes techniques. Dans ce cas, nous ferons tout notre possible pour compléter la commande le plus rapidement possible."
            )}
          </p>

          <h2 className="boost-section-title tw-mt-6">{t("2. Exonération de responsabilité")}</h2>
          <p className="boost-hint">
            {t(
              "MboppiBoost n'est pas responsable des pertes encourues du fait de l'utilisation de nos services. Nous ne garantissons pas la protection contre les suspensions de compte, la suppression de contenu ou d'autres sanctions imposées par les plateformes sociales. Le client est seul responsable du respect de leurs règles. Nous n'avons aucun contrôle sur les changements d'algorithme ou les défaillances techniques des plateformes sociales susceptibles d'affecter l'exécution des services commandés."
            )}
          </p>

          <h2 className="boost-section-title tw-mt-6">{t("3. Engagements")}</h2>
          <p className="boost-hint">
            {t(
              "En cas de retard ou de difficulté technique, nous nous efforçons de compléter la commande. Si un service n'est pas livré dans le délai prévu, vous pouvez contacter le support et nous évaluerons la possibilité d'une compensation. Les remboursements sont régis par notre politique de remboursement. La confidentialité est régie par notre politique de confidentialité."
            )}
          </p>

          <h2 className="boost-section-title tw-mt-6">{t("4. Services")}</h2>
          <p className="boost-hint">
            {t(
              "MboppiBoost propose des services promotionnels pour diverses plateformes sociales, notamment Telegram, YouTube, Instagram, TikTok et d'autres, afin d'augmenter la visibilité et l'engagement du contenu."
            )}
          </p>
          <p className="boost-hint">
            {t(
              "Il est interdit d'utiliser MboppiBoost pour publier ou promouvoir du contenu qui viole les règles des plateformes sociales (contenu explicite, biens interdits, matériaux liés à la violence, etc.)."
            )}
          </p>
          <p className="boost-hint">
            {t(
              "Nous ne garantissons pas que 100 % des comptes engagés via nos services disposent d'une photo de profil, d'une description complète ou de contenu publié, bien que nous nous efforcions de maintenir la plus haute qualité possible."
            )}
          </p>

          <h2 className="boost-section-title tw-mt-6">{t("5. Remboursements et annulations")}</h2>
          <p className="boost-hint">
            {t(
              "Les commandes payées et transmises au fournisseur ne peuvent plus être annulées. En cas de non-livraison dans le délai prévu, contactez le support pour évaluation d'une compensation. Les remboursements, lorsqu'ils sont accordés, sont crédités sur votre portefeuille MboppiBoost."
            )}
          </p>

          <h2 className="boost-section-title tw-mt-6">{t("6. Contact")}</h2>
          <p className="boost-hint">
            {t(
              "Pour toute question relative à ces conditions, contactez-nous via la page Contact ou par WhatsApp."
            )}
          </p>
          <div className="tw-mt-4 tw-flex tw-gap-3 tw-flex-wrap">
            <Link to="/contact" className="boost-btn boost-btn-secondary">
              {t("Contact")}
            </Link>
            <Link to="/mboppi-boost" className="boost-btn boost-btn-ghost">
              {t("Retour à MboppiBoost")}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
