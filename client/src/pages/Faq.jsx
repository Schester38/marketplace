import { useState } from "react";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

const FAQ_ITEMS = [
  {
    q: "Comment créer un compte ?",
    a: "Créez un compte gratuitement en moins d'une minute : choisissez votre rôle (boutique, vendeur, client, livreur ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.",
  },
  {
    q: "Comment commander ?",
    a: "Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.",
  },
  {
    q: "Comment payer ?",
    a: "Aucune carte bancaire n'est nécessaire. Le paiement se fait directement avec le bénéficiaire : en espèces à la livraison, par virement Mobile Money direct. Mboppi ne collecte pas les paiements et ne prélève aucun frais de plateforme.",
  },
  {
    q: "Comment devenir vendeur ?",
    a: "Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.",
  },
  {
    q: "Comment est calculée ma commission ?",
    a: "La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique. La commission est payée manuellement par la boutique après livraison, avec une preuve enregistrée sur la vente. Enregistrez vos coordonnées de réception dans votre espace « Paiements ».",
  },
  {
    q: "Comment recevoir mes gains ?",
    a: "Enregistrez vos coordonnées de réception dans votre espace « Paiements ». Les paiements des commissions sont réalisés manuellement par la boutique, avec une preuve enregistrée sur la vente. Mboppi ne prélève aucun frais de plateforme.",
  },
  {
    q: "Comment suivre ma commande ?",
    a: "Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l'état en temps réel : enregistrée, confirmée ou livrée.",
  },
  {
    q: "Comment contacter le support ?",
    a: "Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.",
  },
  {
    q: "Qu’est-ce qu’une promotion éclair ?",
    a: "Une boutique peut proposer un produit à prix réduit pendant une durée limitée, au maximum 24 heures et une fois par semaine. Le produit est alors retiré des catalogues publics, mais reste accessible par son lien direct. La commission vendeur est de 0 % pendant la promotion.",
  },
  {
    q: "Comment fonctionne la livraison ?",
    a: "La boutique remet au livreur un code boutique. Le livreur consulte les commandes associées, saisit les frais convenus et demande le code de confirmation du client au moment de la remise. La livraison est ensuite enregistrée dans la commande.",
  },
  {
    q: "Que se passe-t-il si le produit est en rupture ?",
    a: "Le stock est vérifié et réservé au moment de la commande. Si la quantité disponible est insuffisante, la commande est refusée afin d’éviter de vendre un article indisponible.",
  },
  {
    q: "Comment fonctionne le parrainage ?",
    a: "Lorsqu’un client s’inscrit avec le code vendeur d’un vendeur, il devient son client affilié. Les achats futurs de ce client génèrent 2 % pour le vendeur référent, sous réserve que la vente soit livrée. Le cumul est réclamé par le vendeur et payé manuellement par la boutique, avec un seuil de 5 000 XAF.",
  },
  {
    q: "Puis-je commander sans compte ?",
    a: "Oui pour un achat direct. Vous devez fournir votre nom, téléphone, ville et adresse, puis conserver le code de confirmation reçu. Un compte est nécessaire pour retrouver automatiquement l’historique de ses achats.",
  },
  {
    q: "Comment modifier ou annuler une commande ?",
    a: "Une commande peut être annulée depuis le suivi ou l’espace client tant qu’elle n’est pas livrée. Après livraison, contactez la boutique ou le vendeur pour toute question de retour ou de garantie.",
  },
  {
    q: "Les produits sont-ils vérifiés par Mboppi ?",
    a: "Les boutiques et créateurs restent responsables de leurs produits, photos, prix et descriptions. Mboppi peut retirer un contenu contraire aux règles et vérifier certains comptes, mais ne remplace pas la boutique dans la relation commerciale.",
  },
  {
    q: "Quels moyens de paiement sont acceptés ?",
    a: "Les paiements sont directs et manuels : espèces à la livraison, transfert Mobile Money direct ou virement bancaire, selon ce qui est convenu avec le bénéficiaire. Mboppi ne demande jamais de carte bancaire et ne collecte pas les paiements.",
  },
  {
    q: "Comment contacter un livreur ?",
    a: "Une boutique peut rechercher des livreurs disponibles par ville et quartier depuis son espace, puis les contacter directement avec les coordonnées affichées.",
  },
  {
    q: "Comment supprimer mes données ?",
    a: "Vous pouvez retirer vos produits et offres depuis votre espace. Pour supprimer votre compte et demander le traitement de vos données, contactez Mboppi depuis la page Contact.",
  },
  {
    q: "Puis-je supprimer mon compte ?",
    a: "Oui, depuis votre espace « Mon compte ». Vos données sont alors supprimées définitivement de notre base.",
  },
];

export default function Faq() {
  const { t } = useLang();
  const [open, setOpen] = useState(0);
  return (
    <main className="container">
      <Seo title={t("FAQ") + " — Mboppi"} description={t("Questions fréquentes")} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">❓ {t("FAQ")}</span>
        <h1>{t("Questions fréquentes")}</h1>
        <p>{t("Tout ce que vous devez savoir sur Mboppi.")}</p>
      </section>
      <section className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div className="card faq-item" key={i}>
            <button
              type="button"
              className="faq-question"
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
            >
              <span>
                {i + 1}. {t(item.q)}
              </span>
              <span className="faq-arrow">{open === i ? "▴" : "▾"}</span>
            </button>
            {open === i && <p className="faq-answer">{t(item.a)}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
