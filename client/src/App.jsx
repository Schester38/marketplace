import React, {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import BottomNav from "./components/BottomNav.jsx";
import BackToTop from "./components/BackToTop.jsx";
import BackButton from "./components/BackButton.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import LoadingScreen from "./components/LoadingScreen.jsx";
import Home from "./pages/Home.jsx";
import CityPage from "./pages/CityPage.jsx";
import { LangProvider, useLang } from "./i18n.jsx";
import { StoreProvider } from "./store.jsx";
import { membershipActive } from "./auth-access.js";

const lazyRetry = (importer) =>
  React.lazy(async () => {
    try {
      return await importer();
    } catch (_err) {
      // 1re retente après un court délai (réseau qui fluctue).
      await new Promise((r) => setTimeout(r, 1200));
      try {
        return await importer();
      } catch (_err2) {
        // Échec persistant d'un chunk : souvent un index.html PÉRIMÉ servi par
        // le service worker qui référence d'anciens hachages retirés du serveur
        // après un déploiement ("Failed to fetch dynamically imported module").
        // On force un rechargement complet (une fois par session) pour que le
        // SW ravive "/" et récupère le nouveau bundle. Guard anti-boucle.
        try {
          if (!sessionStorage.getItem("reload_chunk")) {
            sessionStorage.setItem("reload_chunk", "1");
            window.location.reload();
            return new Promise(() => {});
          }
        } catch {
          /* stockage indisponible */
        }
        throw _err2;
      }
    }
  });

const Login = lazyRetry(() => import("./pages/Login.jsx"));
const Register = lazyRetry(() => import("./pages/Register.jsx"));
const ConfirmEmail = lazyRetry(() => import("./pages/ConfirmEmail.jsx"));
const Cart = lazyRetry(() => import("./pages/Cart.jsx"));
const Favorites = lazyRetry(() => import("./pages/Favorites.jsx"));
const ShopDashboard = lazyRetry(() => import("./pages/ShopDashboard.jsx"));
const SellerDashboard = lazyRetry(() => import("./pages/SellerDashboard.jsx"));
const SellerPayments = lazyRetry(() => import("./pages/SellerPayments.jsx"));
const ShopPayments = lazyRetry(() => import("./pages/ShopPayments.jsx"));
const LivreurDashboard = lazyRetry(() => import("./pages/LivreurDashboard.jsx"));
const LivreurPayments = lazyRetry(() => import("./pages/LivreurPayments.jsx"));
const CreatorPayments = lazyRetry(() => import("./pages/CreatorPayments.jsx"));
const LivreursList = lazyRetry(() => import("./pages/LivreursList.jsx"));
const ClientDashboard = lazyRetry(() => import("./pages/ClientDashboard.jsx"));
const CreatorDashboard = lazyRetry(() => import("./pages/CreatorDashboard.jsx"));
const VitrineOffre = lazyRetry(() => import("./pages/VitrineOffre.jsx"));
const Verone = lazyRetry(() => import("./pages/Verone.jsx"));
const OfferDetail = lazyRetry(() => import("./pages/OfferDetail.jsx"));
const ProductDetail = lazyRetry(() => import("./pages/ProductDetail.jsx"));
const PurchasePage = lazyRetry(() => import("./pages/PurchasePage.jsx"));
const MembershipPage = lazyRetry(() => import("./pages/MembershipPage.jsx"));

const AuthGoogle = lazyRetry(() => import("./pages/AuthGoogle.jsx"));
const About = lazyRetry(() => import("./pages/About.jsx"));
const Contact = lazyRetry(() => import("./pages/Contact.jsx"));
const Privacy = lazyRetry(() => import("./pages/Privacy.jsx"));
const MyAccount = lazyRetry(() => import("./pages/MyAccount.jsx"));
const ShopPage = lazyRetry(() => import("./pages/ShopPage.jsx"));
const CreatorShowcase = lazyRetry(() => import("./pages/CreatorShowcase.jsx"));
const Creators = lazyRetry(() => import("./pages/Creators.jsx"));
const Suivi = lazyRetry(() => import("./pages/Suivi.jsx"));
const NotFound = lazyRetry(() => import("./pages/NotFound.jsx"));
const Admin = lazyRetry(() => import("./pages/Admin.jsx"));
const Cgv = lazyRetry(() => import("./pages/Cgv.jsx"));
const Cgu = lazyRetry(() => import("./pages/Cgu.jsx"));
const Faq = lazyRetry(() => import("./pages/Faq.jsx"));
const MentionsLegales = lazyRetry(() => import("./pages/MentionsLegales.jsx"));
const Support = lazyRetry(() => import("./pages/Support.jsx"));
const CookiesBanner = lazyRetry(() => import("./components/CookiesBanner.jsx"));
import OfflinePage from "./pages/OfflinePage.jsx";
import AdminMessagePopup from "./components/AdminMessagePopup.jsx";
import FlashPromoPopup from "./components/FlashPromoPopup.jsx";
import LiteBanner from "./components/LiteBanner.jsx";

const AuthContext = createContext(null);

export function dashboardPath(role) {
  if (role === "shop") return "/shop";
  if (role === "seller") return "/seller";
  if (role === "client") return "/client";
  if (role === "livreur") return "/livreur";
  if (role === "admin") return "/admin";
  return "/creator";
}

export function postLoginPath(user) {
  return dashboardPath(user && user.role);
}

const WELCOME_PATHS = ["/", "/shop", "/seller", "/client", "/creator", "/livreur", "/admin"];

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      let u = JSON.parse(localStorage.getItem("user"));
      // Auto-réparation : répare les sessions corrompues par l'ancien bug
      // (objet { user: {...} } stocké tel quel, sans role/id au premier niveau)
      if (u && typeof u === "object" && !u.role && u.user && typeof u.user === "object") {
        u = u.user;
        localStorage.setItem("user", JSON.stringify(u));
      }
      if (u?.role) console.log("[auth] init user role=", u.role, "email=", u.email);
      return u;
    } catch {
      return null;
    }
  });

  const login = (userData, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    if (userData?.role) console.log("[auth] login role=", userData.role, "email=", userData.email);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  useEffect(() => {
    const onAuthExpired = () => {
      if (logoutRef.current) logoutRef.current();
    };
    window.addEventListener("auth-expired", onAuthExpired);
    return () => window.removeEventListener("auth-expired", onAuthExpired);
  }, []);

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return undefined;
    if (window.location.pathname.startsWith("/admin")) return undefined;
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
    const IDLE_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];
    let timer = null;
    const expire = () => {
      if (logoutRef.current) logoutRef.current();
      navigate("/login", { replace: true });
    };
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    IDLE_EVENTS.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    reset();
    return () => {
      IDLE_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
      if (timer) clearTimeout(timer);
    };
  }, [user, navigate]);

  const userIdRef = useRef(user?.id);

  // Accès fermé par l'admin (bouton « Fermer ») ou adhésion expirée : une API
  // a répondu 402 MEMBERSHIP_REQUIRED → rafraîchir la session puis rediriger
  // vers la page de paiement de l'adhésion (/adhesion, valable 30 jours).
  useEffect(() => {
    let cancelled = false;
    const onMembershipRequired = async () => {
      if (window.location.pathname.startsWith("/admin")) return;
      try {
        const d = await api.me();
        const u = d?.user;
        if (!cancelled && u?.id) {
          setUser(u);
          localStorage.setItem("user", JSON.stringify(u));
        }
      } catch {
        /* session peut-être expirée : on redirige quand même */
      }
      if (!cancelled) navigate("/adhesion", { replace: true });
    };
    window.addEventListener("membership-required", onMembershipRequired);
    return () => {
      cancelled = true;
      window.removeEventListener("membership-required", onMembershipRequired);
    };
  }, [navigate]);

  // Synchronisation automatique de la session (60 s + retour sur l'onglet) :
  // applique immédiatement « Ouvrir »/« Fermer » décidés par l'admin ou une
  // adhésion confirmée, sans déconnexion/reconnexion.
  useEffect(() => {
    if (!user?.id || user.role === "admin") return undefined;
    let cancelled = false;
    let lastSig = "";
    const sync = async () => {
      try {
        const d = await api.me();
        const u = d?.user;
        if (cancelled || !u?.id) return;
        const sig = JSON.stringify([
          u.id,
          u.role,
          u.name,
          u.email,
          !!u.admin_approved,
          !!u.verified,
          u.membership_expires_at || "",
        ]);
        if (sig === lastSig) return;
        lastSig = sig;
        setUser(u);
        localStorage.setItem("user", JSON.stringify(u));
      } catch {
        /* réseau indisponible : nouvelle tentative au prochain cycle */
      }
    };
    sync();
    const id = setInterval(sync, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  // Si l'accès vient d'être ouvert pendant que l'utilisateur est sur la page
  // d'adhésion, le renvoyer automatiquement vers son espace.
  useEffect(() => {
    if (!user || window.location.pathname !== "/adhesion") return;
    if (!membershipActive(user)) return;
    const home =
      user.role === "shop"
        ? "/shop"
        : user.role === "seller"
          ? "/seller"
          : user.role === "creator"
            ? "/creator"
            : "/";
    navigate(home, { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    if (userIdRef.current === user.id) return;
    userIdRef.current = user.id;
    let cancelled = false;
    api
      .me()
      .then((data) => {
        const u = data?.user;
        console.log("[auth] /me refresh role=", u?.role, "email=", u?.email, "id=", u?.id);
        // L'API renvoie { user }, ne jamais écraser la session si la réponse est invalide
        if (cancelled || !u?.id) return;
        setUser(u);
        localStorage.setItem("user", JSON.stringify(u));
      })
      .catch((e) => console.log("[auth] /me refresh failed", e.message));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleOnly({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  if (!membershipActive(user)) return <Navigate to="/adhesion" replace />;
  return children;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Journalisation obligatoire : les erreurs captées par un ErrorBoundary
    // React ne parviennent PAS à window.onerror, donc le logging global de
    // main.jsx ne les voit pas. On les remonte ici (console + /api/logs)
    // pour pouvoir diagnostiquer la cause réelle.
    try {
      console.error("[ErrorBoundary]", error, info);
      const payload = {
        message: String((error && error.message) || error || "Erreur de rendu"),
        stack: (error && error.stack) || "",
        info: (info && info.componentStack) || "",
        url: window.location.href,
        username: (() => {
          try {
            return JSON.parse(localStorage.getItem("user") || "null")?.name || "";
          } catch {
            return "";
          }
        })(),
      };
      navigator.sendBeacon(
        "/api/logs",
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    } catch {
      /* best effort */
    }
  }
  render() {
    const { t } = this.props;
    if (this.state.error) {
      return (
        <main className="container narrow" style={{ textAlign: "center", paddingTop: 48 }}>
          <div className="card page-center">
            <p style={{ fontSize: 42, marginBottom: 4 }}>😵</p>
            <h2>{t("Oups, une erreur est survenue.")}</h2>
            <p className="hint">
              {t("Réessayez ou rechargez la page. Vos données sont en sécurité.")}
            </p>
            <details style={{ textAlign: "left", margin: "16px auto", maxWidth: 480 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>
                Détails techniques
              </summary>
              <pre
                style={{
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "var(--soft)",
                  padding: 10,
                  borderRadius: 8,
                  maxHeight: 200,
                  overflow: "auto",
                  margin: "8px 0 0",
                }}
              >
                {String((this.state.error && this.state.error.stack) || this.state.error)}
              </pre>
            </details>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              🔄 {t("Réessayer")}
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function WelcomeBanner() {
  const { user } = useAuth();
  const { t } = useLang();
  const [kind, setKind] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      setKind(localStorage.getItem("mboppi_welcome"));
    } catch {
      setKind(null);
    }
  }, []);
  const dismiss = useCallback(() => {
    localStorage.removeItem("mboppi_welcome");
    setKind(null);
  }, []);
  useEffect(() => {
    if (!user || !kind) return;
    const t1 = setTimeout(() => setLeaving(true), 10000);
    const t2 = setTimeout(dismiss, 10450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [user, kind, dismiss]);
  if (!user || !kind) return null;
  const isRegister = kind === "register";
  const text = isRegister
    ? t(
        "Merci {name} ! Mboppi est ravi de vous accueillir. Découvrez ci-dessous les produits et créations.",
        { name: user.name }
      )
    : t("{name}, Mboppi est heureux de vous revoir !", { name: user.name });
  return (
    <div
      className={`welcome-banner ${isRegister ? "welcome-register" : "welcome-login"}${leaving ? " leaving" : ""}`}
    >
      <span className="welcome-text">👋 {text}</span>
      <button type="button" className="welcome-close" aria-label={t("Fermer")} onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLang();

  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("app-offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("app-offline", off);
    };
  }, []);

  const pathKey = location.pathname + location.search;
  useEffect(() => {
    if (!online || !pathKey) return;
    let visitorId = localStorage.getItem("mboppi_visitor_id");
    if (!visitorId) {
      const id =
        (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
        "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem("mboppi_visitor_id", id);
      visitorId = id;
    }
    try {
      const key = "mboppi_visited_" + pathKey;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      fetch("/api/metrics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Visitor-Id": visitorId },
        body: JSON.stringify({ path: pathKey, country: (user && user.country) || "CM" }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      api.trackVisit(pathKey, (user && user.country) || "CM").catch(() => {});
    }
  }, [pathKey, online, user]);

  if (!online) {
    return (
      <div className="app">
        <OfflinePage />
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar
        onLogout={() => {
          logout();
          navigate("/");
        }}
      />
      <AdminMessagePopup />
      <FlashPromoPopup />
      {WELCOME_PATHS.includes(location.pathname) && <WelcomeBanner />}
      <ErrorBoundary t={t}>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/panier" element={<Cart />} />
            <Route
              path="/favoris"
              element={
                <Protected>
                  <Favorites />
                </Protected>
              }
            />
            <Route path="/a-propos" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/donnees" element={<Privacy />} />
            <Route
              path="/compte"
              element={
                <Protected>
                  <MyAccount />
                </Protected>
              }
            />
            <Route path="/vitrine-offre" element={<VitrineOffre />} />
            <Route path="/createurs" element={<Creators />} />
            <Route path="/createur/:id" element={<CreatorShowcase />} />
            <Route path="/ville/:slug" element={<CityPage />} />
            <Route path="/offre/:id" element={<OfferDetail />} />
            <Route path="/produit/:id" element={<ProductDetail />} />
            <Route path="/acheter/:id" element={<PurchasePage />} />
            <Route
              path="/adhesion"
              element={
                <Protected>
                  <MembershipPage />
                </Protected>
              }
            />
            <Route path="/verone" element={<Verone />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verifier-email" element={<ConfirmEmail />} />
            <Route path="/auth-google" element={<AuthGoogle />} />
            <Route
              path="/shop"
              element={
                <RoleOnly role="shop">
                  <ShopDashboard />
                </RoleOnly>
              }
            />
            <Route
              path="/seller"
              element={
                <RoleOnly role="seller">
                  <SellerDashboard />
                </RoleOnly>
              }
            />
            <Route
              path="/seller/paiements"
              element={
                <RoleOnly role="seller">
                  <SellerPayments />
                </RoleOnly>
              }
            />
            <Route
              path="/shop/paiements"
              element={
                <RoleOnly role="shop">
                  <ShopPayments />
                </RoleOnly>
              }
            />
            <Route
              path="/shop/livreurs"
              element={
                <RoleOnly role="shop">
                  <LivreursList />
                </RoleOnly>
              }
            />
            <Route
              path="/client"
              element={
                <RoleOnly role="client">
                  <ClientDashboard />
                </RoleOnly>
              }
            />
            <Route
              path="/creator"
              element={
                <RoleOnly role="creator">
                  <CreatorDashboard />
                </RoleOnly>
              }
            />
            <Route
              path="/livreur"
              element={
                <RoleOnly role="livreur">
                  <LivreurDashboard />
                </RoleOnly>
              }
            />
            <Route
              path="/livreur/paiements"
              element={
                <RoleOnly role="livreur">
                  <LivreurPayments />
                </RoleOnly>
              }
            />
            <Route
              path="/creator/paiements"
              element={
                <RoleOnly role="creator">
                  <CreatorPayments />
                </RoleOnly>
              }
            />
            <Route path="/boutique/:id" element={<ShopPage />} />
            <Route path="/suivi/:id" element={<Suivi />} />
            <Route path="/cgv" element={<Cgv />} />
            <Route path="/cgu" element={<Cgu />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/soutien" element={<Support />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <CookiesBanner />
      <LiteBanner />
      <Footer />
      <BottomNav />
      <BackToTop />
      <BackButton />
      <ChatWidget />
    </div>
  );
}
