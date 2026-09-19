// Page CRÉATEUR du Générateur de documents (ebooks, guides, formations…).
// Même module que l'onglet 📚 du panneau admin, mais ouvert aux créateurs :
// la bibliothèque est limitée à LEURS documents (portée serveur par owner_id)
// et la publication crée le produit digital sous LEUR compte (aucun choix de
// vendeur à faire — resolveOwnerId utilise le jeton de connexion).
import GeneratorPanel from "./Generator.jsx";

export default function GeneratorPage() {
  return (
    <div className="page gen-standalone">
      <h1 className="section-title">📚 Générateur de documents</h1>
      <p className="hint">
        Créez un ebook, un guide ou une formation : rédigez ou importez votre texte, choisissez un
        design, exportez en PDF/EPUB — puis publiez-le comme produit digital (prix, commission
        vendeur et catégorie au moment de la publication). Votre compte est reconnu automatiquement.
      </p>
      <GeneratorPanel />
    </div>
  );
}
