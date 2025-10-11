// src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import type { User } from '../types'; // Assuming you'll have a User type in types.ts

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    hasUsers: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasUsers, setHasUsers] = useState(true);

    const handleApiError = async (response: Response): Promise<string> => {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            return errorData.message || 'An unknown error occurred.';
        }
        // If it's not JSON, it might be a server error page (HTML) or plain text
        const errorText = await response.text();
        // Return the first line or a snippet of the error
        return errorText.split('\n')[0] || 'Could not connect to the server.';
    };

    useEffect(() => {
        const checkSession = async () => {
            setIsLoading(true);
            try {
                // First, check if any users exist to guide the UI (register vs login)
                const hasUsersRes = await fetch('/api/auth/has-users');
                if (hasUsersRes.ok) {
                    const data = await hasUsersRes.json();
                    setHasUsers(data.hasUsers);
                } else {
                    // Assume users exist if this check fails, to be safe
                    setHasUsers(true);
                }

                // Then, check for an active session
                const sessionRes = await fetch('/api/auth/check-session');
                if (sessionRes.ok) {
                    const data = await sessionRes.json();
                    setUser(data.user);
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error('Failed to check session:', error);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        checkSession();
    }, []);

    const login = async (username: string, password: string) => {
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
            throw new Error(errorMessage);
        }
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
    };

    const register = async (username: string, password: string) => {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        
        if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setHasUsers(true); // After first registration, this should be true
        } else {
            const errorMessage = await handleApiError(response);
            throw new Error(errorMessage);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, hasUsers, login, logout, register }}>
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

// Add a basic User type to types.ts if it's not there
declare module '../types' {
    export interface User {
        id: number;
        username: string;
    }
}
