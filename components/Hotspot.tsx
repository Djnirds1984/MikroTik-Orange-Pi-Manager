import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotActiveUser, HotspotHost, HotspotProfile, HotspotProfileData } from '../types.ts';
import { getHotspotActiveUsers, getHotspotHosts, removeHotspotActiveUser, getHotspotProfiles, addHotspotProfile, updateHotspotProfile, deleteHotspotProfile } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ExclamationTriangleIcon, TrashIcon, UsersIcon, ChipIcon, CodeBracketIcon, ServerIcon, EditIcon } from '../constants.tsx';
import { NodeMcuManager } from './NodeMcuManager.tsx';
import { HotspotEditor } from './HotspotEditor.tsx';
import { HotspotInstaller } from './HotspotInstaller.tsx';

// --- Helper Functions ---
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

// --- Profiles Management Sub-component ---
const ProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<HotspotProfile | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profilesData = await getHotspotProfiles(selectedRouter);
            setProfiles(profilesData);
        } catch (err) {
            setError(`Could not fetch data: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (profileData: HotspotProfile | HotspotProfileData) => {
        setIsSubmitting(true);
        try {
            if ('id' in profileData) await updateHotspotProfile(selectedRouter, profileData as HotspotProfile);
            else await addHotspotProfile(selectedRouter, profileData as HotspotProfileData);
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) { alert(`Error saving profile: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (profileId: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteHotspotProfile(selectedRouter, profileId);
            await fetchData();
        } catch (err) { alert(`Error deleting profile: ${(err as Error).message}`); }
    };

    const ProfileFormModal: React.FC<any> = ({ isOpen, onClose, onSave, initialData }) => {
        const [profile, setProfile] = useState<Partial<HotspotProfileData>>({ name: '', 'hotspot-address': '', 'rate-limit': '' });

        useEffect(() => {
            if (isOpen) {
                if (initialData) {
                    setProfile({ name: initialData.name, 'hotspot-address': initialData['hotspot-address'] || '', 'rate-limit': initialData['rate-limit'] || '' });
                } else {
                    setProfile({ name: '', 'hotspot-address': '', 'rate-limit': '' });
                }
            }
        }, [initialData, isOpen]);

        if (!isOpen) return null;
        const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(initialData ? { ...profile, id: initialData.id } : profile); };

        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">{initialData ? 'Edit Profile' : 'Add New Profile'}</h3>
                           <div className="space-y-4">
                                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile Name</label><input type="text" name="name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hotspot Address</label><input type="text" name="hotspot-address" value={profile['hotspot-address']} onChange={e => setProfile(p => ({ ...p, 'hotspot-address': e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rate Limit (rx/tx)</label><input type="text" placeholder="e.g., 10M/20M" name="rate-limit" value={profile['rate-limit']} onChange={e => setProfile(p => ({ ...p, 'rate-limit': e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 rounded-md">Cancel</button><button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[--color-primary-600] text-white rounded-md">Save</button></div>
                    </form>
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return (
        <div>
            <ProfileFormModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingProfile(null); }} onSave={handleSave} initialData={editingProfile} />
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingProfile(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New Profile</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Hotspot Address</th><th className="px-6 py-3">Rate Limit</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td><td className="px-6 py-4">{p['hotspot-address'] || 'n/a'}</td><td className="px-6 py-4">{p['rate-limit'] || 'N/A'}</td>
                                <td className="px-6 py-4 text-right space-x-2"><button onClick={() => { setEditingProfile(p); setIsModalOpen(true); }} className="p-1"><EditIcon className="w-5 h-5"/></button><button onClick={() => handleDelete(p.id)} className="p-1"><TrashIcon className="w-5 h-5"/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- Main Component ---
export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState<'activity' | 'nodemcu' | 'editor' | 'profiles' | 'setup'>('activity');

    // Refactored fetchData to handle polling gracefully
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
            console.error("Failed to fetch Hotspot active users:", activeResult.reason);
            newErrors.active = `Could not fetch active users. The Hotspot package might not be configured.`;
        }
        
        if (hostsResult.status === 'fulfilled') {
            setHosts(hostsResult.value);
        } else {
            console.error("Failed to fetch Hotspot hosts:", hostsResult.reason);
            newErrors.hosts = `Could not fetch device hosts.`;
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
        }

        if (!isPolling) setIsLoading(false);
    }, [selectedRouter]);

    // Initial data fetch on mount or router change
    useEffect(() => {
        if (activeTab === 'activity') {
            fetchData(false);
        }
    }, [fetchData, activeTab]);

    // Set up polling interval only for the 'activity' tab
    useEffect(() => {
        let interval: number;
        if (activeTab === 'activity' && selectedRouter) {
            interval = window.setInterval(() => {
                fetchData(true); // Pass true to indicate a background poll
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [activeTab, selectedRouter, fetchData]);

    const handleKickUser = async (userId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to kick this user?")) return;
        setIsSubmitting(true);
        try {
            await removeHotspotActiveUser(selectedRouter, userId);
            await fetchData();
        } catch (err) {
            alert(`Error kicking user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Hotspot Manager</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }

    if (isLoading && activeTab === 'activity') {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-[--color-primary-500] dark:text-[--color-primary-400]">Fetching Hotspot data from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (errors.active && errors.hosts && activeTab === 'activity') {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-lg border border-red-300 dark:border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-600 dark:text-red-400">Failed to load Hotspot data.</p>
                <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">{errors.active}</p>
            </div>
         );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Hotspot Management</h2>

            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <TabButton
                        label="User Activity"
                        icon={<UsersIcon className="w-5 h-5 mr-2" />}
                        isActive={activeTab === 'activity'}
                        onClick={() => setActiveTab('activity')}
                    />
                    <TabButton
                        label="NodeMCU Vendo"
                        icon={<ChipIcon className="w-5 h-5 mr-2" />}
                        isActive={activeTab === 'nodemcu'}
                        onClick={() => setActiveTab('nodemcu')}
                    />
                     <TabButton
                        label="Login Page Editor"
                        icon={<CodeBracketIcon className="w-5 h-5 mr-2" />}
                        isActive={activeTab === 'editor'}
                        onClick={() => setActiveTab('editor')}
                    />
                    <TabButton
                        label="Server Profiles"
                        icon={<ServerIcon className="w-5 h-5 mr-2" />}
                        isActive={activeTab === 'profiles'}
                        onClick={() => setActiveTab('profiles')}
                    />
                    <TabButton
                        label="Server Setup"
                        icon={<ServerIcon className="w-5 h-5 mr-2" />}
                        isActive={activeTab === 'setup'}
                        onClick={() => setActiveTab('setup')}
                    />
                </nav>
            </div>


            {Object.keys(errors).length > 0 && activeTab === 'activity' && (
                 <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-300 p-3 rounded-lg text-sm flex items-center gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">Data Warning:</p>
                        <ul className="list-disc pl-5">
                            {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'activity' && (
                <div className="space-y-8">
                    {/* Active Users Table */}
                    <div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3">User</th>
                                            <th scope="col" className="px-6 py-3">Address</th>
                                            <th scope="col" className="px-6 py-3">MAC Address</th>
                                            <th scope="col" className="px-6 py-3">Uptime</th>
                                            <th scope="col" className="px-6 py-3">Data Usage (Down/Up)</th>
                                            <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeUsers.length > 0 ? activeUsers.map(user => (
                                            <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{user.user}</td>
                                                <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{user.address}</td>
                                                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{user.macAddress}</td>
                                                <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{user.uptime}</td>
                                                <td className="px-6 py-4 font-mono text-green-600 dark:text-green-400">{formatBytes(user.bytesIn)} / {formatBytes(user.bytesOut)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => handleKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Kick User">
                                                        <TrashIcon className="h-5 w-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={6} className="text-center py-8 text-slate-500">
                                                    No active Hotspot users.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Hosts Table */}
                    <div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">All Hosts ({hosts.length})</h3>
                         <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
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
                </div>
            )}

            {activeTab === 'nodemcu' && (
                <NodeMcuManager hosts={hosts} />
            )}
            
            {activeTab === 'editor' && (
                <HotspotEditor selectedRouter={selectedRouter} />
            )}

            {activeTab === 'profiles' && (
                <ProfilesManager selectedRouter={selectedRouter} />
            )}

            {activeTab === 'setup' && (
                <HotspotInstaller selectedRouter={selectedRouter} />
            )}
        </div>
    );
};