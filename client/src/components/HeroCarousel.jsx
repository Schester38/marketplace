import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n.jsx";
import { IconChevronLeft, IconChevronRight } from "./icons.jsx";

const AUTOPLAY_MS = 6000;
const SWIPE_PX = 42;

/**
 * Bandeau carrousel de la page d'accueil : visuels MboppiShop (paiement à la
 * livraison, vendeurs, parrainage 2 %, boutique en ligne).
 * Indicateurs de pagination + flèches + défilement tactile, compatible RTL.
 */
export default function HeroCarousel({ onExplore }) {
  const { t } = useLang();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);
  const timer = useRef(null);

  const slides = [
    {
      id: "welcome",
      cls: "hc-orange",
      kicker: t("BIENVENUE SUR MBOPPI"),
      title: t("Le marché de votre quartier, en ligne"),
      text: t(
        "Commandez dans les boutiques Mboppi et payez à la livraison, en espèces ou par Mobile Money."
      ),
      cta: t("Découvrir les produits"),
      to: "#produits",
      img: "/diapo/MboppiShop_Paiement_a_la_livraison_1x1.webp",
      alt: t("Paiement à la livraison Mboppi"),
    },
    {
      id: "seller",
      cls: "hc-green",
      kicker: t("VENDEURS & BOUTIQUES"),
      title: t("Vendez près de chez vous, sans frais de plateforme"),
      text: t(
        "Publiez vos produits en quelques minutes et recevez vos commandes par téléphone ou WhatsApp."
      ),
      cta: t("Devenir vendeur"),
      to: "/register",
      img: "/diapo/MboppiShop_Developpez_votre_boutique.webp",
      alt: t("Développez votre boutique sur MboppiShop"),
    },
    {
      id: "referral",
      cls: "hc-violet",
      kicker: t("PROGRAMME DE PARRAINAGE"),
      title: t("Gagnez 2 % sur chaque achat de vos clients affiliés"),
      text: t(
        "Partagez votre code vendeur : vos clients achètent, vous touchez 2 % automatiquement."
      ),
      cta: t("Créer mon compte gratuit"),
      to: "/register",
      img: "/diapo/MboppiShop_Gagner_telephone_connexion.webp",
      alt: t("Gagnez de l'argent depuis votre téléphone"),
    },
    {
      id: "shop",
      cls: "hc-navy",
      kicker: t("MBOPPISHOP"),
      title: t("Votre boutique en ligne, simple et optimisée"),
      text: t(
        "Une vitrine moderne et rapide pour vos produits, pensée pour les achats sur mobile."
      ),
      cta: t("Créer ma boutique"),
      to: "/register",
      img: "/diapo/MboppiShop_Shopify_optimise.webp",
      alt: t("MboppiShop : votre boutique optimisée"),
    },
  ];

  const count = slides.length;
  const rtlMult = (() => {
    try {
      return document.documentElement.getAttribute("dir") === "rtl" ? -1 : 1;
    } catch {
      return 1;
    }
  })();

  const go = useCallback((i) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }
    timer.current = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer.current);
  }, [index, paused, count, go]);

  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchEnd = (e) => {
    if (touchX.current != null) {
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
    }
    touchX.current = null;
    setPaused(false);
  };

  return (
    <section
      className={`hero-carousel hc-${slides[index]?.cls || ""}`}
      role="region"
      aria-roledescription="carrousel"
      aria-label={t("À la une sur Mboppi")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="hero-carousel-track"
        style={{ transform: `translateX(${rtlMult * -index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div
            className="hero-slide"
            key={s.id}
            aria-hidden={i !== index || undefined}
            aria-label={`${i + 1} / ${count}`}
          >
            <img
              className="hero-slide-img"
              src={s.img}
              alt={s.alt}
              width={1000}
              height={1000}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
            />
            <div className="hero-slide-body">
              <span className="hero-slide-kicker">{s.kicker}</span>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
            {s.to.startsWith("#") ? (
                <button
                  type="button"
                  className="btn btn-light hero-slide-cta"
                  tabIndex={i === index ? 0 : -1}
                  onClick={onExplore}
                >
                  {s.cta} →
                </button>
              ) : (
                <Link
                  className="btn btn-light hero-slide-cta"
                  to={s.to}
                  tabIndex={i === index ? 0 : -1}
                >
                  {s.cta} →
                </Link>
              )}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="hc-arrow hc-arrow-prev"
        aria-label={t("Diapositive précédente")}
        onClick={() => go(index - 1)}
      >
        <IconChevronLeft size={20} />
      </button>
      <button
        type="button"
        className="hc-arrow hc-arrow-next"
        aria-label={t("Diapositive suivante")}
        onClick={() => go(index + 1)}
      >
        <IconChevronRight size={20} />
      </button>

      <div className="hc-dots" role="tablist" aria-label={t("Choisir une diapositive")}>
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${t("Diapositive")} ${i + 1} : ${s.kicker}`}
            className={`hc-dot ${i === index ? "active" : ""}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
}
