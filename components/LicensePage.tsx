import React, { useState } from 'react';
import { useLicense } from '../contexts/LicenseContext.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Loader } from './Loader.tsx';
import { MikroTikLogoIcon, KeyIcon } from '../constants.tsx';

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="text-sm text-[--color-primary-600] hover:underline">
            {copied ? 'Copied!' : 'Copy'}
        </button>
    );
};

export const LicensePage: React.FC = () => {
    const { hwid, activate, isLoading, error } = useLicense();
    const { logout } = useAuth();
    const [licenseKey, setLicenseKey] = useState('');
    const [activationMessage, setActivationMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setActivationMessage(null);
        try {
            const result = await activate(licenseKey);
            if (result.isValid) {
                // Success is handled by the context which will re-render App.tsx
                // The page will automatically switch.
            } else {
                setActivationMessage(result.message || 'Activation failed.');
            }
        } catch (err) {
            setActivationMessage((err as Error).message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
                <MikroTikLogoIcon className="mx-auto h-12 w-auto text-[--color-primary-500]" />
                <h2 className="mt-4 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                    Panel Activation
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Your panel requires a valid license key to proceed.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
                <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-slate-200 dark:border-slate-700">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Your Hardware ID</label>
                            <div className="mt-1 flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700 rounded-md">
                                {hwid ? (
                                    <>
                                        <span className="font-mono text-slate-800 dark:text-slate-200">{hwid}</span>
                                        <CopyButton textToCopy={hwid} />
                                    </>
                                ) : (
                                    <span className="text-slate-500">Loading...</span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">Provide this ID to your administrator to generate a license key.</p>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                             { (error || activationMessage) && (
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded-md text-red-700 dark:text-red-300 text-sm">
                                    {error || activationMessage}
                                </div>
                            )}

                            <div>
                                <label htmlFor="licenseKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">License Key</label>
                                <div className="mt-1 relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                        <KeyIcon className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <textarea
                                        id="licenseKey"
                                        rows={3}
                                        value={licenseKey}
                                        onChange={(e) => setLicenseKey(e.target.value)}
                                        required
                                        className="block w-full rounded-md border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 py-2 pl-10 pr-3 shadow-sm focus:border-[--color-primary-500] focus:ring-[--color-primary-500] sm:text-sm font-mono"
                                        placeholder="Paste your license key here..."
                                    />
                                </div>
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[--color-primary-600] hover:bg-[--color-primary-700] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--color-primary-500] disabled:opacity-50"
                            >
                                {isLoading ? <Loader /> : 'Activate Panel'}
                            </button>
                        </form>
                    </div>
                </div>

                <p className="mt-4 text-center text-sm">
                    <button onClick={logout} className="font-medium text-slate-600 dark:text-slate-400 hover:text-[--color-primary-500]">
                        Logout
                    </button>
                </p>
            </div>
        </div>
    );
};
