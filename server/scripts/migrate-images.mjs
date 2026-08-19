// Migration des images base64 (stockées en base) vers Supabase Storage.
// Utilise le même code que l'endpoint /api/admin/migrate-images.
// Exécution : node server/scripts/migrate-images.mjs
// Variables requises : DATABASE_URL (ou DIRECT_URL), SUPABASE_URL,
//                      SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET.
import { migrateImages } from '../migrate-images.js';

console.log('→ Migration des images vers Supabase Storage…');
const summary = await migrateImages();
console.log(`Terminé : ${summary.uploaded} fichier(s) uploadé(s), ` +
  `${summary.productsUpdated} produit(s), ${summary.offersUpdated} offre(s), ` +
  `${summary.ordersUpdated} commande(s) migrée(s).`);
process.exit(0);