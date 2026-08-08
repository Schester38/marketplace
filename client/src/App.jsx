import React, { Suspense, createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import Home from './pages/Home.jsx';

const Login = React.lazy(() => import('./pages/Login.jsx'));
const Register = React.lazy(() => import('./pages/Register.jsx'));
const ShopDashboard = React.lazy(() => import('./pages/ShopDashboard.jsx'));
const SellerDashboard = React.lazy(() => import('./pages/SellerDashboard.jsx'));
const ClientDashboard = React.lazy(() => import('./pages/ClientDashboard.jsx'));
const CreatorDashboard = React.lazy(() => import('./pages/CreatorDashboard.jsx'));
const VitrineOffre = React.lazy(() => import('./pages/VitrineOffre.jsx'));
const Verone = React.lazy(() => import('./pages/Verone.jsx'));
const OfferDetail = React.lazy(() => import('./pages/OfferDetail.jsx'));
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

export default function App() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="app">
      <Navbar onLogout={() => { logout(); navigate('/'); }} />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Home />} />
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
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <Footer />
    </div>
  );
}
