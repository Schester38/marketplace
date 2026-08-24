import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLang } from "../i18n.jsx";
import { useCart, useFavs } from "../store.jsx";
import { useAuth } from "../App.jsx";
import {
  IconHome,
  IconSearch,
  IconHeart,
  IconHeartFilled,
  IconCart,
  IconUser,
  IconUserCheck,
} from "./icons.jsx";

export default function BottomNav() {
  const { t } = useLang();
  const { user } = useAuth();
  const { cartCount } = useCart();
  const { favs } = useFavs();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const focusSearch = () => {
    const el = document.querySelector(".hero-search input");
    if (el) {
      el.focus();
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* anciens navigateurs */
      }
    }
  };

  const goSearch = () => {
    if (path === "/") {
      focusSearch();
      return;
    }
    navigate("/");
    setTimeout(focusSearch, 500);
  };

  // Icône de base + variante « active » (remplie) pour un retour visuel clair.
  const item = (to, label, IconBase, IconActive, count) => {
    const active = path === to;
    return (
      <Link
        to={to}
        className={active ? "active" : ""}
        aria-label={label}
        aria-current={active ? "page" : undefined}
      >
        <span className="bn-icon">
          {active && IconActive ? <IconActive size={22} /> : <IconBase size={22} />}
          {count > 0 && (
            <span className="nav-badge bump" key={`${to}-${count}`}>
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span className="bn-label">{label}</span>
      </Link>
    );
  };

  return (
    <nav className="bottom-nav" aria-label={t("Menu principal")}>
      {item("/", t("Accueil"), IconHome, null, 0)}
      <button
        className={path === "/" ? "active" : ""}
        onClick={goSearch}
        aria-label={t("Recherche")}
      >
        <span className="bn-icon">
          <IconSearch size={22} />
        </span>
        <span className="bn-label">{t("Recherche")}</span>
      </button>
      {item("/favoris", t("Favoris"), IconHeart, IconHeartFilled, favs.length)}
      {item("/panier", t("Panier"), IconCart, null, cartCount)}
      {!user && item("/login", t("Connexion"), IconUser, IconUserCheck, 0)}
    </nav>
  );
}
