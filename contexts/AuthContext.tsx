import React, { createContext, useContext, useState, ReactNode } from 'react';

// Define the shape of the context data
interface AuthContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create a provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // This is a placeholder state. In a real app, you'd check for a token
  // in localStorage or make an API call.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const login = () => {
    // Placeholder login logic
    setIsAuthenticated(true);
  };

  const logout = () => {
    // Placeholder logout logic
    setIsAuthenticated(false);
  };

  const value = {
    isAuthenticated,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Create a custom hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
