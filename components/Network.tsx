
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, Interface, DhcpLease } from '../types.ts';
import { getInterfaces, getDhcpLeases } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ShareIcon, EthernetIcon } from '../constants.tsx';

const InterfaceCard: React.FC<{ iface: Interface }> = ({ iface }) => {
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className={`p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${iface.disabled ? 'opacity-50' : ''}`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{iface.name}</h3>
                    <p className="text-xs font-mono text-slate-500">{iface.type}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${iface.running ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {iface.running ? 'Running' : 'Stopped'}
                </span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
                <p><span className="font-semibold">MAC:</span> <span className="font-mono">{iface['mac-address']}</span></p>
                <div className="grid grid-cols-2 gap-2">
                    <p><span className="font-semibold">RX:</span> {formatBytes(iface['rx-byte'])}</p>
                    <p><span className="font-semibold">TX:</span> {formatBytes(iface['tx-byte'])}</p>
                </div>
                 {iface.comment && <p className="text-xs italic text-slate-400">Comment: {iface.comment}</p>}
            </div>
        </div>
    );
};

const DhcpLeasesTable: React.FC<{ leases: DhcpLease[] }> = ({ leases }) => (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
             <h3 className="text-xl font-semibold flex items-center gap-2"><EthernetIcon className="w-6 h-6"/> DHCP Leases</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 dark:bg-slate-900/50"><th className="px-6 py-3 text-left">IP Address</th><th className="px-6 py-3 text-left">MAC Address</th><th className="px-6 py-3 text-left">Server</th><th className="px-6 py-3 text-left">Status</th><th className="px-6 py-3 text-left">Expires After</th></tr></thead>
                <tbody>
                    {leases.map(lease => (
                        <tr key={lease['.id']} className="border-b dark:border-slate-700">
                            <td className="px-6 py-4 font-mono">{lease.address}</td>
                            <td className="px-6 py-4 font-mono">{lease['mac-address']}</td>
                            <td className="px-6 py-4">{lease.server}</td>
                            <td className="px-6 py-4">{lease.status}</td>
                            <td className="px-6 py-4">{lease['expires-after']}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);


export const Network: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [leases, setLeases] = useState<DhcpLease[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const [ifaces, dhcpLeases] = await Promise.all([
                getInterfaces(selectedRouter),
                getDhcpLeases(selectedRouter),
            ]);
            setInterfaces(ifaces);
            setLeases(dhcpLeases);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
        return () => clearInterval(interval);
    }, [fetchData]);

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">Network Overview</h2>
                <p className="mt-2 text-slate-500">Please select a router to view its network status.</p>
            </div>
        );
    }
    
    if (isLoading && interfaces.length === 0) { // Only show loader on initial load
        return <div className="flex justify-center p-8"><Loader /></div>;
    }
    
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold mb-4 flex items-center gap-3"><ShareIcon className="w-8 h-8"/> Interfaces</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {interfaces.map(iface => <InterfaceCard key={iface['.id']} iface={iface} />)}
                </div>
            </div>
             <div>
                <DhcpLeasesTable leases={leases} />
            </div>
        </div>
    );
};
