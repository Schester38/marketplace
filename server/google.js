const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export function googleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function callbackUrl(req) {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${req.protocol}://${req.get('host')}/api/auth/google/callback`
  );
}

export function googleAuthUrl(role, country, ref, ref_seller, accepted, req) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(req),
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: `${role || 'seller'}|${country || ''}|${ref || ''}|${accepted === '1' ? '1' : ''}|${ref_seller || ''}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function getGoogleProfile(code, req) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(req),
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    if (tokenData.error === 'invalid_grant') {
      throw new Error('Connexion Google : la demande a expiré ou a déjà été utilisée. Réessayez.');
    }
    if (tokenData.error === 'invalid_client') {
      throw new Error('Connexion Google : configuration invalide (secret client).');
    }
    throw new Error(tokenData.error_description || 'Échec de la connexion Google');
  }
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profileRes.ok || !profile.email) {
    throw new Error('Impossible de récupérer le profil Google');
  }
  const email = String(profile.email).trim().toLowerCase();
  return {
    name: profile.name || profile.given_name || email.split('@')[0],
    email,
  };
}
