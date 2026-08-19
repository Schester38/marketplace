import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export const LANGS = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];


// Dictionnaires des autres langues chargés à la demande (code-splitting) :
// import('./i18n/en.js'), import('./i18n/ar.js'), import('./i18n/es.js').
// Le français est la langue par défaut : ses chaînes sont les clés elles-mêmes (aucun dict chargé).

function tr(str, vars, lang, dict) {
  let out = (dict && dict[str]) ?? str;
  if (vars) {
    for (const k of Object.keys(vars)) {
      out = out.split(`{${k}}`).join(String(vars[k]));
    }
  }
  return out;
}

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'fr');
  const [dict, setDict] = useState({});

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'fr') {
      setDict({});
      return;
    }
    let ok = true;
    import(`./i18n/${lang}.js`)
      .then((m) => {
        if (ok) setDict(m.default || m);
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (str, vars) => tr(str, vars, lang, dict),
      locale: lang === 'ar' ? 'ar-MA' : lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR',
    }),
    [lang, dict]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}