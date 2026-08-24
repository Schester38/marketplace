export function membershipActive(user) {
  if (!user || !["shop", "seller"].includes(user.role) || user.verified) return true;
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
