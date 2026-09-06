import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nodehound_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('nodehound_token') || null);
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('nodehound_refresh_token') || null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login'); // 'login' | 'register' | 'mfa'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync state to localStorage
  const saveSession = useCallback((newToken, newRefresh, newUser) => {
    setToken(newToken);
    setRefreshToken(newRefresh);
    setUser(newUser);
    localStorage.setItem('nodehound_token', newToken);
    localStorage.setItem('nodehound_refresh_token', newRefresh);
    localStorage.setItem('nodehound_user', JSON.stringify(newUser));
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem('nodehound_token');
    localStorage.removeItem('nodehound_refresh_token');
    localStorage.removeItem('nodehound_user');
  }, []);

  // Login handler
  const login = async (email, password, mfaCode = null) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.login({ email, password, mfa_code: mfaCode });
      if (data.mfa_required) {
        setAuthModalTab('mfa');
        return { mfaRequired: true };
      }
      saveSession(data.access_token, data.refresh_token, data.user);
      setAuthModalOpen(false);
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message || 'Authentication failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const logout = async () => {
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // Ignore network errors during logout
      }
    }
    clearSession();
  };

  // Quick Persona switcher for forensic demonstration & testing
  const switchPersona = async (persona) => {
    const credentials = {
      supervisor: { email: 'supervisor@nodehound.gov', password: 'NodeHound@SecOps2026!' },
      investigator1: { email: 'investigator1@nodehound.gov', password: 'NodeHound@SecOps2026!' },
      investigator2: { email: 'investigator2@nodehound.gov', password: 'NodeHound@SecOps2026!' },
      admin: { email: 'admin@nodehound.gov', password: 'NodeHound@SecOps2026!' },
    };

    const cred = credentials[persona];
    if (cred) {
      return login(cred.email, cred.password);
    }
  };

  // Check permission helper
  const hasPermission = useCallback((permission) => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  }, [user]);

  // If no user is logged in, auto-login as default investigator1 on first boot for seamless experience
  useEffect(() => {
    if (!user && !token) {
      switchPersona('investigator1').catch(() => {
        // Fallback gracefully if backend is restarting
      });
    }
  }, []);

  const value = {
    user,
    token,
    refreshToken,
    authModalOpen,
    setAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    loading,
    error,
    login,
    logout,
    switchPersona,
    hasPermission,
    isSupervisor: user?.role === 'INVESTIGATION_SUPERVISOR',
    isInvestigator: user?.role === 'INVESTIGATOR',
    isAdmin: user?.role === 'SYSTEM_ADMINISTRATOR',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

