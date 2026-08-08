import Seo from '../components/Seo.jsx';

export default function Privacy() {
  return (
    <main className="container">
      <Seo
        title="Données & confidentialité — Mboppi"
        description="Comment Mboppi conserve et protège vos données : stockage, conservation, accès et suppression."
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">🔒 Données</span>
        <h1>Comment vos données sont conservées</h1>
        <p>
          La transparence est importante pour nous. Voici comment Mboppi collecte,
          stocke et protège vos données.
        </p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>📦 Quelles données sont collectées ?</h2>
          <p>
            Lors de votre inscription : votre <strong>nom</strong>, votre{' '}
            <strong>e-mail</strong> et votre <strong>rôle</strong> (boutique, vendeur,
            client ou créateur). Si vous vous connectez avec Google, seul votre e-mail
            Google est utilisé. Selon votre rôle, vous pouvez publier des{' '}
            <strong>produits</strong>, des <strong>offres</strong> avec photos, et vos{' '}
            <strong>ventes</strong> sont enregistrées dans votre espace.
          </p>
        </div>

        <div className="card">
          <h2>🔐 Comment sont-elles stockées ?</h2>
          <p>
            Toutes les données sont enregistrées dans une <strong>base de données
            PostgreSQL</strong> hébergée et sécurisée. Les mots de passe sont{' '}
            <strong>hachés</strong> (chiffrés de façon irréversible) : personne, même
            l'équipe Mboppi, ne peut lire votre mot de passe. Toutes les connexions
            passent par un <strong>protocole sécurisé (HTTPS)</strong>.
          </p>
        </div>

        <div className="card">
          <h2>⏳ Combien de temps sont-elles conservées ?</h2>
          <p>
            Vos données restent enregistrées <strong>aussi longtemps que votre compte
            existe</strong>. Les offres et produits que vous retirez sont supprimés
            définitivement, avec leurs photos. Aucune donnée n'est vendue ni transmise
            à des tiers.
          </p>
        </div>

        <div className="card">
          <h2>👀 Qui peut les voir ?</h2>
          <p>
            Seule la personne concernée accède à son espace : une boutique voit ses
            produits, un vendeur ses ventes et commissions. Les offres de la vitrine
            sont publiquement visibles par les visiteurs, mais sans vos informations de
            compte.
          </p>
        </div>

        <div className="card">
          <h2>💳 Aucun paiement en ligne</h2>
          <p>
            Mboppi ne demande <strong>jamais</strong> de numéro de carte bancaire.
            Les commandes passent par <strong>téléphone ou WhatsApp</strong>, et le
            paiement se fait directement avec le vendeur.
          </p>
        </div>

        <div className="card">
          <h2>🗑️ Supprimer vos données</h2>
          <p>
            Vous pouvez retirer vos offres et produits à tout moment depuis votre
            espace. Pour supprimer votre compte, contactez-nous via la page{' '}
            <a href="/contact" className="privacy-link">Contact</a> et nous le
            supprimerons rapidement.
          </p>
        </div>
      </section>
    </main>
  );
}
