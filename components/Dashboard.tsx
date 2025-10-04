import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid
} from 'recharts';
import { getSystemInfo, getInterfaces } from '../services/mikrotikService.ts';
import type { SystemInfo, InterfaceWithHistory, RouterConfigWithId } from '../types.ts';
import { RouterIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';
import { AIFixer } from './AIFixer.tsx';


const DashboardCard: React.FC<{ title: string, children: React.ReactNode, className?: string }> = ({ title, children, className }) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-lg p-6 ${className}`}>
    <h3 className="text-lg font-semibold text-orange-400 mb-4">{title}</h3>
    {children}
  </div>
);

const ProgressBar: React.FC<{ value: number, label: string }> = ({ value, label }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <span className="text-sm font-bold text-slate-200">{value}%</span>
    </div>
    <div className="w-full bg-slate-700 rounded-full h-2.5">
      <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${value}%` }}></div>
    </div>
  </div>
);

const InfoItem: React.FC<{ label: string, value: string | number }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-b-0">
    <span className="text-slate-400 text-sm">{label}</span>
    <span className="text-slate-100 font-mono text-sm">{value}</span>
  </div>
);

const formatRate = (bps: number): string => {
    if (typeof bps !== 'number' || isNaN(bps)) return '0 bps';
    if (bps < 1000) return `${bps} bps`;
    if (bps < 1000000) return `${(bps / 1000).toFixed(2)} kbit/s`;
    if (bps < 1000000000) return `${(bps / 1000000).toFixed(2)} Mbit/s`;
    return `${(bps / 1000000000).toFixed(2)} Gbit/s`;
};

