import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import api from '../utils/api';
import { Loader } from '../components/Loader';

interface User {
  id: number;
  username: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasUsers: boolean | null;
  login: (credentials: { username?: string; password?: string }) => Promise<void>;
  logout: () => Promise<void>;
  register: (credentials: { username?: string; password?: string }) => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/auth/check-session');
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkHasUsers = useCallback(async () => {
    try {
        const { data } = await api.get('/auth/has-users');
        setHasUsers(data.hasUsers);
    } catch (error) {
        console.error("Failed to check for existing users", error);
        setHasUsers(true); // Fail safe to show login
    }
  }, []);


  useEffect(() => {
    const initializeAuth = async () => {
      await checkHasUsers();
      await checkSession();
    };
    initializeAuth();
  }, [checkHasUsers, checkSession]);

  const login = async (credentials: { username?: string; password?: string }) => {
    const { data } = await api.post('/auth/login', credentials);
    setUser(data.user);
  };

  const register = async (credentials: { username?: string; password?: string }) => {
    const { data } = await api.post('/auth/register', credentials);
    setUser(data.user);
    setHasUsers(true);
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    hasUsers,
    login,
    logout,
    register,
    checkSession,
  };

  if (isLoading || hasUsers === null) {
    return <Loader fullScreen={true} />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
