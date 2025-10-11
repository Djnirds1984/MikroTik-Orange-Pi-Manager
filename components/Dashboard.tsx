
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { RouterConfigWithId, SystemResource, RouterboardInfo, Interface, TrafficHistoryPoint } from '../types.ts';
import { getSystemResource, getRouterboardInfo, getInterfaces, getInterfaceTraffic } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { Chart } from './chart.tsx';
import { RouterIcon } from '../constants.tsx';

const StatCard: React.FC<{ title: string; value: React.ReactNode; subValue?: string }> = ({ title, value, subValue }) => (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subValue}</p>}
    </div>
);

const TrafficCard: React.FC<{ title: string; history: TrafficHistoryPoint[]; rx: number; tx: number; }> = ({ title, history, rx, tx }) => {
    const formatBps = (bps: number): string => {
        if (bps < 1000) return `${bps.toFixed(0)} bps`;
        if (bps < 1000 * 1000) return `${(bps / 1000).toFixed(1)} Kbps`;
        if (bps < 1000 * 1000 * 1000) return `${(bps / (1000 * 1000)).toFixed(1)} Mbps`;
        return `${(bps / (1000 * 1000 * 1000)).toFixed(1)} Gbps`;
    };
    
    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 col-span-1 md:col-span-2">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-grow h-40">
                    <Chart trafficHistory={history} />
                </div>
                <div className="flex-shrink-0 space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                        <span>Download:</span>
                        <span className="font-mono font-semibold">{formatBps(rx)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-sky-500 rounded-full"></span>
                        <span>Upload:</span>
                        <span className="font-mono font-semibold">{formatBps(tx)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Dashboard: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [resource, setResource] = useState<SystemResource | null>(null);
    const [board, setBoard] = useState<RouterboardInfo | null>(null);
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [trafficHistory, setTrafficHistory] = useState<TrafficHistoryPoint[]>([]);
    const [currentTraffic, setCurrentTraffic] = useState({ rx: 0, tx: 0 });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wanInterface = useMemo(() => {
        return interfaces.find(i => i.name.toLowerCase().includes('ether1') || i.name.toLowerCase().includes('wan')) || interfaces[0];
    }, [interfaces]);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const [res, brd, ifaces] = await Promise.all([
                getSystemResource(selectedRouter),
                getRouterboardInfo(selectedRouter).catch(() => null), // Not all devices have a routerboard (e.g., CHR)
                getInterfaces(selectedRouter),
            ]);
            setResource(res);
            setBoard(brd);
            setInterfaces(ifaces.filter(i => !i.disabled));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
        setTrafficHistory([]); // Reset history on router change
    }, [fetchData]);

    useEffect(() => {
        if (!selectedRouter || !wanInterface) return;

        const interval = setInterval(async () => {
            try {
                const traffic = await getInterfaceTraffic(selectedRouter, wanInterface.name);
                const rx = parseInt(traffic['rx-bits-per-second'], 10);
                const tx = parseInt(traffic['tx-bits-per-second'], 10);
                setCurrentTraffic({ rx, tx });
                setTrafficHistory(prev => [...prev.slice(-29), { rx, tx, timestamp: Date.now() }]);
            } catch (err) {
                console.error("Traffic poll failed:", err);
                // Don't set a visible error for polling failures to avoid being intrusive
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [selectedRouter, wanInterface]);

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center bg-white dark:bg-slate-800 rounded-lg p-8">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Welcome to the Dashboard</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router from the top bar to view its status.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader />
            </div>
        );
    }
    
    if (error) {
        return <div className="p-4 bg-red-100 text-red-700 rounded-md dark:bg-red-900/50 dark:text-red-300">{error}</div>;
    }

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Uptime" value={resource?.uptime || 'N/A'} />
                <StatCard title="CPU Load" value={resource ? `${resource['cpu-load']}%` : 'N/A'} />
                <StatCard 
                    title="Memory Usage" 
                    value={resource ? `${formatBytes(resource['total-memory'] - resource['free-memory'])}` : 'N/A'}
                    subValue={resource ? `of ${formatBytes(resource['total-memory'])}` : ''}
                />
                <StatCard 
                    title="Disk Space" 
                    value={resource ? `${formatBytes(resource['total-hdd-space'] - resource['free-hdd-space'])}` : 'N/A'}
                    subValue={resource ? `of ${formatBytes(resource['total-hdd-space'])}` : ''}
                />
                <StatCard title="Model" value={board?.model || 'N/A'} subValue={board ? `SN: ${board['serial-number']}` : 'Virtual Router'} />
                <StatCard title="RouterOS Version" value={resource?.version || 'N/A'} subValue={board ? `Firmware: ${board['current-firmware']}` : ''} />
            </div>
            {wanInterface && (
                 <TrafficCard 
                    title={`Live Traffic (${wanInterface.name})`} 
                    history={trafficHistory} 
                    rx={currentTraffic.rx} 
                    tx={currentTraffic.tx} 
                />
            )}
        </div>
    );
};
