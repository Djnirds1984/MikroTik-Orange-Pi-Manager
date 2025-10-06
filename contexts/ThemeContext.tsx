import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            const storedTheme = window.localStorage.getItem('theme') as Theme | null;
            if (storedTheme) {
                return storedTheme;
            }
        }
        return 'system';
    });

    const isDarkMode = useMemo(() => 
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
        [theme]
    );

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.toggle('dark', isDarkMode);
        try {
            window.localStorage.setItem('theme', theme);
        } catch (e) {
            console.error('Failed to save theme to localStorage', e);
        }
    }, [theme, isDarkMode]);
    
    // Listen for system theme changes if theme is 'system'
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        const handleChange = () => {
             if (theme === 'system') {
                 const root = window.document.documentElement;
                 root.classList.toggle('dark', mediaQuery.matches);
             }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);


    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    const value = useMemo(() => ({ theme, setTheme, isDarkMode }), [theme, isDarkMode]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
