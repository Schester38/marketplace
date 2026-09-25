// Page CRÉATEUR du Générateur de documents (ebooks, guides, formations…).
// Même module que l'onglet 📚 du panneau admin, mais ouvert aux créateurs :
// la bibliothèque est limitée à LEURS documents (portée serveur par owner_id)
// et la publication crée le produit digital sous LEUR compte (aucun choix de
// vendeur à faire — resolveOwnerId utilise le jeton de connexion).
import React, { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import GeneratorPanel from "./Generator.jsx";

export default function GeneratorPage() {
  const [params, setSearchParams] = useSearchParams();
  const documentId = Number(params.get("document") || 0);
  const openedDocument = useRef(0);

  // Le paramètre d'ouverture est consommé une seule fois : revenir à la
  // bibliothèque ne rouvre pas automatiquement le document, et un refresh
  // ultérieur avec la même URL permet toujours de le rouvrir.
  useEffect(() => {
    if (documentId > 0 && openedDocument.current !== documentId) {
      openedDocument.current = documentId;
      const next = new URLSearchParams(params);
      next.delete("document");
      setSearchParams(next, { replace: true });
    }
  }, [documentId, params, setSearchParams]);

  return (
    <div className="page gen-standalone">
      <h1 className="section-title">📚 Générateur de documents</h1>
      <p className="hint">
        Créez un ebook, un guide ou une formation : rédigez ou importez votre texte, choisissez un
        design, exportez en PDF/EPUB — puis publiez-le comme produit digital (prix, commission
        vendeur et catégorie au moment de la publication). Votre compte est reconnu automatiquement.
      </p>
      <GeneratorPanel initialDocumentId={documentId > 0 ? documentId : null} />
    </div>
  );
}
