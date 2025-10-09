import React, { useState, useEffect, useRef } from 'react';
import type { NodeMcuStatus } from '../types.ts';
import { getVendingStatus } from '../services/nodeMcuService.ts';
import { ChipIcon, CurrencyDollarIcon, UsersIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';

const StatCard: React.FC<{ title: string; value: string | number; children?: React.ReactNode }> = ({ title, value, children }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 relative">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
        <div className="mt-2 flex items-baseline">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        {children}
    </div>
);


export const NodeMcuManager: React.FC = () => {
    const [deviceIp, setDeviceIp] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [statusData, setStatusData] = useState<NodeMcuStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    
    const intervalRef = useRef<number | null>(null);

    const fetchData = async () => {
        if (!deviceIp || !apiKey) return;
        
        // Don't show loader for background refreshes
        if (!isConnected) {
            setIsLoading(true);
        }
        setError(null);
        
        try {
            const data = await getVendingStatus(deviceIp, apiKey);
            setStatusData(data);
            setIsConnected(true);
        } catch (err) {
            setError((err as Error).message);
            setIsConnected(false); // Disconnect on error
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);
    
    useEffect(() => {
        if (isConnected) {
            // Can't use `fetchData` directly in setInterval due to stale closure
            const fetcher = () => {
                 if (!deviceIp || !apiKey) return;
                 getVendingStatus(deviceIp, apiKey).then(setStatusData).catch(err => {
                    setError((err as Error).message);
                    setIsConnected(false);
                 });
            };
            intervalRef.current = window.setInterval(fetcher, 10000); // Refresh every 10 seconds
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
        // dependency array needs deviceIp and apiKey to create new interval with correct values if they change
    }, [isConnected, deviceIp, apiKey]);

    const handleDisconnect = () => {
        setIsConnected(false);
        setStatusData(null);
        setError(null);
    };

    if (isConnected && statusData) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Connected to Vendo Machine</h3>
                        <p className="text-sm font-mono text-cyan-600 dark:text-cyan-400">{deviceIp}</p>
                    </div>
                    <button onClick={handleDisconnect} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg">Disconnect</button>
                </div>
                 {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-300">
                        Connection lost: {error}
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <StatCard title="Total Sales" value={statusData.sales.toLocaleString()}>
                        <CurrencyDollarIcon className="w-8 h-8 text-green-500 absolute top-4 right-4 opacity-30" />
                    </StatCard>
                     <StatCard title="Connected Devices" value={statusData.connected_users}>
                        <UsersIcon className="w-8 h-8 text-sky-500 absolute top-4 right-4 opacity-30" />
                    </StatCard>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md max-w-lg mx-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                 <ChipIcon className="w-6 h-6 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                 <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">Connect to Vendo Machine</h3>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); fetchData(); }} className="p-6 space-y-4">
                 {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-300">
                        {error}
                    </div>
                )}
                <div>
                    <label htmlFor="deviceIp" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Device IP Address</label>
                    <input type="text" id="deviceIp" value={deviceIp} onChange={e => setDeviceIp(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., 10.5.50.254" />
                </div>
                 <div>
                    <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                    <input type="password" id="apiKey" value={apiKey} onChange={e => setApiKey(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                </div>
                 <div className="pt-2">
                    <button type="submit" disabled={isLoading} className="w-full bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50">
                        {isLoading ? <Loader /> : 'Fetch Data'}
                    </button>
                </div>
            </form>
        </div>
    );
};