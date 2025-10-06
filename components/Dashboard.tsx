
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RouterConfigWithId, SystemInfo, InterfaceWithHistory, TrafficHistoryPoint, Interface } from '../types.ts';
import { getSystemInfo, getInterfaces } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { Chart } from './chart.tsx';
import { RouterIcon, ExclamationTriangleIcon } from '../constants.tsx';
import { AIFixer } from './AIFixer.tsx';

const StatCard: React.FC<{ title: string; value: string | number; unit?: string; children?: React.ReactNode }> = ({ title, value, unit, children }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
        <div className="mt-2 flex items-baseline">
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
            {unit && <p className="ml-2 text-slate-500 dark:text-slate-400">{unit}</p>}
        </div>
        {children}
    </div>
);

const formatBps = (bps: number): string => {
    if (bps < 1000) return `${bps.toFixed(0)} bps`;
    if (bps < 1000 * 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
    if (bps < 1000 * 1000 * 1000) return `${(bps / (1000 * 1000)).toFixed(2)} Mbps`;
    return `${(bps / (1000 * 1000 * 1000)).toFixed(2)} Gbps`;
};

const MAX_HISTORY_POINTS = 30;

export const Dashboard: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [interfaces, setInterfaces] = useState<InterfaceWithHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<{ message: string; details?: any } | null>(null);
    const [showFixer, setShowFixer] = useState(false);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchData = useCallback(async (isInitial = false) => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSystemInfo(null);
            setInterfaces([]);
            return;
        }

        if (isInitial) {
            setIsLoading(true);
            setError(null);
            setShowFixer(false);
            setInterfaces([]); // Clear old interface data on router change
        }

        try {
            const [info, currentInterfaces] = await Promise.all([
                getSystemInfo(selectedRouter),
                getInterfaces(selectedRouter),
            ]);
            setSystemInfo(info);

            setInterfaces(prevInterfaces => {
                const now = new Date().toLocaleTimeString();
                const newInterfaces = currentInterfaces.map((iface: Interface) => {
                    const existingIface = prevInterfaces.find(p => p.name === iface.name);
                    const newHistoryPoint: TrafficHistoryPoint = { name: now, rx: iface.rxRate, tx: iface.txRate };
                    
                    let newHistory = existingIface ? [...existingIface.trafficHistory, newHistoryPoint] : [newHistoryPoint];
                    if (newHistory.length > MAX_HISTORY_POINTS) {
                        newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_POINTS);
                    }

                    return {
                        ...iface,
                        trafficHistory: newHistory,
                    };
                });
                return newInterfaces;
            });

            if (error) setError(null); // Clear error on success
        } catch (err) {
            console.error("Dashboard fetch error:", err);
            setError({
                message: `Failed to fetch data from ${selectedRouter.name}. Check connection and credentials.`,
                details: err,
            });
            if (intervalRef.current) {
                clearInterval(intervalRef.current); // Stop polling on error
            }
        } finally {
            if (isInitial) {
                setIsLoading(false);
            }
        }
    }, [selectedRouter, error]);

    useEffect(() => {
        if (selectedRouter) {
            fetchData(true); // Initial fetch
            intervalRef.current = setInterval(() => fetchData(false), 2000); // Poll every 2 seconds
        } else {
            setIsLoading(false);
            setSystemInfo(null);
            setInterfaces([]);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [selectedRouter, fetchData]);

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-24 h-24 text-slate-300 dark:text-slate-700 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Welcome to the Dashboard</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router from the top bar to view its status.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <Loader />
                <p className="mt-4 text-[--color-primary-500]">Connecting to {selectedRouter.name}...</p>
            </div>
        );
    }

    if (error) {
        const errorMessage = (error.details as Error)?.message || error.message;
        return (
             <div>
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-300 p-6 rounded-lg text-center">
                    <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-4 text-red-500 dark:text-red-400" />
                    <h3 className="text-lg font-bold">Connection Error</h3>
                    <p className="mt-2 text-sm">{errorMessage}</p>
                    <div className="flex justify-center gap-4 mt-4">
                        <button onClick={() => fetchData(true)} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">
                           Try Again
                        </button>
                        <button onClick={() => setShowFixer(!showFixer)} className="px-4 py-2 text-sm bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded-md hover:bg-sky-200 dark:hover:bg-sky-800">
                            {showFixer ? 'Hide AI Fixer' : 'Try AI Fixer'}
                        </button>
                    </div>
                </div>
                {showFixer && <AIFixer errorMessage={errorMessage} routerName={selectedRouter.name} />}
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {systemInfo && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Board Name" value={systemInfo.boardName} />
                    <StatCard title="Uptime" value={systemInfo.uptime} />
                    <StatCard title="CPU Load" value={systemInfo.cpuLoad} unit="%">
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${systemInfo.cpuLoad}%` }}></div>
                        </div>
                    </StatCard>
                     <StatCard title="Memory Usage" value={systemInfo.memoryUsage} unit={`% of ${systemInfo.totalMemory}`}>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                            <div className="bg-sky-500 h-2.5 rounded-full" style={{ width: `${systemInfo.memoryUsage}%` }}></div>
                        </div>
                    </StatCard>
                </div>
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {interfaces.map(iface => (
                    <div key={iface.name} className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100">{iface.name} <span className="text-xs font-mono text-slate-500 dark:text-slate-400 ml-2">{iface.type}</span></h4>
                        <div className="flex justify-between text-sm mt-2">
                            <p>RX: <span className="font-semibold text-green-600 dark:text-green-400">{formatBps(iface.rxRate)}</span></p>
                            <p>TX: <span className="font-semibold text-sky-600 dark:text-sky-400">{formatBps(iface.txRate)}</span></p>
                        </div>
                        <div className="h-40 mt-2">
                           <Chart trafficHistory={iface.trafficHistory} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
