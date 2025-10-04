import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotActiveUser, HotspotHost } from '../types.ts';
import { getHotspotActiveUsers, getHotspotHosts, removeHotspotActiveUser } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ExclamationTriangleIcon, TrashIcon } from '../constants.tsx';

// --- Helper Functions ---
const formatBytes = (bytes: number): string => {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --- Main Component ---
export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setActiveUsers([]);
            setHosts([]);
            return;
        }
        setIsLoading(true);
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

        setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            if (selectedRouter) {
                fetchData();
            }
        }, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [fetchData, selectedRouter]);

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
            <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-200">Hotspot Manager</h2>
                <p className="mt-2 text-slate-400">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }

    if (isLoading && activeUsers.length === 0 && hosts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-orange-400">Fetching Hotspot data from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (errors.active && errors.hosts) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load Hotspot data.</p>
                <p className="mt-2 text-slate-400 text-sm">{errors.active}</p>
            </div>
         );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-slate-100">Hotspot Management</h2>

            {Object.keys(errors).length > 0 && (
                 <div className="bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 p-3 rounded-lg text-sm flex items-center gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">Data Warning:</p>
                        <ul className="list-disc pl-5">
                            {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                </div>
            )}
            
            {/* Active Users Table */}
            <div>
                <h3 className="text-xl font-semibold text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
                <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
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
                                    <tr key={user.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-slate-200">{user.user}</td>
                                        <td className="px-6 py-4 font-mono text-cyan-400">{user.address}</td>
                                        <td className="px-6 py-4 font-mono text-slate-300">{user.macAddress}</td>
                                        <td className="px-6 py-4 font-mono text-slate-300">{user.uptime}</td>
                                        <td className="px-6 py-4 font-mono text-green-400">{formatBytes(user.bytesIn)} / {formatBytes(user.bytesOut)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Kick User">
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
                <h3 className="text-xl font-semibold text-slate-200 mb-4">Hosts ({hosts.length})</h3>
                 <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">MAC Address</th>
                                    <th scope="col" className="px-6 py-3">Address</th>
                                    <th scope="col" className="px-6 py-3">To Address</th>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hosts.length > 0 ? hosts.map(host => (
                                    <tr key={host.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-mono text-slate-200">{host.macAddress}</td>
                                        <td className="px-6 py-4 font-mono text-cyan-400">{host.address}</td>
                                        <td className="px-6 py-4 font-mono text-slate-300">{host.toAddress}</td>
                                        <td className="px-6 py-4 space-x-2">
                                            {host.authorized && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">Authorized</span>}
                                            {host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-400">Bypassed</span>}
                                            {!host.authorized && !host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-600/50 text-slate-400">Guest</span>}
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
    );
};