export const RECAPTCHA_SITE_KEY = ''; // à remplir : clé publique Google (gratuite) — voir https://www.google.com/recaptcha/admin

let scriptPromise = null;

function loadScript() {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(false);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY) return null;
  const ok = await loadScript();
  if (!ok || !window.grecaptcha) return null;
  try {
    return await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
  } catch {
    return null;
  }
}