import React from "react";
import Seo from "../components/Seo.jsx";
// import SocialProof from "../components/SocialProof.jsx"; // réactiver avec la section (voir plus bas)
import SellContent from "../components/SellContent.jsx";

/**
 * Page d'atterrissage de recrutement VENDEURS indépendants uniquement :
 * explique la valeur de Mboppi pour eux (0 % de frais, code vendeur,
 * parrainages, livraison suivie) et redirige vers /register?role=seller.
 * Contenu mutualisé dans SellContent (aussi utilisé par la page d'adhésion).
 */
export default function SellLanding() {
  return (
    <main className="container sell-landing">
      <Seo
        title={`${"Vendez partout où vous voulez, gardez 100 % de vos ventes."} — Mboppi`}
        description="0 % de frais de service. Générez votre code vendeur, partagez les liens à vos contacts et encaissez vos commissions sur chaque vente — par téléphone ou WhatsApp."
      />
      <SellContent />

      {/* Preuve sociale désactivée : compteurs trop faibles pour convaincre.
          Réactiver avec la page d'accueil quand les chiffres auront grandi :
      <SocialProof />
      */}
    </main>
  );
}
