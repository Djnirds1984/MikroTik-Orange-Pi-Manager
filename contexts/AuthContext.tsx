import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// PanelUser type is missing from types.ts. I'll define it here based on usage.
interface PanelUser {
    id: number;
    username: string;
    role: string;
    is_superadmin?: boolean;
    permissions?: string[];
}

interface AuthContextType {
    user: PanelUser | null;
    token: string | null;
    isLoading: boolean;
    hasUsers: boolean;
    error: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, securityQuestions: { question: string, answer: string }[]) => Promise<void>;
    logout: () => void;
    getSecurityQuestions: (username: string) => Promise<string[]>;
    resetPassword: (username: string, answers: string[], newPassword: string) => Promise<{ success: boolean; message: string; }>;
    clearError: () => void;
    hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<PanelUser | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));
    const [isLoading, setIsLoading] = useState(true);
    const [hasUsers, setHasUsers] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const clearError = () => setError(null);

    const checkHasUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/has-users');
            const data = await res.json();
            setHasUsers(data.hasUsers);
        } catch (err) {
            console.error('Could not check for existing users', err);
            setHasUsers(true); // Assume users exist on error to prevent registration bypass
        }
    }, []);

    const verifyToken = useCallback(async (authToken: string) => {
        try {
            const res = await fetch('/api/auth/status', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
            } else {
                setUser(null);
                setToken(null);
                localStorage.removeItem('authToken');
            }
        } catch (err) {
            console.error('Token verification failed', err);
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
    
    const handleAuthRequest = async (url: string, body: object) => {
        setError(null);
        setIsLoading(true);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'An error occurred.');
            }
            const { token: newToken, user: newUser } = data;
            setToken(newToken);
            setUser(newUser);
            localStorage.setItem('authToken', newToken);
            await checkHasUsers();
        } catch (err) {
            setError((err as Error).message);
            setUser(null);
            setToken(null);
            localStorage.removeItem('authToken');
        } finally {
            setIsLoading(false);
        }
    };
    
    const login = (username: string, password: string) => handleAuthRequest('/api/auth/login', { username, password });
    const register = (username: string, password: string, securityQuestions: any[]) => handleAuthRequest('/api/auth/register', { username, password, securityQuestions });
    
    const logout = async () => {
        setError(null);
        if (token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (err) {
                console.error("Logout failed on server, clearing client-side anyway.", err);
            }
        }
        setUser(null);
        setToken(null);
        localStorage.removeItem('authToken');
    };
    
     const getSecurityQuestions = async (username: string): Promise<string[]> => {
        try {
            const res = await fetch(`/api/auth/security-questions/${encodeURIComponent(username)}`);
            if (!res.ok) {
                throw new Error('Could not fetch security questions.');
            }
            const data = await res.json();
            return data.questions || [];
        } catch (err) {
            console.error("Failed to get security questions", err);
            setError((err as Error).message);
            return [];
        }
    };
    
    const resetPassword = async (username: string, answers: string[], newPassword: string): Promise<{ success: boolean; message: string; }> => {
        setError(null);
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, answers, newPassword })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'An error occurred.');
            }
            return { success: true, message: data.message };
        } catch (err) {
            setError((err as Error).message);
            return { success: false, message: (err as Error).message };
        } finally {
            setIsLoading(false);
        }
    };

    const hasPermission = (permission: string): boolean => {
        if (!user) return false;
        // Superadmin flag is the ultimate override
        if (user.is_superadmin) return true;

        if (!user.permissions) return false;
        
        const [requiredResource] = permission.split(':', 1);

        // Check for 'resource:*' or '*:*' wildcards, or the exact permission
        return user.permissions.some(p => 
            p === permission || 
            p === `${requiredResource}:*` || 
            p === '*:*'
        );
    };

    const value = { user, token, isLoading, hasUsers, error, login, register, logout, getSecurityQuestions, resetPassword, clearError, hasPermission };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};