import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getSystemInfo, getInterfaces, getHotspotClients } from '../services/mikrotikService';
import type { SystemInfo, InterfaceWithHistory, HotspotClient, Interface } from '../types';
import { EthernetIcon, WifiIcon, TunnelIcon, VlanIcon } from '../constants';
import { Loader } from './Loader';


const DashboardCard: React.FC<{ title: string, children: React.ReactNode, className?: string }> = ({ title, children, className }) => (
  <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${className}`}>
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

const getInterfaceIcon = (type: string) => {
    switch (type) {
        case 'ether': return <EthernetIcon className="w-5 h-5 text-sky-400" />;
        case 'wlan': return <WifiIcon className="w-5 h-5 text-green-400" />;
        case 'eoip': return <TunnelIcon className="w-5 h-5 text-purple-400" />;
        case 'vlan': return <VlanIcon className="w-5 h-5 text-yellow-400" />;
        default: return <EthernetIcon className="w-5 h-5 text-slate-500" />;
    }
}

const formatRate = (bps: number): string => {
    if (typeof bps !== 'number' || isNaN(bps)) return '0 bps';
    if (bps < 1000) return `${bps} bps`;
    if (bps < 1000000) return `${(bps / 1000).toFixed(2)} kbit/s`;
    if (bps < 1000000000) return `${(bps / 1000000).toFixed(2)} Mbit/s`;
    return `${(bps / 1000000000).toFixed(2)} Gbit/s`;
};

export const Dashboard: React.FC = () => {
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [interfaces, setInterfaces] = useState<InterfaceWithHistory[]>([]);
    const [hotspotClients, setHotspotClients] = useState<HotspotClient[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const initialFetch = useCallback(async () => {
        try {
            const [sysInfoData, interfacesData, hotspotData] = await Promise.all([
              getSystemInfo(),
              getInterfaces(),
              getHotspotClients(),
            ]);
    
            setSystemInfo(sysInfoData);
            setHotspotClients(hotspotData);
    
            const interfacesWithHistory = interfacesData.map(iface => {
                const initialRxMbps = iface.rxRate / 1000000;
                const initialTxMbps = iface.txRate / 1000000;
                return {
                    ...iface,
                    trafficHistory: Array(20).fill({ rx: initialRxMbps, tx: initialTxMbps }),
                };
            });
            setInterfaces(interfacesWithHistory);
    
          } catch (err) {
            console.error("Failed to fetch dashboard data:", err);
            setError("Could not connect to the router. Please ensure the backend proxy is running and configured correctly.");
          } finally {
            setIsLoading(false);
          }
    }, []);

    useEffect(() => {
        initialFetch();
    }, [initialFetch]);

    useEffect(() => {
        if (isLoading || error || interfaces.length === 0) return;

        const interval = setInterval(async () => {
            try {
                const updatedInterfacesData = await getInterfaces();
                setInterfaces(currentInterfaces =>
                    currentInterfaces.map(currentIface => {
                        const updatedData = updatedInterfacesData.find(u => u.name === currentIface.name);
                        if (!updatedData) return currentIface;

                        const newRxMbps = updatedData.rxRate / 1000000;
                        const newTxMbps = updatedData.txRate / 1000000;

                        const newHistory = [...currentIface.trafficHistory.slice(1), { rx: Number(newRxMbps.toFixed(2)), tx: Number(newTxMbps.toFixed(2)) }];

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
                // Optionally set an error state for polling failures
            }
        }, 2000); // Poll for new data every 2 seconds

        return () => clearInterval(interval);
    }, [isLoading, error, interfaces]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader />
        <p className="mt-4 text-orange-400">Connecting to router...</p>
      </div>
    );
  }

  if (error || !systemInfo) {
     return (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
            <p className="text-xl font-semibold text-red-400">Failed to load router data.</p>
            <p className="mt-2 text-slate-400 text-sm">{error}</p>
        </div>
     );
  }

  return (
    <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DashboardCard title="System Information" className="md:col-span-2 lg:col-span-1">
                <div className="space-y-3">
                    <InfoItem label="Board Name" value={systemInfo.boardName} />
                    <InfoItem label="RouterOS Version" value={systemInfo.version} />
                    <InfoItem label="Uptime" value={systemInfo.uptime} />
                    <InfoItem label="Total Memory" value={systemInfo.totalMemory} />
                </div>
            </DashboardCard>

            <DashboardCard title="Resource Usage">
                <div className="space-y-4">
                    <ProgressBar value={systemInfo.cpuLoad} label="CPU Load" />
                    <ProgressBar value={systemInfo.memoryUsage} label="Memory Usage" />
                </div>
            </DashboardCard>

            <DashboardCard title="Hotspot Clients">
                {hotspotClients.length > 0 ? (
                    <div className="flow-root">
                        <ul role="list" className="-my-2 divide-y divide-slate-700">
                            {hotspotClients.map(client => (
                                <li key={client.macAddress} className="py-3 flex items-center justify-between">
                                    <p className="text-sm font-mono text-slate-300">{client.macAddress}</p>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400">{client.uptime}</p>
                                        <p className="text-xs font-semibold text-green-400">{client.signal}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : <p className="text-slate-500 text-sm">No active hotspot clients.</p>}
            </DashboardCard>
            
            <DashboardCard title="Interface Traffic" className="md:col-span-2 lg:col-span-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800">
                            <tr>
                                <th scope="col" className="px-4 py-2 w-12"></th>
                                <th scope="col" className="px-4 py-2">Name</th>
                                <th scope="col" className="px-4 py-2">Live Traffic (Mbit/s)</th>
                                <th scope="col" className="px-4 py-2 text-right">RX</th>
                                <th scope="col" className="px-4 py-2 text-right">TX</th>
                            </tr>
                        </thead>
                        <tbody>
                           {interfaces.map(iface => (
                                <tr key={iface.name} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-4 py-1">{getInterfaceIcon(iface.type)}</td>
                                    <td className="px-4 py-1 font-mono text-slate-200">{iface.name}</td>
                                    <td className="px-4 py-1 h-16 w-2/5">
                                        <ResponsiveContainer width="100%" height={50}>
                                            <LineChart data={iface.trafficHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                                                        borderColor: '#334155',
                                                        fontSize: '12px',
                                                        borderRadius: '0.5rem',
                                                    }}
                                                    labelStyle={{ display: 'none' }}
                                                    itemStyle={{ padding: 0 }}
                                                    formatter={(value: number, name: string) => [`${value.toFixed(2)} Mbit/s`, name.toUpperCase()]}
                                                />
                                                <Line type="monotone" dataKey="rx" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} name="RX" />
                                                <Line type="monotone" dataKey="tx" stroke="#4ade80" strokeWidth={2} dot={false} isAnimationActive={false} name="TX" />
                                                <YAxis domain={['auto', 'auto']} hide={true} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </td>
                                    <td className="px-4 py-1 text-right font-mono text-cyan-400">{formatRate(iface.rxRate)}</td>
                                    <td className="px-4 py-1 text-right font-mono text-green-400">{formatRate(iface.txRate)}</td>
                                </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
            </DashboardCard>
        </div>
    </div>
  );
};