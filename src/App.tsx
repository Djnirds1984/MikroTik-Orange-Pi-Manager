import React from 'react';
import { AppContent } from './components/AppContent.tsx';
import { LocalizationProvider } from './contexts/LocalizationContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';

const App: React.FC = () => (
  <ThemeProvider>
    <LocalizationProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LocalizationProvider>
  </ThemeProvider>
);

export default App;
