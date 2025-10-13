import React, { useState, useEffect, useCallback } from 'react';
import type { 
    RouterConfigWithId, 
    HotspotProfile,
    HotspotUserProfile,
    IpPool,
    HotspotProfileData,
    HotspotUserProfileData
} from '../types.ts';
import { 
    getHotspotProfiles, addHotspotProfile, updateHotspotProfile, deleteHotspotProfile,
    getHotspotUserProfiles, addHotspotUserProfile, updateHotspotUserProfile, deleteHotspotUserProfile,
    getIpPools
} from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
// FIX: Add missing icon imports for ChipIcon and CodeBracketIcon.
import { RouterIcon, UsersIcon, ServerIcon, EditIcon, TrashIcon, ChipIcon, CodeBracketIcon } from '../constants.tsx';

// --- Reusable Components ---

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
        <span className="ml-2 hidden sm:inline">{label}</span>
    </button>
);


// --- Server Profile Components ---

const ServerProfileFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: HotspotProfileData | HotspotProfile) => void;
    initialData: HotspotProfile | null;
    isSubmitting: boolean;
}> = ({ isOpen, onClose, onSave, initialData, isSubmitting }) => {
    const [profile, setProfile] = useState<Partial<HotspotProfileData>>({});

    useEffect(() => {
        if (isOpen) {
            // FIX: Correctly initialize form state by separating id from the rest of the data.
            if (initialData) {
                const { id, ...rest } = initialData;
                setProfile(rest);
            } else {
                setProfile({ name: '', 'login-by': 'cookie,http-chap' });
            }
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setProfile(p => ({ ...p, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // FIX: Construct the correct object shape for saving, satisfying the type requirements.
        onSave(initialData ? { ...(profile as HotspotProfileData), id: initialData.id } : profile as HotspotProfileData);
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">{initialData ? 'Edit Server Profile' : 'Add Server Profile'}</h3>
                        <div className="space-y-4">
                            <div><label>Name</label><input name="name" value={profile.name || ''} onChange={handleChange} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>Hotspot Address</label><input name="hotspot-address" value={profile['hotspot-address'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>DNS Name</label><input name="dns-name" value={profile['dns-name'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>Rate Limit (rx/tx)</label><input name="rate-limit" value={profile['rate-limit'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[--color-primary-600] text-white rounded-md">{isSubmitting ? 'Saving...' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const HotspotServerProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
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
            const data = await getHotspotProfiles(selectedRouter);
            setProfiles(data);
        } catch (err) {
            setError(`Could not fetch data: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data: HotspotProfileData | HotspotProfile) => {
        setIsSubmitting(true);
        try {
            if ('id' in data) await updateHotspotProfile(selectedRouter, data as HotspotProfile);
            else await addHotspotProfile(selectedRouter, data as HotspotProfileData);
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteHotspotProfile(selectedRouter, id);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); }
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return (
        <div>
            <ServerProfileFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingProfile} isSubmitting={isSubmitting} />
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingProfile(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New Profile</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                        <tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Hotspot Address</th><th className="px-6 py-3">DNS Name</th><th className="px-6 py-3">Rate Limit</th><th className="px-6 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td>
                                <td className="px-6 py-4">{p['hotspot-address'] || 'n/a'}</td>
                                <td className="px-6 py-4">{p['dns-name'] || 'n/a'}</td>
                                <td className="px-6 py-4">{p['rate-limit'] || 'N/A'}</td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => { setEditingProfile(p); setIsModalOpen(true); }} className="p-1"><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDelete(p.id)} className="p-1"><TrashIcon className="w-5 h-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- User Profile Components ---

const UserProfileFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: HotspotUserProfileData | HotspotUserProfile) => void;
    initialData: HotspotUserProfile | null;
    pools: IpPool[];
    isSubmitting: boolean;
}> = ({ isOpen, onClose, onSave, initialData, pools, isSubmitting }) => {
    const [profile, setProfile] = useState<Partial<HotspotUserProfileData>>({});

    useEffect(() => {
        if (isOpen) {
            // FIX: Correctly initialize form state by separating id from the rest of the data.
            if (initialData) {
                const { id, ...rest } = initialData;
                setProfile(rest);
            } else {
                setProfile({ name: '', 'address-pool': 'none', 'shared-users': '1' });
            }
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setProfile(p => ({ ...p, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // FIX: Construct the correct object shape for saving, satisfying the type requirements.
        onSave(initialData ? { ...(profile as HotspotUserProfileData), id: initialData.id } : profile as HotspotUserProfileData);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">{initialData ? 'Edit User Profile' : 'Add User Profile'}</h3>
                        <div className="space-y-4">
                            <div><label>Name</label><input name="name" value={profile.name || ''} onChange={handleChange} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>Address Pool</label><select name="address-pool" value={profile['address-pool'] || 'none'} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md"><option value="none">none</option>{pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
                            <div><label>Rate Limit (rx/tx)</label><input name="rate-limit" value={profile['rate-limit'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label>Session Timeout</label><input name="session-timeout" value={profile['session-timeout'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" placeholder="00:00:00" /></div>
                                <div><label>Shared Users</label><input name="shared-users" value={profile['shared-users'] || ''} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[--color-primary-600] text-white rounded-md">{isSubmitting ? 'Saving...' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const HotspotUserProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<HotspotUserProfile[]>([]);
    const [pools, setPools] = useState<IpPool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<HotspotUserProfile | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [profilesData, poolsData] = await Promise.all([
                getHotspotUserProfiles(selectedRouter),
                getIpPools(selectedRouter)
            ]);
            setProfiles(profilesData);
            setPools(poolsData);
        } catch (err) {
            setError(`Could not fetch data: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (data: HotspotUserProfileData | HotspotUserProfile) => {
        setIsSubmitting(true);
        try {
            // FIX: Use correct function name 'updateHotspotUserProfile'
            if ('id' in data) await updateHotspotUserProfile(selectedRouter, data as HotspotUserProfile);
            // FIX: Use correct function name 'addHotspotUserProfile'
            else await addHotspotUserProfile(selectedRouter, data as HotspotUserProfileData);
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };
    
    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            // FIX: Use correct function name 'deleteHotspotUserProfile'
            await deleteHotspotUserProfile(selectedRouter, id);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); }
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return (
        <div>
            <UserProfileFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingProfile} pools={pools} isSubmitting={isSubmitting} />
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingProfile(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New User Profile</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                        <tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Address Pool</th><th className="px-6 py-3">Rate Limit</th><th className="px-6 py-3">Shared Users</th><th className="px-6 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td>
                                <td className="px-6 py-4">{p['address-pool'] || 'none'}</td>
                                <td className="px-6 py-4">{p['rate-limit'] || 'N/A'}</td>
                                <td className="px-6 py-4">{p['shared-users'] || 'N/A'}</td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => { setEditingProfile(p); setIsModalOpen(true); }} className="p-1"><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDelete(p.id)} className="p-1"><TrashIcon className="w-5 h-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Main Hotspot Component ---

export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'user-activity' | 'nodemcu' | 'editor' | 'server-profiles' | 'user-profiles' | 'setup'>('server-profiles');
    
    if (!selectedRouter) {
        return (
             <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Hotspot Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'server-profiles': return <HotspotServerProfilesManager selectedRouter={selectedRouter} />;
            case 'user-profiles': return <HotspotUserProfilesManager selectedRouter={selectedRouter} />;
            // Placeholders for other tabs
            case 'user-activity': return <div className="p-4">User Activity is not yet implemented.</div>;
            case 'nodemcu': return <div className="p-4">NodeMCU Vendo is not yet implemented.</div>;
            case 'editor': return <div className="p-4">Login Page Editor is not yet implemented.</div>;
            case 'setup': return <div className="p-4">Server Setup is not yet implemented.</div>;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
             <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2 -mb-px overflow-x-auto" aria-label="Tabs">
                    <TabButton label="User Activity" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'user-activity'} onClick={() => setActiveTab('user-activity')} />
                    <TabButton label="NodeMCU Vendo" icon={<ChipIcon className="w-5 h-5"/>} isActive={activeTab === 'nodemcu'} onClick={() => setActiveTab('nodemcu')} />
                    <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5"/>} isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    <TabButton label="Server Profiles" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'server-profiles'} onClick={() => setActiveTab('server-profiles')} />
                    <TabButton label="User Profiles" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'user-profiles'} onClick={() => setActiveTab('user-profiles')} />
                    <TabButton label="Server Setup" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
                </nav>
            </div>
            <div>
                {renderTabContent()}
            </div>
        </div>
    );
};
