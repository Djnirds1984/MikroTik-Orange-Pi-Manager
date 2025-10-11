import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

// For simplicity, we'll just have a few strings. A real app would load these from JSON files.
const translations = {
  en: {
    dashboard: 'Dashboard',
    routers: 'Routers',
  },
  es: {
    dashboard: 'Tablero',
    routers: 'Enrutadores',
  },
  fil: {
    dashboard: 'Dashboard',
    routers: 'Mga Router',
  },
  pt: {
    dashboard: 'Painel',
    routers: 'Roteadores',
  }
};

type Language = 'en' | 'es' | 'fil' | 'pt';

// Define a type for the translation keys based on the 'en' object
type TranslationKey = keyof typeof translations['en'];

interface LocalizationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export const LocalizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en'); // Default to English

  const t = useCallback((key: TranslationKey): string => {
    // Fallback to English if translation is missing for the current language
    return translations[language]?.[key] || translations.en[key];
  }, [language]);

  return (
    <LocalizationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = () => {
  const context = useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};
