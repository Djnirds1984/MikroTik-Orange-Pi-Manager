import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// This will be declared in types.ts, but we can define it here for context
export interface User {
    id: number;
    username: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    hasUsers: boolean;
    error: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasUsers, setHasUsers] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const clearError = () => setError(null);
    
    const handleApiError = async (response: Response): Promise<string> => {
        if (response.status === 504) {
            return 'The API server is not responding. Please ensure it is running correctly.';
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            return errorData.message || 'An unknown error occurred.';
        }
        const errorText = await response.text();
        return errorText.split('\n')[0] || 'Could not connect to the server.';
    };

    useEffect(() => {
        const checkSession = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const hasUsersRes = await fetch('/api/auth/has-users');
                if (!hasUsersRes.ok) {
                    throw new Error(await handleApiError(hasUsersRes));
                }
                const hasUsersData = await hasUsersRes.json();
                setHasUsers(hasUsersData.hasUsers);

                const sessionRes = await fetch('/api/auth/check-session');
                if (sessionRes.ok) {
                    const sessionData = await sessionRes.json();
                    setUser(sessionData.user);
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error('Failed to check session:', err);
                setError(err.message || 'An error occurred during session check.');
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        checkSession();
    }, []);

    const login = async (username: string, password: string) => {
        clearError();
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (response.ok) {
            const data = await response.json();
            setUser(data.user);
        } else {
            const errorMessage = await handleApiError(response);
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
    };

    const register = async (username: string, password: string) => {
        clearError();
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        
        if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setHasUsers(true);
        } else {
            const errorMessage = await handleApiError(response);
            setError(errorMessage);
            throw new Error(errorMessage);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, hasUsers, error, login, logout, register, clearError }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
