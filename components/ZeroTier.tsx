import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, ZeroTierInterface } from '../types.ts';
import { getZeroTierInterfaces, addZeroTierInterface, updateZeroTierInterface, deleteZeroTierInterface } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, TrashIcon, ZeroTierIcon } from '../constants.tsx';

// --- Add Network Modal ---
interface AddNetworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (networkId: string) => void;
    isLoading: boolean;
}

const AddNetworkModal: React.FC<AddNetworkModalProps> = ({ isOpen, onClose, onSave, isLoading }) => {
    const [networkId, setNetworkId] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(networkId);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-orange-400 mb-4">Join ZeroTier Network</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="networkId" className="block text-sm font-medium text-slate-300">16-digit Network ID</label>
                                <input
                                    type="text"
                                    name="networkId"
                                    id="networkId"
                                    value={networkId}
                                    onChange={(e) => setNetworkId(e.target.value)}
                                    required
                                    pattern="^[0-9a-fA-F]{16}$"
                                    title="Please enter a 16-character hexadecimal Network ID"
                                    className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white font-mono tracking-wider focus:outline-none focus:ring-orange-500"
                                    placeholder="e.g., 8056c2e21c000001"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isLoading || !networkId.match(/^[0-9a-fA-F]{16}$/)} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isLoading ? 'Joining...' : 'Join Network'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Main Component ---
export const ZeroTier: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [interfaces, setInterfaces] = useState<ZeroTierInterface[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setInterfaces([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const data = await getZeroTierInterfaces(selectedRouter);
            setInterfaces(data);
        } catch (err) {
            console.error("Failed to fetch ZeroTier interfaces:", err);
            setError(`Could not fetch ZeroTier data. Ensure the ZeroTier package is enabled and running on "${selectedRouter.name}".`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAdd = () => setIsModalOpen(true);

    const handleSave = async (networkId: string) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            await addZeroTierInterface(selectedRouter, networkId);
            setIsModalOpen(false);
            setTimeout(fetchData, 1000); // Give router a moment to establish the interface
        } catch (err) {
            alert(`Error joining network: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (ztId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to leave this ZeroTier network?")) return;
        setIsSubmitting(true);
        try {
            await deleteZeroTierInterface(selectedRouter, ztId);
            await fetchData();
        } catch (err) {
            alert(`Error leaving network: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggle = async (zt: ZeroTierInterface) => {
        if (!selectedRouter) return;
        const newDisabledState = zt.disabled === 'true' ? 'false' : 'true';
        // Optimistically update UI
        setInterfaces(prev => prev.map(i => i.id === zt.id ? { ...i, disabled: newDisabledState } : i));
        try {
            await updateZeroTierInterface(selectedRouter, zt.id, newDisabledState);
            // Optionally, refresh data to confirm
            // await fetchData(); 
        } catch (err) {
            alert(`Error toggling interface: ${(err as Error).message}`);
            // Revert optimistic update on error
            setInterfaces(prev => prev.map(i => i.id === zt.id ? { ...i, disabled: zt.disabled } : i));
        }
    };

    const getStatusChip = (status: string) => {
        switch (status) {
            case 'ok': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">OK</span>;
            case 'access-denied': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-400">Access Denied</span>;
            case 'not-found': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-400">Not Found</span>;
            default: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-600/50 text-slate-400">{status}</span>;
        }
    };

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-200">ZeroTier Manager</h2>
                <p className="mt-2 text-slate-400">Please select a router to manage its ZeroTier connections.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-orange-400">Fetching ZeroTier data from {selectedRouter.name}...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load ZeroTier data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <AddNetworkModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                isLoading={isSubmitting}
            />

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-slate-100">ZeroTier Networks</h2>
                <button onClick={handleAdd} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">
                    Join Network
                </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Interface</th>
                                <th scope="col" className="px-6 py-3">Network ID</th>
                                <th scope="col" className="px-6 py-3">MAC Address</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Enabled</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {interfaces.length > 0 ? interfaces.map(zt => (
                                <tr key={zt.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-200">{zt.name}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-400">{zt['network-id']}</td>
                                    <td className="px-6 py-4 font-mono text-slate-300">{zt['mac-address']}</td>
                                    <td className="px-6 py-4">{getStatusChip(zt.status)}</td>
                                    <td className="px-6 py-4">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={zt.disabled === 'false'}
                                                onChange={() => handleToggle(zt)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-orange-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                                        </label>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleDelete(zt.id)} disabled={isSubmitting} className="p-2 text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Leave Network">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-500">
                                        Not joined to any ZeroTier networks.
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
