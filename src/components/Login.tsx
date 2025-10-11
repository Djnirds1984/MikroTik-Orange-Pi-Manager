import React from 'react';

// FIX: Placeholder component since original source was not provided.
// This is a minimal implementation to resolve build errors.
interface LoginProps {
    onSwitchToForgotPassword: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToForgotPassword }) => {
    // A proper implementation would have state for username/password,
    // call useAuth().login, and handle errors.
    return (
        <div className="w-full max-w-md">
            <h2 className="text-3xl font-bold text-center text-slate-800 dark:text-slate-200">Login</h2>
            <p className="mt-2 text-center text-slate-600 dark:text-slate-400">
                Sign in to your account
            </p>
            {/* Form elements would go here */}
            <div className="mt-4 text-sm text-center">
                <button
                    onClick={onSwitchToForgotPassword}
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                    Forgot your password?
                </button>
            </div>
        </div>
    );
};
