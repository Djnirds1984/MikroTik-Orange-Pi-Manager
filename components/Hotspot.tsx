
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotActiveUser, HotspotHost } from '../types.ts';
import { 
    getHotspotActiveUsers, 
    getHotspotHosts, 
    removeHotspotActiveUser
} from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ExclamationTriangleIcon, TrashIcon, UsersIcon, ChipIcon, CodeBracketIcon, ServerIcon } from '../constants.tsx';
// FIX: Import components from their own files instead of using local placeholders.
import { HotspotEditor } from './HotspotEditor.tsx';
import { HotspotInstaller } from './HotspotInstaller.tsx';
import { NodeMcuManager } from './NodeMcuManager.tsx';

// --- Helper Functions & Components ---
const formatBytes = (bytes: number): string => {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const TabButton: React.FC<{ label: string, icon: React.ReactNode, isActive: boolean, onClick: () => void }> = ({ label, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 focus:outline-none ${
            isActive
                ? 'border-[--color-primary-500] text-[--color-primary-500] dark:text-[--color-primary-400]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
    >
        {icon}
        {label}
    </button>
);

// --- Sub-components for each tab ---

const UserActivity: React.FC<{
    activeUsers: HotspotActiveUser[];
    isSubmitting: boolean;
    onKickUser: (userId: string) => void;
}> = ({ activeUsers, isSubmitting, onKickUser }) => {
    return (
        <div>
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">User</th><th className="px-6 py-3">Address</th><th className="px-6 py-3">Uptime</th><th className="px-6 py-3">Data (Down/Up)</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                <tbody>
                    {activeUsers.length > 0 ? activeUsers.map(user => (
                        <tr key={user.id} className="border-b dark:border-slate-700">
                            <td className="px-6 py-4 font-medium">{user.user}</td>
                            <td className="px-6 py-4 font-mono">{user.address}</td>
                            <td className="px-6 py-4 font-mono">{user.uptime}</td>
                            <td className="px-6 py-4 font-mono">{formatBytes(user.bytesIn)} / {formatBytes(user.bytesOut)}</td>
                            <td className="px-6 py-4 text-right"><button onClick={() => onKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-500 hover:text-red-500 rounded-md"><TrashIcon className="h-5 w-5" /></button></td>
                        </tr>
                    )) : <tr><td colSpan={5} className="text-center py-8 text-slate-500">No active Hotspot users.</td></tr>}
                </tbody>
            </table></div></div>
        </div>
    );
};

const Hosts: React.FC<{ hosts: HotspotHost[] }> = ({ hosts }) => {
    return (
        <div>
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">All Hosts ({hosts.length})</h3>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">MAC Address</th>
                                <th scope="col" className="px-6 py-3">Address</th>
                                <th scope="col" className="px-6 py-3">To Address</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hosts.length > 0 ? hosts.map(host => (
                                <tr key={host.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-200">{host.macAddress}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{host.address}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{host.toAddress}</td>
                                    <td className="px-6 py-4 space-x-2">
                                        {host.authorized && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Authorized</span>}
                                        {host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400">Bypassed</span>}
                                        {!host.authorized && !host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600/50 text-slate-600 dark:text-slate-400">Guest</span>}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-8 text-slate-500">
                                        No Hotspot hosts found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const ServerProfilesManager: React.FC<{}> = () => <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot Server Profiles management is not yet implemented.</div>;
const UserProfilesManager: React.FC<{}> = () => <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot User Profiles management is not yet implemented.</div>;

// --- Main Component ---
export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'activity' | 'nodemcu' | 'editor' | 'profiles' | 'user-profiles' | 'setup'>('activity');
    
    // FIX: Lifted state from UserActivity to the parent Hotspot component.
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // FIX: Lifted data fetching logic from UserActivity to the parent Hotspot component.
    const fetchData = useCallback(async (isPolling = false) => {
        if (!selectedRouter) {
            setActiveUsers([]);
            setHosts([]);
            if (!isPolling) setIsLoading(false);
            return;
        }
        if (!isPolling) setIsLoading(true);
        setErrors({});

        const [activeResult, hostsResult] = await Promise.allSettled([
            getHotspotActiveUsers(selectedRouter),
            getHotspotHosts(selectedRouter),
        ]);

        const newErrors: Record<string, string> = {};

        if (activeResult.status === 'fulfilled') {
            setActiveUsers(activeResult.value);
        } else {
            newErrors.active = `Could not fetch active users.`;
        }
        
        if (hostsResult.status === 'fulfilled') {
            setHosts(hostsResult.value);
        } else {
            newErrors.hosts = `Could not fetch device hosts.`;
        }

        if (Object.keys(newErrors).length > 0) setErrors(newErrors);
        if (!isPolling) setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        fetchData(false);
        const interval = window.setInterval(() => fetchData(true), 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleKickUser = async (userId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure?")) return;
        setIsSubmitting(true);
        try {
            await removeHotspotActiveUser(selectedRouter, userId);
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Hotspot Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }
    
    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Hotspot Management</h2>

            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <TabButton label="User Activity" icon={<UsersIcon className="w-5 h-5" />} isActive={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
                    <TabButton label="NodeMCU Vendo" icon={<ChipIcon className="w-5 h-5" />} isActive={activeTab === 'nodemcu'} onClick={() => setActiveTab('nodemcu')} />
                    <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5" />} isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    <TabButton label="Server Profiles" icon={<ServerIcon className="w-5 h-5" />} isActive={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} />
                    <TabButton label="User Profiles" icon={<UsersIcon className="w-5 h-5" />} isActive={activeTab === 'user-profiles'} onClick={() => setActiveTab('user-profiles')} />
                    <TabButton label="Server Setup" icon={<ServerIcon className="w-5 h-5" />} isActive={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
                </nav>
            </div>
            
            {/* FIX: Pass lifted state and handlers down to child components. */}
            {activeTab === 'activity' && (
                <UserActivity 
                    activeUsers={activeUsers}
                    hosts={hosts}
                    isLoading={isLoading}
                    isSubmitting={isSubmitting}
                    errors={errors}
                    onKickUser={handleKickUser}
                />
            )}
            {activeTab === 'nodemcu' && <NodeMcuManager hosts={hosts} />}
            {activeTab === 'editor' && <HotspotEditor selectedRouter={selectedRouter} />}
            {activeTab === 'profiles' && <ServerProfilesManager />}
            {activeTab === 'user-profiles' && <UserProfilesManager />}
            {activeTab === 'setup' && <HotspotInstaller selectedRouter={selectedRouter} />}
        </div>
    );
};