interface DashboardProps {
  selectedRouter: RouterConfigWithId | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ selectedRouter }) => {
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [interfaces, setInterfaces] = useState<InterfaceWithHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedInterfaceName, setSelectedInterfaceName] = useState<string | null>(null);
    const [showAIFixer, setShowAIFixer] = useState(false);

    const initialFetch = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSystemInfo(null);
            setInterfaces([]);
            setSelectedInterfaceName(null);
            setShowAIFixer(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        setShowAIFixer(false);
        try {
            // FIX: Changed from Promise.all to sequential awaits. Some MikroTik routers
            // do not handle concurrent REST API requests well and can return a 400 error.
            // This sequential approach is more reliable.
            const sysInfoData = await getSystemInfo(selectedRouter);
            const interfacesData = await getInterfaces(selectedRouter);
    
            setSystemInfo(sysInfoData);
    
            const interfacesWithHistory = interfacesData.map(iface => {
                const initialRxMbps = iface.rxRate / 1000000;
                const initialTxMbps = iface.txRate / 1000000;
                return {
                    ...iface,
                    trafficHistory: Array(30).fill({ name: '', rx: initialRxMbps, tx: initialTxMbps }),
                };
            });
            setInterfaces(interfacesWithHistory);

            if (interfacesData.length > 0) {
                // Default to the first interface that is not a bridge or dynamic
                const defaultInterface = interfacesData.find(i => i.type !== 'bridge' && !i.name.startsWith('pppoe')) || interfacesData[0];
                setSelectedInterfaceName(defaultInterface.name);
            }
    
          } catch (err) {
            console.error("Failed to fetch dashboard data:", err);
            setError(`Could not connect to router "${selectedRouter.name}". Check its configuration and ensure the backend proxy is running.`);
          } finally {
            setIsLoading(false);
          }
    }, [selectedRouter]);

    useEffect(() => {
        initialFetch();
    }, [initialFetch]);

    useEffect(() => {
        if (!selectedRouter || isLoading || error || interfaces.length === 0) return;

        const interval = setInterval(async () => {
            try {
                const updatedInterfacesData = await getInterfaces(selectedRouter);
                setInterfaces(currentInterfaces =>
                    currentInterfaces.map(currentIface => {
                        const updatedData = updatedInterfacesData.find(u => u.name === currentIface.name);
                        if (!updatedData) return currentIface;

                        const newRxMbps = updatedData.rxRate / 1000000;
                        const newTxMbps = updatedData.txRate / 1000000;

                        const newHistory = [...currentIface.trafficHistory.slice(1), { name: '', rx: Number(newRxMbps.toFixed(2)), tx: Number(newTxMbps.toFixed(2)) }];

                        return {
                            ...currentIface,
                            rxRate: updatedData.rxRate,
                            txRate: updatedData.txRate,
                            trafficHistory: newHistory,
                        };
                    })
                );
            } catch (err) {
                console.error("Failed to poll interface data:", err);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [isLoading, error, interfaces, selectedRouter]);

    const selectedInterfaceData = useMemo(() => 
        interfaces.find(iface => iface.name === selectedInterfaceName),
        [interfaces, selectedInterfaceName]
    );

  if (!selectedRouter) {
    return (
        <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
            <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
            <h2 className="text-2xl font-bold text-slate-200">Welcome to the Dashboard</h2>
            <p className="mt-2 text-slate-400">Please select a router from the dropdown in the header to view its status.</p>
            <p className="mt-1 text-slate-500 text-sm">If you haven't added any routers yet, go to the 'Routers' page.</p>
        </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader />
        <p className="mt-4 text-orange-400">Connecting to {selectedRouter.name}...</p>
      </div>
    );
  }

  if (error || !systemInfo) {
     return (
        <div className="space-y-6">
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load router data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error}</p>
                <div className="mt-6 flex items-center space-x-4">
                     <button onClick={initialFetch} className="px-4 py-2 bg-red-800/50 hover:bg-red-700/50 rounded-lg font-semibold">
                        Try Again
                    </button>
                    <button onClick={() => setShowAIFixer(s => !s)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg font-semibold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 22.5l-.648-1.938a3.375 3.375 0 00-2.655-2.654L11.25 18l1.938-.648a3.375 3.375 0 002.655-2.654L16.75 13.5l.648 1.938a3.375 3.375 0 002.655 2.654L21.75 18l-1.938.648a3.375 3.375 0 00-2.655 2.654z" /></svg>
                        Try AI Fix
                    </button>
                </div>
            </div>
            {showAIFixer && <AIFixer errorMessage={error} routerName={selectedRouter.name} />}
        </div>
     );
  }

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DashboardCard title="System Information">
                <div className="space-y-3">
                    <InfoItem label="Board Name" value={systemInfo.boardName} />
                    <InfoItem label="RouterOS Version" value={systemInfo.version} />
                    <InfoItem label="Uptime" value={systemInfo.uptime} />
                    <InfoItem label="Total Memory" value={systemInfo.totalMemory} />
                </div>
            </DashboardCard>

            <DashboardCard title="Resource Usage">
                <div className="space-y-4 pt-2">
                    <ProgressBar value={systemInfo.cpuLoad} label="CPU Load" />
                    <ProgressBar value={systemInfo.memoryUsage} label="Memory Usage" />
                </div>
            </DashboardCard>
        </div>

        <DashboardCard title="Live Interface Traffic">
            {interfaces.length > 0 && selectedInterfaceData ? (
                <div className="space-y-4">
                    <div>
                        <label htmlFor="interface-selector" className="sr-only">Select Interface</label>
                        <select
                            id="interface-selector"
                            value={selectedInterfaceName || ''}
                            onChange={(e) => setSelectedInterfaceName(e.target.value)}
                            className="block w-full max-w-xs bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm font-mono"
                        >
                            {interfaces.filter(iface => !iface.name.startsWith('pppoe')).map(iface => <option key={iface.name} value={iface.name}>{iface.name}</option>)}
                        </select>
                    </div>

                    <div className="h-80 w-full pt-4">
                        <ResponsiveContainer>
                            <AreaChart data={selectedInterfaceData.trafficHistory} margin={{ top: 5, right: 20, left: 25, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="#64748b" />
                                <YAxis unit="M" tick={{ fill: '#94a3b8', fontSize: 12 }} stroke="#64748b" />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                                        borderColor: '#334155',
                                        fontSize: '12px',
                                        borderRadius: '0.5rem',
                                    }}
                                    labelStyle={{ display: 'none' }}
                                    itemStyle={{ padding: 0 }}
                                    formatter={(value: number, name: string) => [`${value.toFixed(2)} Mbit/s`, name === 'rx' ? 'Download' : 'Upload']}
                                />
                                <Legend wrapperStyle={{ fontSize: '14px' }} />
                                <Area type="monotone" dataKey="rx" stroke="#22d3ee" fill="url(#colorRx)" name="Download" isAnimationActive={false} />
                                <Area type="monotone" dataKey="tx" stroke="#4ade80" fill="url(#colorTx)" name="Upload" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 text-center border-t border-slate-700/50">
                        <div>
                            <p className="text-sm text-slate-400 uppercase tracking-wider">Download</p>
                            <p className="text-3xl font-bold text-cyan-400">{formatRate(selectedInterfaceData.rxRate)}</p>
                        </div>
                         <div>
                            <p className="text-sm text-slate-400 uppercase tracking-wider">Upload</p>
                            <p className="text-3xl font-bold text-green-400">{formatRate(selectedInterfaceData.txRate)}</p>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="text-slate-500 text-center py-8">No interfaces found on this router.</p>
            )}
        </DashboardCard>
    </div>
  );
};