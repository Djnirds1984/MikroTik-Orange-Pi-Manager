import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Define the shape of the user object and the context
interface User {
    id: string;
    username: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    hasUsers: boolean;
    error: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
    const [isLoading, setIsLoading] = useState(true);
    const [hasUsers, setHasUsers] = useState(true); // Assume users exist initially
    const [error, setError] = useState<string | null>(null);

    const checkHasUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/has-users');
            const data = await res.json();
            setHasUsers(data.hasUsers);
        } catch (e) {
            console.error("Could not check for existing users", e);
            // Default to true to show login form if backend is down
            setHasUsers(true);
        }
    }, []);

    const verifyToken = useCallback(async (tokenToVerify: string) => {
        try {
            const response = await fetch('/api/auth/status', {
                headers: { 'Authorization': `Bearer ${tokenToVerify}` },
            });
            if (response.ok) {
                const userData = await response.json();
                setUser(userData);
            } else {
                // Token is invalid, clear it
                setUser(null);
                setToken(null);
                localStorage.removeItem('authToken');
            }
        } catch (e) {
            console.error('Token verification failed', e);
            setUser(null);
            setToken(null);
            localStorage.removeItem('authToken');
        }
    }, []);

    useEffect(() => {
        const initializeAuth = async () => {
            setIsLoading(true);
            await checkHasUsers();
            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                setToken(storedToken);
                await verifyToken(storedToken);
            }
            setIsLoading(false);
        };
        initializeAuth();
    }, [checkHasUsers, verifyToken]);

    const handleAuth = async (url: string, body: object) => {
        setError(null);
        setIsLoading(true);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'An error occurred.');
            }
            const { token: newToken, user: newUser } = data;
            setToken(newToken);
            setUser(newUser);
            localStorage.setItem('authToken', newToken);
            await checkHasUsers(); // Re-check after registration
        } catch (e) {
            setError((e as Error).message);
            // Clear any potentially bad state
            setUser(null);
            setToken(null);
            localStorage.removeItem('authToken');
        } finally {
            setIsLoading(false);
        }
    };

    const login = (username: string, password: string) => handleAuth('/api/auth/login', { username, password });
    const register = (username: string, password: string) => handleAuth('/api/auth/register', { username, password });

    const logout = async () => {
        setError(null);
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
            } catch (e) {
                console.error("Logout failed on server, clearing client-side anyway.", e);
            }
        }
        setUser(null);
        setToken(null);
        localStorage.removeItem('authToken');
    };

    const value = { user, token, isLoading, hasUsers, error, login, register, logout };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook for using the auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
