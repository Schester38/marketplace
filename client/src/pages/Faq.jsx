import { useState } from 'react';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

const FAQ_ITEMS = [
  { q: 'Comment créer un compte ?', a: 'Créez un compte gratuitement en moins d\'une minute : choisissez votre rôle (boutique, vendeur, client ou créateur), renseignez votre nom et votre e-mail. Vous pouvez aussi vous connecter avec Google.' },
  { q: 'Comment commander ?', a: 'Ajoutez un produit à votre panier puis validez la commande avec vos coordonnées. Vous recevez un code client pour suivre votre commande sur la page de suivi. Vous pouvez aussi contacter directement la boutique sur WhatsApp.' },
  { q: 'Comment payer ?', a: 'Aucune carte bancaire n\'est nécessaire. Le paiement se fait directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Mboppi ne demande jamais de paiement en ligne.' },
  { q: 'Comment devenir vendeur ?', a: 'Créez un compte avec le rôle « vendeur ». Vous recevrez un code vendeur à partager avec vos clients. Pour chaque vente, vous gagnez la commission affichée sur le produit.' },
  { q: 'Comment est calculée ma commission ?', a: 'La boutique choisit un pourcentage de commission pour chaque produit. Ce pourcentage est affiché sur la fiche produit. Le vendeur reçoit le montant total moins la commission de la boutique.' },
  { q: 'Comment suivre ma commande ?', a: 'Utilisez la page « Suivi de commande » avec votre numéro de commande et votre code client. Vous y voyez l\'état en temps réel : enregistrée, confirmée ou livrée.' },
  { q: 'Comment contacter le support ?', a: 'Utilisez la page Contact ou écrivez-nous sur WhatsApp. Nous répondons généralement en moins de 24 heures.' },
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
