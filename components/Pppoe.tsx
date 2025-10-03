import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, PppProfile, IpPool, PppProfileData } from '../types.ts';
import { getPppProfiles, getIpPools, addPppProfile, updatePppProfile, deletePppProfile } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, ExclamationTriangleIcon } from '../constants.tsx';

// --- Modal Form for Add/Edit ---
interface ProfileFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (profileData: PppProfile | PppProfileData) => void;
    initialData: PppProfile | null;
    pools: IpPool[];
    isLoading: boolean;
    poolError?: string;
}

const ProfileFormModal: React.FC<ProfileFormModalProps> = ({ isOpen, onClose, onSave, initialData, pools, isLoading, poolError }) => {
    const [profile, setProfile] = useState<PppProfileData>({ name: '', localAddress: '', remoteAddress: 'none', rateLimit: '' });

    useEffect(() => {
        if (initialData) {
            setProfile({
                name: initialData.name,
                localAddress: initialData.localAddress || '',
                remoteAddress: initialData.remoteAddress || 'none',
                rateLimit: initialData.rateLimit || '',
            });
        } else {
            setProfile({ name: '', localAddress: '', remoteAddress: 'none', rateLimit: '' });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfile(p => ({ ...p, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave = {
            ...profile,
            remoteAddress: profile.remoteAddress === 'none' ? '' : profile.remoteAddress,
        };
        onSave(initialData ? { ...dataToSave, id: initialData.id } : dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-orange-400 mb-4">{initialData ? 'Edit Profile' : 'Add New Profile'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-slate-300">Profile Name</label>
                                <input type="text" name="name" id="name" value={profile.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" />
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="localAddress" className="block text-sm font-medium text-slate-300">Local Address</label>
                                    <input type="text" name="localAddress" id="localAddress" value={profile.localAddress} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., 10.0.0.1" />
                                </div>
                                <div>
                                    <label htmlFor="remoteAddress" className="block text-sm font-medium text-slate-300">Remote Address (Pool)</label>
                                    {poolError && 
                                        <div className="flex items-center gap-2 text-xs text-yellow-400 mt-1 bg-yellow-900/30 border border-yellow-800/50 p-2 rounded-md">
                                            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                            <span>{poolError} List may be incomplete.</span>
                                        </div>
                                    }
                                    <select name="remoteAddress" id="remoteAddress" value={profile.remoteAddress} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500">
                                        <option value="none">none</option>
                                        {pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                             <div>
                                <label htmlFor="rateLimit" className="block text-sm font-medium text-slate-300">Rate Limit (rx/tx)</label>
                                <input type="text" name="rateLimit" id="rateLimit" value={profile.rateLimit} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., 5M/10M" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-wait">
                            {isLoading ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export const Pppoe: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [pools, setPools] = useState<IpPool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<{ profiles?: string; pools?: string } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<PppProfile | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setProfiles([]);
            setPools([]);
            return;
        }
        setIsLoading(true);
        setError(null);

        const [profilesResult, poolsResult] = await Promise.allSettled([
            getPppProfiles(selectedRouter),
            getIpPools(selectedRouter),
        ]);

        const newErrors: { profiles?: string; pools?: string } = {};

        if (profilesResult.status === 'fulfilled') {
            setProfiles(profilesResult.value);
        } else {
            console.error("Failed to fetch PPPoE profiles:", profilesResult.reason);
            newErrors.profiles = `Could not fetch PPPoE profiles. Ensure the PPP package is enabled on "${selectedRouter.name}".`;
        }

        if (poolsResult.status === 'fulfilled') {
            setPools(poolsResult.value);
        } else {
            console.error("Failed to fetch IP pools:", poolsResult.reason);
            newErrors.pools = `Could not fetch IP pools from "${selectedRouter.name}".`;
        }

        if (Object.keys(newErrors).length > 0) {
            setError(newErrors);
        }
        
        setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAdd = () => {
        setEditingProfile(null);
        setIsModalOpen(true);
    };

    const handleEdit = (profile: PppProfile) => {
        setEditingProfile(profile);
        setIsModalOpen(true);
    };

    const handleDelete = async (profileId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to delete this profile?")) return;
        setIsSubmitting(true);
        try {
            await deletePppProfile(selectedRouter, profileId);
            await fetchData(); // Refresh list
        } catch (err) {
            alert(`Error deleting profile: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSave = async (profileData: PppProfile | PppProfileData) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            if ('id' in profileData) {
                await updatePppProfile(selectedRouter, profileData);
            } else {
                await addPppProfile(selectedRouter, profileData);
            }
            setIsModalOpen(false);
            await fetchData(); // Refresh list
        } catch (err) {
             alert(`Error saving profile: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };


    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-200">PPPoE Profile Manager</h2>
                <p className="mt-2 text-slate-400">Please select a router to manage its PPPoE profiles.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-orange-400">Fetching PPPoE data from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    // If we can't get profiles, we can't do anything. Show a fatal error.
    if (error?.profiles) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load PPPoE data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error.profiles}</p>
                 {error.pools && <p className="mt-2 text-slate-500 text-xs">{error.pools}</p>}
            </div>
         );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <ProfileFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingProfile}
                pools={pools}
                isLoading={isSubmitting}
                poolError={error?.pools}
            />

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-slate-100">PPPoE Profiles</h2>
                <button onClick={handleAdd} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">
                    Add New Profile
                </button>
            </div>
            
            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Profile Name</th>
                                <th scope="col" className="px-6 py-3">Local Address</th>
                                <th scope="col" className="px-6 py-3">Remote Address (Pool)</th>
                                <th scope="col" className="px-6 py-3">Rate Limit</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                           {profiles.length > 0 ? profiles.map(profile => (
                                <tr key={profile.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-200">{profile.name}</td>
                                    <td className="px-6 py-4 font-mono text-slate-300">{profile.localAddress || 'none'}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-400">{profile.remoteAddress || 'none'}</td>
                                    <td className="px-6 py-4 font-mono text-green-400">{profile.rateLimit || 'N/A'}</td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleEdit(profile)} className="p-2 text-slate-400 hover:text-orange-400 rounded-md" title="Edit Profile">
                                            <EditIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleDelete(profile.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-md" title="Delete Profile">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                           )) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">
                                        No PPPoE profiles found on this router.
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