import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, SystemInfo, InterfaceWithHistory, TrafficHistoryPoint, Interface, PanelHostStatus, PppActiveConnection } from '../types.ts';
import { getSystemInfo, getInterfaces, getPppActiveConnections } from '../services/mikrotikService.ts';
import { getPanelHostStatus } from '../services/panelService.ts';
import { Loader } from './Loader.tsx';
import { Chart } from './chart.tsx';
import { RouterIcon, ExclamationTriangleIcon, UsersIcon } from '../constants.tsx';
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

const HostStatusPanel: React.FC = () => {
    const [status, setStatus] = useState<PanelHostStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchHostStatus = useCallback(async () => {
        try {
            const data = await getPanelHostStatus();
            setStatus(data);
            if (error) setError(null);
        } catch (err) {
            setError('Could not load panel host status.');
        }
    }, [error]);

    useEffect(() => {
        fetchHostStatus();
        const interval = setInterval(fetchHostStatus, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [fetchHostStatus]);
    
    if (error && !status) {
        return (
             <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-300 p-4 rounded-lg text-center">
                <p className="font-semibold">Host Panel Error</p>
                <p className="text-sm">{error}</p>
            </div>
        )
    }

    if (!status) {
        return (
             <div className="flex items-center justify-center h-24 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <Loader />
                <p className="ml-4 text-slate-500">Loading Host Panel...</p>
            </div>
        )
    }

    return (
        <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4">Host Panel Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="CPU Usage" value={`${status.cpuUsage.toFixed(1)}%`}>
                     <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${status.cpuUsage}%` }}></div>
                    </div>
                </StatCard>
                <StatCard title="RAM Usage" value={`${status.memory.percent.toFixed(1)}%`}>
                     <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                        <div className="bg-sky-500 h-2.5 rounded-full" style={{ width: `${status.memory.percent}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{status.memory.used} / {status.memory.total}</p>
                </StatCard>
                <StatCard title="SD Card Usage" value={`${status.disk.percent}%`}>
                     <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-2">
                        <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: `${status.disk.percent}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{status.disk.used} / {status.disk.total}</p>
                </StatCard>
            </div>
        </div>
    );
}


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
    const [pppoeCount, setPppoeCount] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<{ message: string; details?: any } | null>(null);
    const [showFixer, setShowFixer] = useState(false);
    const [selectedChartInterface, setSelectedChartInterface] = useState<string | null>(null);

    // FIX: The type for setInterval in the browser is `number`, not `NodeJS.Timeout`.
    const intervalRef = useRef<number | null>(null);

    const fetchData = useCallback(async (isInitial = false) => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSystemInfo(null);
            setInterfaces([]);
            setPppoeCount(0);
            return;
        }

        if (isInitial) {
            setIsLoading(true);
            setError(null);
            setShowFixer(false);
            setInterfaces([]);
            setSelectedChartInterface(null);
            setPppoeCount(0);
        }

        try {
            const [info, currentInterfaces, pppoeActive] = await Promise.all([
                getSystemInfo(selectedRouter),
                getInterfaces(selectedRouter),
                getPppActiveConnections(selectedRouter).catch(() => []), // Add catch to prevent Promise.all failure if PPP package is not installed
            ]);
            setSystemInfo(info);

            if (Array.isArray(pppoeActive)) {
                 setPppoeCount(pppoeActive.length);
            } else {
                 setPppoeCount(0);
                 console.warn("Could not fetch PPPoE active connections, response was not an array:", pppoeActive);
            }


            setInterfaces(prevInterfaces => {
                const now = new Date().toLocaleTimeString();
                
                // FIX: Add a defensive check to ensure currentInterfaces is an array before mapping.
                // This prevents the ".map is not a function" error if the API returns an unexpected response.
                if (!Array.isArray(currentInterfaces)) {
                    console.error("Received non-array data for interfaces:", currentInterfaces);
                    // Return previous state to avoid crashing the UI
                    return prevInterfaces;
                }

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

            if (error) setError(null);
        } catch (err) {
            console.error("Dashboard fetch error:", err);
            setError({
                message: `Failed to fetch data from ${selectedRouter.name}. Check connection and credentials.`,
                details: err,
            });
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        } finally {
            if (isInitial) {
                setIsLoading(false);
            }
        }
    }, [selectedRouter, error]);

    useEffect(() => {
        if (selectedRouter) {
            fetchData(true);
            intervalRef.current = window.setInterval(() => fetchData(false), 2000);
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
    
    const etherInterfaces = useMemo(() => interfaces.filter(i => i.type.startsWith('ether')), [interfaces]);
    const chartData = useMemo(() => interfaces.find(i => i.name === selectedChartInterface), [interfaces, selectedChartInterface]);

    useEffect(() => {
        if (!selectedChartInterface && etherInterfaces.length > 0) {
            setSelectedChartInterface(etherInterfaces[0].name);
        }
    }, [etherInterfaces, selectedChartInterface]);


    if (!selectedRouter) {
        return (
            <div className="space-y-8">
                 <HostStatusPanel />
                 <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <RouterIcon className="w-24 h-24 text-slate-300 dark:text-slate-700 mb-4" />
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Welcome to the Dashboard</h2>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router from the top bar to view its status.</p>
                </div>
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
            <HostStatusPanel />

            <div className="border-t border-slate-200 dark:border-slate-700"></div>

            {systemInfo && (
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4">Router Status: {selectedRouter.name}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
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
                        <StatCard title="PPPoE Active" value={pppoeCount}>
                             <UsersIcon className="w-6 h-6 text-slate-400 mt-2" />
                        </StatCard>
                    </div>
                </div>
            )}
            
            {selectedRouter && chartData && etherInterfaces.length > 0 && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Live Interface Traffic</h4>
                        <select
                            value={selectedChartInterface || ''}
                            onChange={(e) => setSelectedChartInterface(e.target.value)}
                            className="mt-2 sm:mt-0 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white"
                            aria-label="Select interface to view traffic"
                        >
                            {etherInterfaces.map(iface => (
                                <option key={iface.name} value={iface.name}>{iface.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm">
                            <p>RX: <span className="font-semibold text-green-600 dark:text-green-400">{formatBps(chartData.rxRate)}</span></p>
                            <p>TX: <span className="font-semibold text-sky-600 dark:text-sky-400">{formatBps(chartData.txRate)}</span></p>
                        </div>
                        <div className="h-64 mt-2">
                           <Chart trafficHistory={chartData.trafficHistory} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};