import React, { ReactNode } from 'react';

// FIX: Placeholder component since original source was not provided.
// This is a minimal implementation to resolve build errors.
interface AuthLayoutProps {
    children: ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-lg dark:bg-slate-900">
                {children}
            </div>
        </div>
    );
};
