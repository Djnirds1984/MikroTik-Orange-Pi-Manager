import React, { useState, useEffect } from 'react';
import { Loader } from './Loader.tsx';
import { KeyIcon } from '../constants.tsx';
import { getAuthHeader } from '../services/databaseService.ts';

interface LicenseProps {
    onActivationSuccess: () => void;
}

export const License: React.FC<LicenseProps> = ({ onActivationSuccess }) => {
    const [deviceId, setDeviceId] = useState('');
    const [licenseKey, setLicenseKey] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDeviceId = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/api/license/device-id', { headers: getAuthHeader() });
                if (!res.ok) throw new Error('Failed to fetch device ID');
                const data = await res.json();
                setDeviceId(data.deviceId);
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDeviceId();
    }, []);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsActivating(true);
        setError(null);
        try {
            const res = await fetch('/api/license/activate', {
                method: 'POST',
                headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey }),
            });

            const contentType = res.headers.get("content-type");
            if (!res.ok) {
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || `Activation failed with status: ${res.status}`);
                } else {
                    throw new Error(`Activation failed. The server returned an unexpected response.`);
                }
            }
            
            await res.json();
            alert('Activation successful! Redirecting to the dashboard.');
            onActivationSuccess();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsActivating(false);
        }
    };
    
    const copyToClipboard = () => {
        navigator.clipboard.writeText(deviceId);
        alert('Device ID copied to clipboard!');
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center">
                    <KeyIcon className="w-16 h-16 text-[--color-primary-500] mx-auto mb-4" />
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Application is Unlicensed</h2>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">
                        Please provide your Device ID to the administrator to receive a license key.
                    </p>
                </div>

                {isLoading && <div className="flex justify-center my-8"><Loader /></div>}
                
                {error && <div className="my-6 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm">{error}</div>}

                {deviceId && !isLoading && (
                    <div className="my-8">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Your Device ID</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={deviceId}
                                className="flex-grow p-3 font-mono text-sm bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md"
                            />
                            <button onClick={copyToClipboard} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500">Copy</button>
                        </div>
                    </div>
                )}
                
                <form onSubmit={handleActivate} className="space-y-4">
                     <div>
                        <label htmlFor="licenseKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">License Key</label>
                        <textarea
                            id="licenseKey"
                            value={licenseKey}
                            onChange={(e) => setLicenseKey(e.target.value)}
                            required
                            rows={4}
                            className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-[--color-primary-500] focus:border-[--color-primary-500] font-mono text-xs"
                            placeholder="Paste the license key provided by the administrator here."
                        />
                    </div>
                     <div>
                        <button
                            type="submit"
                            disabled={isActivating || !deviceId}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[--color-primary-600] hover:bg-[--color-primary-700] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--color-primary-500] disabled:opacity-50"
                        >
                            {isActivating ? <Loader /> : 'Validate & Activate'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};