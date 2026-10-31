import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";

export default function SellerPromoPopup() {
  const { user } = useAuth();
  const { t } = useLang();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Ne pas afficher pour un utilisateur qui a déjà un compte vendeur.
    if (user && (user.role === "seller" || user.role === "shop" || user.role === "creator")) {
      return;
    }
    // Une fois par session navigateur.
    try {
      if (sessionStorage.getItem("mboppi_seller_promo_seen")) return;
    } catch {}
    const timer = setTimeout(() => {
      setOpen(true);
      try { sessionStorage.setItem("mboppi_seller_promo_seen", "1"); } catch {}
    }, 1800);
    return () => clearTimeout(timer);
  }, [user]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => setOpen(false)}
    >
<div
        className="relative mx-auto w-full max-w-[92vw] sm:max-w-md animate-[promoFloat_3s_ease-in-out_infinite]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:bg-slate-100"
          aria-label={t("Fermer")}
        >
          ✕
        </button>
        <Link to="/register?role=seller" onClick={() => setOpen(false)} className="block">
          <div className="relative overflow-hidden rounded-3xl shadow-2xl ring-4 ring-amber-400/60 animate-[promoGlow_2s_ease-in-out_infinite]">
<img
              src="/affiche-vendeur.webp"
              alt={t("Devenez vendeur sur MboppiShop")}
              className="block w-full h-auto max-h-[70vh] object-contain"
              loading="eager"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <span
                  key={i}
                  className="absolute h-2 w-2 rounded-full bg-amber-300 animate-[sparkle_3s_linear_infinite]"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    top: `${(i * 53) % 100}%`,
                    animationDelay: `${i * 0.25}s`,
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-6 py-2 text-sm font-extrabold text-slate-900 shadow-lg animate-[pulse_1.6s_ease-in-out_infinite]">
              {t("Devenir vendeur")} →
            </div>
          </div>
        </Link>
      </div>
      <style>{`
        @keyframes promoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes promoGlow { 0%,100% { box-shadow: 0 0 20px rgba(251,191,36,0.4); } 50% { box-shadow: 0 0 40px rgba(251,191,36,0.8); } }
        @keyframes sparkle { 0% { transform: scale(0) translateY(0); opacity:0; } 50% { transform: scale(1) translateY(-20px); opacity:1; } 100% { transform: scale(0) translateY(-40px); opacity:0; } }
      `}</style>
    </div>
  );
}
