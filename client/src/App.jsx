import React, { Suspense, createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import BottomNav from './components/BottomNav.jsx';
import BackToTop from './components/BackToTop.jsx';
import BackButton from './components/BackButton.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import Home from './pages/Home.jsx';
import CityPage from './pages/CityPage.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { StoreProvider } from './store.jsx';

const lazyRetry = (importer) =>
  React.lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      await new Promise((r) => setTimeout(r, 1200));
      return importer();
    }
  });

const Login = lazyRetry(() => import('./pages/Login.jsx'));
const Register = lazyRetry(() => import('./pages/Register.jsx'));
const ConfirmEmail = lazyRetry(() => import('./pages/ConfirmEmail.jsx'));
const Cart = lazyRetry(() => import('./pages/Cart.jsx'));
const Favorites = lazyRetry(() => import('./pages/Favorites.jsx'));
const ShopDashboard = lazyRetry(() => import('./pages/ShopDashboard.jsx'));
const SellerDashboard = lazyRetry(() => import('./pages/SellerDashboard.jsx'));
const SellerPayments = lazyRetry(() => import('./pages/SellerPayments.jsx'));
const ShopPayments = lazyRetry(() => import('./pages/ShopPayments.jsx'));
const LivreurDashboard = lazyRetry(() => import('./pages/LivreurDashboard.jsx'));
const ClientDashboard = lazyRetry(() => import('./pages/ClientDashboard.jsx'));
const CreatorDashboard = lazyRetry(() => import('./pages/CreatorDashboard.jsx'));
const VitrineOffre = lazyRetry(() => import('./pages/VitrineOffre.jsx'));
const Verone = lazyRetry(() => import('./pages/Verone.jsx'));
const OfferDetail = lazyRetry(() => import('./pages/OfferDetail.jsx'));
const ProductDetail = lazyRetry(() => import('./pages/ProductDetail.jsx'));
const PurchasePage = lazyRetry(() => import('./pages/PurchasePage.jsx'));
const AuthGoogle = lazyRetry(() => import('./pages/AuthGoogle.jsx'));
const About = lazyRetry(() => import('./pages/About.jsx'));
const Contact = lazyRetry(() => import('./pages/Contact.jsx'));
const Privacy = lazyRetry(() => import('./pages/Privacy.jsx'));
const MyAccount = lazyRetry(() => import('./pages/MyAccount.jsx'));
const ShopPage = lazyRetry(() => import('./pages/ShopPage.jsx'));
const CreatorShowcase = lazyRetry(() => import('./pages/CreatorShowcase.jsx'));
const Creators = lazyRetry(() => import('./pages/Creators.jsx'));
const Suivi = lazyRetry(() => import('./pages/Suivi.jsx'));
const NotFound = lazyRetry(() => import('./pages/NotFound.jsx'));
const Admin = lazyRetry(() => import('./pages/Admin.jsx'));
const Cgv = lazyRetry(() => import('./pages/Cgv.jsx'));
const Cgu = lazyRetry(() => import('./pages/Cgu.jsx'));
const Faq = lazyRetry(() => import('./pages/Faq.jsx'));
const MentionsLegales = lazyRetry(() => import('./pages/MentionsLegales.jsx'));
const Support = lazyRetry(() => import('./pages/Support.jsx'));
const CookiesBanner = lazyRetry(() => import('./components/CookiesBanner.jsx'));
import OfflinePage from './pages/OfflinePage.jsx';
import AdminMessagePopup from './components/AdminMessagePopup.jsx';

const AuthContext = createContext(null);

export function dashboardPath(role) {
  if (role === 'shop') return '/shop';
  if (role === 'seller') return '/seller';
  if (role === 'client') return '/client';
  if (role === 'livreur') return '/livreur';
  if (role === 'admin') return '/admin';
  return '/creator';
}

const WELCOME_PATHS = ['/', '/shop', '/seller', '/client', '/creator', '/livreur', '/admin'];

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
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
  render() {
    const { t } = this.props;
    if (this.state.error) {
      return (
        <main className="container narrow" style={{ textAlign: 'center', paddingTop: 48 }}>
          <div className="card page-center">
            <p style={{ fontSize: 42, marginBottom: 4 }}>😵</p>
            <h2>{t('Oups, une erreur est survenue.')}</h2>
            <p className="hint">{t('Réessayez ou rechargez la page. Vos données sont en sécurité.')}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              🔄 {t('Réessayer')}
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
  const [kind, setKind] = useState(() => localStorage.getItem('mboppi_welcome'));
  if (!user || !kind) return null;
  const isRegister = kind === 'register';
  const text = isRegister
    ? t('Merci {name} ! Mboppi est ravi de vous accueillir. Découvrez ci-dessous les produits et créations.', { name: user.name })
    : t('{name}, Mboppi est heureux de vous revoir !', { name: user.name });
  const dismiss = () => {
    localStorage.removeItem('mboppi_welcome');
    setKind(null);
  };
  return (
    <div className={`welcome-banner ${isRegister ? 'welcome-register' : 'welcome-login'}`}>
      <span className="welcome-text">👋 {text}</span>
      <button type="button" className="welcome-close" aria-label={t('Fermer')} onClick={dismiss}>✕</button>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { t } = useLang();

  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('app-offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('app-offline', off);
    };
  }, []);

  if (!online) {
    return (
      <div className="app">
        <OfflinePage />
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar onLogout={() => { logout(); navigate('/'); }} />
      <AdminMessagePopup />
          {WELCOME_PATHS.includes(location.pathname) && <WelcomeBanner />}
          <ErrorBoundary t={t}>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/panier" element={<Cart />} />
            <Route path="/favoris" element={<Favorites />} />
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
          <Route path="/livreur" element={<LivreurDashboard />} />
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
      <Footer />
      <BottomNav />
      <BackToTop />
      <BackButton />
      <ChatWidget />
    </div>
  );
}
