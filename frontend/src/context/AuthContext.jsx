import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    // Kept for the browsers that dropped the cookie; harmless where they did not.
    const { token, ...user } = res.data;
    setToken(token);
    setUser(user);
    return user;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setToken(null);
      setUser(null);
    }
  }

  const value = {
    user,
    loading,
    login,
    logout,
    isFrontDesk: user?.role === 'FRONT_DESK',
    isProvider: user?.role === 'PROVIDER',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}