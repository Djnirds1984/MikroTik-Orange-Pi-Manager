
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId, SystemInfo, Interface, InterfaceWithHistory, TrafficHistoryPoint } from '../types.ts';
import { getSystemInfo, getInterfaces } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, WifiIcon, EthernetIcon, TunnelIcon, VlanIcon, ExclamationTriangleIcon, ChipIcon } from '../constants.tsx';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { useTheme } from '../contexts/ThemeContext.tsx';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);


const formatBitsPerSecond = (bits: number): string => {
    if (bits < 1000) return `${bits.toFixed(0)} bps`;
    if (bits < 1000000) return `${(bits / 1000).toFixed(2)} Kbps`;
    if (bits < 1000000000) return `${(bits / 1000000).toFixed(2)} Mbps`;
    return `${(bits / 1000000000).toFixed(2)} Gbps`;
};

const StatCard: React.FC<{ title: string, value: string | number, icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg flex items-center gap-4 border border-slate-200 dark:border-slate-700">
        <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">{icon}</div>
        <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
    </div>
);

const InterfaceIcon: React.FC<{ type: string }> = ({ type }) => {
    const className = "w-6 h-6 text-slate-500 dark:text-slate-400";
    if (type.includes('wlan')) return <WifiIcon className={className} />;
    if (type.includes('ether') || type.includes('sfp')) return <EthernetIcon className={className} />;
    if (type.includes('vlan')) return <VlanIcon className={className} />;
    if (type.includes('tunnel') || type.includes('ppp') || type.includes('l2tp') || type.includes('ovpn')) return <TunnelIcon className={className} />;
    return <RouterIcon className={className} />;
};


const InterfaceCard: React.FC<{ iface: InterfaceWithHistory }> = ({ iface }) => {
    const { isDarkMode } = useTheme();

    const chartData = {
        labels: iface.trafficHistory.map(() => ''),
        datasets: [
            {
                label: 'RX',
                data: iface.trafficHistory.map(p => p.rx),
                borderColor: 'rgba(59, 130, 246, 0.7)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'TX',
                data: iface.trafficHistory.map(p => p.tx),
                borderColor: 'rgba(16, 185, 129, 0.7)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: isDarkMode ? '#94a3b8' : '#64748b',
                    callback: (value: any) => formatBitsPerSecond(value),
                },
                grid: {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                },
            },
            x: {
                ticks: {
                    display: false,
                },
                grid: {
                    display: false,
                },
            },
        },
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                enabled: true,
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${formatBitsPerSecond(context.raw)}`,
                },
            },
        },
    };

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 flex flex-col">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <InterfaceIcon type={iface.type} />
                    <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{iface.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{iface.type}</p>
                    </div>
                </div>
                 <div className="text-right text-xs font-mono">
                    <p className="text-blue-500 dark:text-blue-400">RX: {formatBitsPerSecond(iface.rxRate)}</p>
                    <p className="text-emerald-500 dark:text-emerald-400">TX: {formatBitsPerSecond(iface.txRate)}</p>
                </div>
            </div>
            <div className="flex-grow mt-4 h-24">
                {/* @ts-ignore */}
                <Line options={chartOptions} data={chartData} />
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---

export const Dashboard: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [interfaces, setInterfaces] = useState<InterfaceWithHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const apiCallInFlight = useRef(false);

    const fetchData = useCallback(async (isInitialLoad: boolean) => {
        if (!selectedRouter || apiCallInFlight.current) {
            if (!selectedRouter) {
                setSystemInfo(null);
                setInterfaces([]);
            }
            return;
        }

        if (isInitialLoad) {
            setIsLoading(true);
            setError(null);
            setSystemInfo(null);
            setInterfaces([]);
        }

        apiCallInFlight.current = true;

        try {
            const [info, ifaces] = await Promise.all([
                getSystemInfo(selectedRouter),
                getInterfaces(selectedRouter),
            ]);
            
            setSystemInfo(info);
            setInterfaces(prevInterfaces => {
                // If this is the first load, create new history arrays
                if (prevInterfaces.length === 0) {
                     return ifaces.map(iface => ({
                        ...iface,
                        trafficHistory: Array(20).fill({ name: iface.name, rx: 0, tx: 0 })
                    }));
                }
                // Otherwise, update existing interfaces with new data
                return ifaces.map(currentIface => {
                    const existingIface = prevInterfaces.find(p => p.name === currentIface.name);
                    const newHistoryPoint: TrafficHistoryPoint = { name: currentIface.name, rx: currentIface.rxRate, tx: currentIface.txRate };
                    
                    if (existingIface) {
                        const updatedHistory = [...existingIface.trafficHistory, newHistoryPoint];
                        if (updatedHistory.length > 20) {
                            updatedHistory.shift();
                        }
                        return { ...currentIface, trafficHistory: updatedHistory };
                    }
                    // New interface found
                    return { ...currentIface, trafficHistory: Array(20).fill(newHistoryPoint) };
                });
            });

        } catch (err) {
            console.error('Dashboard fetch error:', err);
            setError(`Failed to fetch data from ${selectedRouter.name}. Please check the connection and API settings. Details: ${(err as Error).message}`);
        } finally {
            if (isInitialLoad) setIsLoading(false);
            apiCallInFlight.current = false;
        }
    }, [selectedRouter]);

    // Initial load and router change effect
    useEffect(() => {
        fetchData(true);
    }, [fetchData]);

    // Polling effect for live data
    useEffect(() => {
        const interval = setInterval(() => {
            fetchData(false);
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, [fetchData]);


    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Welcome to the Dashboard</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router from the top bar to view its status.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-[--color-primary-500] dark:text-[--color-primary-400]">Connecting to {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (error) {
         return (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-6 rounded-lg border border-red-200 dark:border-red-600">
                <div className="flex items-center gap-3">
                    <ExclamationTriangleIcon className="w-8 h-8 flex-shrink-0" />
                    <div>
                        <p className="font-bold text-lg">Connection Error</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            </div>
         );
    }

    return (
        <div className="space-y-6">
            {systemInfo && (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="Board Name" value={systemInfo.boardName} icon={<RouterIcon className="w-6 h-6 text-slate-500" />} />
                    <StatCard title="RouterOS Version" value={systemInfo.version} icon={<span className="font-bold text-2xl text-slate-500">#</span>} />
                    <StatCard title="CPU Load" value={`${systemInfo.cpuLoad}%`} icon={<ChipIcon className="w-6 h-6 text-slate-500" />} />
                    <StatCard title="Uptime" value={systemInfo.uptime} icon={<span className="font-bold text-2xl text-slate-500">↑</span>} />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {interfaces.map(iface => (
                    <InterfaceCard key={iface.name} iface={iface} />
                ))}
            </div>
        </div>
    );
};
