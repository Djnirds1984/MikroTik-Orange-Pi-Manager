import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocalizationProvider } from './contexts/LocalizationContext';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { AppContent } from './components/AppContent';
import { AuthLayout } from './components/AuthLayout';

const App: React.FC = () => {
  const { isAuthenticated, hasUsers } = useAuth();

  if (!isAuthenticated) {
    return (
      <AuthLayout>
        {hasUsers ? <Login /> : <Register />}
      </AuthLayout>
    );
  }

  return <AppContent />;
};

const Root: React.FC = () => {
  return (
    <ThemeProvider>
      <LocalizationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
};

export default Root;
