import React, { useState, useEffect } from 'react';
import { AppContent } from './components/AppContent.tsx';
import { Loader } from './components/Loader.tsx';
import { Login } from './components/Login.tsx';
import { Register } from './components/Register.tsx';
import { ForgotPassword } from './components/ForgotPassword.tsx';
import { AuthLayout } from './components/AuthLayout.tsx';
import { useAuth } from './contexts/AuthContext.tsx';
import { LocalizationProvider } from './contexts/LocalizationContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';

const AppRouter: React.FC = () => {
    const { user, isLoading, hasUsers } = useAuth();
    const [authView, setAuthView] = useState<'login' | 'register' | 'forgot'>('login');

    useEffect(() => {
        if (!isLoading) {
            if (!hasUsers) {
                setAuthView('register');
            } else {
                setAuthView('login');
            }
        }
    }, [isLoading, hasUsers]);

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
                <Loader />
            </div>
        );
    }

    if (!user) {
        return (
            <AuthLayout>
                {authView === 'login' && <Login onSwitchToForgotPassword={() => setAuthView('forgot')} />}
                {authView === 'register' && <Register />}
                {authView === 'forgot' && <ForgotPassword onSwitchToLogin={() => setAuthView('login')} />}
            </AuthLayout>
        );
    }

    return <AppContent />;
};

const App: React.FC = () => (
  <ThemeProvider>
    <LocalizationProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </LocalizationProvider>
  </ThemeProvider>
);

export default App;
