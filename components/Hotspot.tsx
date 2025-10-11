
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotServer, HotspotActiveUser, HotspotHost } from '../types.ts';
import { getHotspotServers, getHotspotActiveUsers, getHotspotHosts } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { NodeMcuManager } from './NodeMcuManager.tsx';
import { RouterIcon, WifiIcon, UsersIcon, ChipIcon } from '../constants.tsx';

const TabButton: React.FC<{ label: string, count: number, isActive: boolean, onClick: () => void, icon: React.ReactNode }> = ({ label, count, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 ${
            isActive
                ? 'border-[--color-primary-500] text-[--color-primary-500]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
        }`}
    >
        {icon}
        {label}
        <span className={`px-2 py-0.5 rounded-full text-xs ${isActive ? 'bg-[--color-primary-500] text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{count}</span>
    </button>
);

const ServersView: React.FC<{ servers: HotspotServer[] }> = ({ servers }) => (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
        <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 dark:bg-slate-900/50"><th className="px-6 py-3 text-left">Name</th><th className="px-6 py-3 text-left">Interface</th><th className="px-6 py-3 text-left">Address Pool</th><th className="px-6 py-3 text-left">Profile</th></tr></thead>
            <tbody>
                {servers.map(s => <tr key={s.id} className="border-b dark:border-slate-700"><td className="px-6 py-4">{s.name}</td><td className="px-6 py-4">{s.interface}</td><td className="px-6 py-4">{s['address-pool']}</td><td className="px-6 py-4">{s.profile}</td></tr>)}
            </tbody>
        </table>
    </div>
);

const ActiveUsersView: React.FC<{ users: HotspotActiveUser[] }> = ({ users }) => (
     <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
        <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 dark:bg-slate-900/50"><th className="px-6 py-3 text-left">User</th><th className="px-6 py-3 text-left">Address</th><th className="px-6 py-3 text-left">Uptime</th><th className="px-6 py-3 text-left">Time Left</th></tr></thead>
            <tbody>
                {users.map(u => <tr key={u.id} className="border-b dark:border-slate-700"><td className="px-6 py-4">{u.user}</td><td className="px-6 py-4">{u.address}</td><td className="px-6 py-4">{u.uptime}</td><td className="px-6 py-4">{u['session-time-left']}</td></tr>)}
            </tbody>
        </table>
    </div>
);

const HostsView: React.FC<{ hosts: HotspotHost[] }> = ({ hosts }) => (
     <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
        <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 dark:bg-slate-900/50"><th className="px-6 py-3 text-left">Address</th><th className="px-6 py-3 text-left">MAC Address</th><th className="px-6 py-3 text-left">Server</th><th className="px-6 py-3 text-left">Status</th></tr></thead>
            <tbody>
                {hosts.map(h => <tr key={h.id} className="border-b dark:border-slate-700"><td className="px-6 py-4">{h.address}</td><td className="px-6 py-4">{h['mac-address']}</td><td className="px-6 py-4">{h.server}</td><td className="px-6 py-4">{h.authorized ? 'Authorized' : 'Not Authorized'}</td></tr>)}
            </tbody>
        </table>
    </div>
);

export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'servers' | 'active' | 'hosts' | 'nodemcu'>('active');
    const [servers, setServers] = useState<HotspotServer[]>([]);
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const [s, a, h] = await Promise.all([
                getHotspotServers(selectedRouter),
                getHotspotActiveUsers(selectedRouter),
                getHotspotHosts(selectedRouter),
            ]);
            setServers(s);
            setActiveUsers(a);
            setHosts(h);
        } catch(err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">Hotspot Management</h2>
                <p className="mt-2 text-slate-500">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'servers': return <ServersView servers={servers} />;
            case 'active': return <ActiveUsersView users={activeUsers} />;
            case 'hosts': return <HostsView hosts={hosts} />;
            case 'nodemcu': return <NodeMcuManager hosts={hosts} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold">Hotspot</h2>
            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex -mb-px">
                    <TabButton label="Active" count={activeUsers.length} isActive={activeTab === 'active'} onClick={() => setActiveTab('active')} icon={<UsersIcon className="w-5 h-5"/>}/>
                    <TabButton label="Hosts" count={hosts.length} isActive={activeTab === 'hosts'} onClick={() => setActiveTab('hosts')} icon={<ChipIcon className="w-5 h-5"/>}/>
                    <TabButton label="Servers" count={servers.length} isActive={activeTab === 'servers'} onClick={() => setActiveTab('servers')} icon={<WifiIcon className="w-5 h-5"/>}/>
                    <TabButton label="NodeMCU Vendo" count={0} isActive={activeTab === 'nodemcu'} onClick={() => setActiveTab('nodemcu')} icon={<ChipIcon className="w-5 h-5"/>}/>
                </nav>
            </div>
            <div>{renderTabContent()}</div>
        </div>
    );
};
