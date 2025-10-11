import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { KeyIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';

interface LoginProps {
    onSwitchToForgotPassword: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToForgotPassword }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login, error, clearError } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        clearError();
        try {
            await login(username, password);
            // On success, the AuthProvider will update the state and the AppRouter will render AppContent
        } catch (err) {
            // The error is already set in the context, just log it for debugging
            console.error("Login failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="flex flex-col items-center">
                <div className="p-3 rounded-full bg-slate-200 dark:bg-slate-700">
                    <KeyIcon className="w-8 h-8 text-[--color-primary-600]" />
                </div>
                <h2 className="mt-4 text-3xl font-bold text-center text-slate-800 dark:text-slate-200">
                    Login to Panel
                </h2>
            </div>
            
            {error && (
                 <div className="p-3 mt-6 text-sm text-center text-red-800 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/20 dark:border-red-500/50 dark:text-red-300">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div className="relative">
                    <label className="sr-only" htmlFor="username">
                        Username
                    </label>
                    <input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[--color-primary-500]"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>
                <div className="relative">
                     <label className="sr-only" htmlFor="password">
                        Password
                    </label>
                    <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[--color-primary-500]"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                     <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 dark:text-slate-400"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex items-center justify-end text-sm">
                    <button
                        type="button"
                        onClick={onSwitchToForgotPassword}
                        className="font-medium text-[--color-primary-600] hover:text-[--color-primary-500] dark:text-[--color-primary-400] dark:hover:text-[--color-primary-300]"
                    >
                        Forgot Password?
                    </button>
                </div>

                <div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full px-4 py-3 font-semibold text-white bg-[--color-primary-600] rounded-md hover:bg-[--color-primary-700] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--color-primary-500] disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Signing in...' : 'Sign in'}
                    </button>
                </div>
            </form>
        </>
    );
};
