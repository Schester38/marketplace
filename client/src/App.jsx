import React, { Suspense, createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import Home from './pages/Home.jsx';
import { LangProvider, useLang } from './i18n.jsx';
import { StoreProvider } from './store.jsx';

const Login = React.lazy(() => import('./pages/Login.jsx'));
const Register = React.lazy(() => import('./pages/Register.jsx'));
const Cart = React.lazy(() => import('./pages/Cart.jsx'));
const Favorites = React.lazy(() => import('./pages/Favorites.jsx'));
const ShopDashboard = React.lazy(() => import('./pages/ShopDashboard.jsx'));
const SellerDashboard = React.lazy(() => import('./pages/SellerDashboard.jsx'));
const SellerPayments = React.lazy(() => import('./pages/SellerPayments.jsx'));
const LivreurDashboard = React.lazy(() => import('./pages/LivreurDashboard.jsx'));
const ClientDashboard = React.lazy(() => import('./pages/ClientDashboard.jsx'));
const CreatorDashboard = React.lazy(() => import('./pages/CreatorDashboard.jsx'));
const VitrineOffre = React.lazy(() => import('./pages/VitrineOffre.jsx'));
const Verone = React.lazy(() => import('./pages/Verone.jsx'));
const OfferDetail = React.lazy(() => import('./pages/OfferDetail.jsx'));
const ProductDetail = React.lazy(() => import('./pages/ProductDetail.jsx'));
const PurchasePage = React.lazy(() => import('./pages/PurchasePage.jsx'));
const AuthGoogle = React.lazy(() => import('./pages/AuthGoogle.jsx'));
const About = React.lazy(() => import('./pages/About.jsx'));
const Contact = React.lazy(() => import('./pages/Contact.jsx'));
const Privacy = React.lazy(() => import('./pages/Privacy.jsx'));
const MyAccount = React.lazy(() => import('./pages/MyAccount.jsx'));

const AuthContext = createContext(null);

export function dashboardPath(role) {
  if (role === 'shop') return '/shop';
  if (role === 'seller') return '/seller';
  if (role === 'client') return '/client';
  if (role === 'livreur') return '/livreur';
  return '/creator';
}

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

  return (
    <StoreProvider>
      <LangProvider>
        <div className="app">
          <Navbar onLogout={() => { logout(); navigate('/'); }} />
          {location.pathname === '/' && <WelcomeBanner />}
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
          <Route path="/offre/:id" element={<OfferDetail />} />
          <Route path="/produit/:id" element={<ProductDetail />} />
          <Route path="/acheter/:id" element={<PurchasePage />} />
          <Route path="/verone" element={<Verone />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <Footer />
      </div>
      </LangProvider>
    </StoreProvider>
  );
}
