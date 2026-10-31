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
    if (user && (user.role === "seller" || user.role === "shop" || user.role === "creator")) {
      setOpen(false);
      return;
    }
    let first = setTimeout(() => setOpen(true), 5000);
    let interval = setInterval(() => {
      setOpen(true);
    }, 120000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [user, location.pathname]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.78)",
          padding: "16px",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "300px",
            animation: "promoFloat 2.5s ease-in-out infinite",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("Fermer")}
            style={{
              position: "absolute",
              top: "-14px",
              right: "-14px",
              zIndex: 2,
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "none",
              background: "#ffffff",
              color: "#334155",
              fontSize: "18px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            ✕
          </button>
          <Link to="/register?role=seller" onClick={() => setOpen(false)} style={{ display: "block", textDecoration: "none" }}>
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "18px",
                boxShadow: "0 0 40px rgba(251,191,36,0.7), 0 20px 60px rgba(0,0,0,0.5)",
                animation: "promoGlow 2s ease-in-out infinite",
              }}
            >
              <img
                src="/affiche-vendeur.webp"
                alt={t("Devenez vendeur sur MboppiShop")}
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  maxHeight: "55vh",
                  objectFit: "contain",
                }}
                loading="eager"
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent 60%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "14px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#fbbf24",
                  color: "#1e293b",
                  padding: "8px 20px",
                  borderRadius: "999px",
                  fontWeight: "800",
                  fontSize: "13px",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
                  animation: "pulse 1.6s ease-in-out infinite",
                  whiteSpace: "nowrap",
                }}
              >
                {t("Devenir vendeur")} →
              </div>
            </div>
          </Link>
        </div>
      </div>
      <style>{`
        @keyframes promoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes promoGlow { 0%,100% { box-shadow: 0 0 24px rgba(251,191,36,0.5), 0 20px 60px rgba(0,0,0,0.5); } 50% { box-shadow: 0 0 50px rgba(251,191,36,0.9), 0 20px 60px rgba(0,0,0,0.5); } }
        @keyframes pulse { 0%,100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.08); } }
      `}</style>
    </>
  );
}
