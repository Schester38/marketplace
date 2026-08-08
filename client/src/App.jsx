import React, { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ShopDashboard from './pages/ShopDashboard.jsx';
import SellerDashboard from './pages/SellerDashboard.jsx';
import VitrineOffre from './pages/VitrineOffre.jsx';
import Verone from './pages/Verone.jsx';

const AuthContext = createContext(null);

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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/vitrine-offre" element={<VitrineOffre />} />
        <Route path="/verone" element={<Verone />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
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
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
