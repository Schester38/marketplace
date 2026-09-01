// Helpers de paiements Mboppi.
// Historique : ce fichier contenait le moteur de reversement automatique iKeePay
// (providerPayout, markSalePaid, payoutPlatformShare…), supprimé avec la
// dépendance iKeePay. Ne restent que les utilitaires utilisés par le paiement
// manuel et la comptabilité :
//  — normalizeWalletPrimary : gestion du moyen de paiement principal des
//    espaces boutique / vendeur / créateur / livreur (paiement manuel) ;
//  — computeRedistribution : répartition comptable d'une vente
//    (boutique / vendeur / parrain / livreur), utilisée par les tests.

/**
 * Normalise une liste de moyens de paiement : garantit qu'AU PLUS UN wallet est
 * marqué `primary`. Si aucun n'est marqué, le premier wallet valide devient le
 * principal par défaut. Nettoie aussi les champs (name/value trimmés, primary
 * booléen). Rétrocompat : les anciens {name,value} sans primary restent valides.
 */
export function normalizeWalletPrimary(list) {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((w) => ({
      name: String(w?.name || "").trim(),
      value: String(w?.value || "").trim(),
      primary: w?.primary === true,
    }))
    .filter((w) => w.name && w.value);
  const anyPrimary = cleaned.some((w) => w.primary);
  if (!anyPrimary && cleaned.length > 0) {
    cleaned[0].primary = true;
  }
  // Au plus un primary : garder uniquement le premier marqué.
  let seen = false;
  return cleaned.map((w) => {
    if (w.primary && seen) return { ...w, primary: false };
    if (w.primary) seen = true;
    return w;
  });
}


export const REFERRAL_CLAIM_THRESHOLD = 5000;

export function referralThresholdReached(amount) {
  return Number(amount || 0) >= REFERRAL_CLAIM_THRESHOLD;
}

export function computeRedistribution(sale) {
  const totalPrice = Number(sale.total_price || 0);
  const commission = Number(sale.commission || 0);
  const referralCommission = Number(sale.referral_commission || 0);
  const deliveryFee = Number(sale.delivery_fee || 0);

  const shopAmount = Math.round((totalPrice - commission - referralCommission) * 100) / 100;
  const sellerAmount = commission;
  const referrerAmount = referralCommission;
  const livreurAmount = deliveryFee;

  return { totalPrice, shopAmount, sellerAmount, referrerAmount, livreurAmount };
}

// Compatibilité historique : les routes conservées peuvent encore appeler ce
// helper pendant la transition vers le paiement manuel exclusif. Le reversement
// automatique n'existe plus depuis la suppression d'iKeePay, donc on laisse un
// no-op explicite au lieu d'échouer au démarrage.
export async function paySaleAutomatically(saleId) {
  return {
    saleId,
    status: "manual_only",
    paid: false,
  };
}

// Note : la répartition ci-dessus est purement comptable (tests + affichage).
// Le paiement des commissions est manuel :
//   — vendeur payé par la boutique via POST /api/sales/:id/pay (preuve obligatoire) ;
//   — parrain payé via POST /api/sales/:id/pay-referral ;
//   — frais de livraison encaissés par le livreur en espèces/mobile.
