import { useState } from 'react';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

const FAQ_ITEMS = [
  { q: 'Comment créer un compte ?', a: 'Créez un compte gratuitement en moins d\'une minute : choisissez votre rôle (boutique, vendeur, client, livreur ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.' },
  { q: 'Comment commander ?', a: 'Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.' },
  { q: 'Comment payer ?', a: 'Aucune carte bancaire n\'est nécessaire. Vous pouvez payer à la livraison (espèces ou mobile money) ou en ligne par mobile money via notre prestataire iKeePay (Orange Money, MTN Mobile Money, etc.). Mboppi reverse ensuite automatiquement le bon montant à la boutique, au vendeur, au parrain et au livreur.' },
  { q: 'Comment devenir vendeur ?', a: 'Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.' },
  { q: 'Comment est calculée ma commission ?', a: 'La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique. Votre commission est reversée automatiquement sur le numéro de mobile money enregistré dans votre espace.' },
  { q: 'Comment recevoir mes gains ?', a: 'Enregistrez votre numéro de mobile money dans votre espace, page « Paiements » (boutique, vendeur ou livreur). Après chaque paiement confirmé, Mboppi reverse automatiquement votre part : le prix pour la boutique, la commission pour le vendeur, 2% pour le parrain et les frais pour le livreur.' },
  { q: 'Comment suivre ma commande ?', a: 'Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l\'état en temps réel : enregistrée, confirmée ou livrée.' },
  { q: 'Comment contacter le support ?', a: 'Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.' },
  { q: 'Comment soutenir Mboppi ?', a: 'Rendez-vous sur la page « Soutenir Mboppi ». Les dons par Orange Money et MTN Mobile Money sont traités automatiquement en ligne ; les dons par PayPal ou par virement UBA se font manuellement.' },
  { q: 'Puis-je supprimer mon compte ?', a: 'Oui, depuis votre espace « Mon compte ». Vos données sont alors supprimées définitivement de notre base.' },
];

export default function Faq() {
  const { t } = useLang();
  const [open, setOpen] = useState(0);
  return (
    <main className="container">
      <Seo title={t('FAQ') + ' — Mboppi'} description={t('Questions fréquentes')} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">❓ {t('FAQ')}</span>
        <h1>{t('Questions fréquentes')}</h1>
        <p>{t('Tout ce que vous devez savoir sur Mboppi.')}</p>
      </section>
      <section className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div className="card faq-item" key={i}>
            <button type="button" className="faq-question" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span>{i + 1}. {t(item.q)}</span>
              <span className="faq-arrow">{open === i ? '▴' : '▾'}</span>
            </button>
            {open === i && <p className="faq-answer">{t(item.a)}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}