export function membershipActive(user) {
  // Seul le vendeur est soumis à l'adhésion ; les autres accèdent directement.
  if (!user || user.role !== "seller" || user.admin_approved) return true;
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
