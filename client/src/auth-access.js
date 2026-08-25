export function membershipActive(user) {
  if (!user || !["shop", "seller", "creator"].includes(user.role) || user.admin_approved)
    return true;
  return Boolean(user.membership_expires_at && new Date(user.membership_expires_at) > new Date());
}
