import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppProfile, IpPool, PppProfileData, PppSecret, PppActiveConnection, SaleRecord, BillingPlanWithId, Customer, PppSecretData } from '../types.ts';
import { 
    getPppProfiles, getIpPools, addPppProfile, updatePppProfile, deletePppProfile,
    getPppSecrets, getPppActiveConnections, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment
} from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, ExclamationTriangleIcon, UsersIcon, SignalIcon, CurrencyDollarIcon, KeyIcon, SearchIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';
import { PaymentModal } from './PaymentModal.tsx';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { useCompanySettings } from '../hooks/useCompanySettings.ts';

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
        <span className="ml-2">{label}</span>
    </button>
);

// --- Profiles Management Sub-component ---
const ProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [pools, setPools] = useState<IpPool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<{ profiles?: string; pools?: string } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<PppProfile | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const [profilesResult, poolsResult] = await Promise.allSettled([
            getPppProfiles(selectedRouter),
            getIpPools(selectedRouter),
        ]);
        const newErrors: { profiles?: string; pools?: string } = {};
        if (profilesResult.status === 'fulfilled') setProfiles(profilesResult.value);
        else newErrors.profiles = `Could not fetch PPPoE profiles.`;
        if (poolsResult.status === 'fulfilled') setPools(poolsResult.value);
        else newErrors.pools = `Could not fetch IP pools.`;
        if (Object.keys(newErrors).length > 0) setError(newErrors);
        setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (profileData: PppProfile | PppProfileData) => {
        setIsSubmitting(true);
        try {
            if ('id' in profileData) await updatePppProfile(selectedRouter, profileData);
            else await addPppProfile(selectedRouter, profileData);
            setIsModalOpen(false);
            await fetchData();
        } catch (err) { alert(`Error saving profile: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (profileId: string) => {
        if (!window.confirm("Are you sure?")) return;
        setIsSubmitting(true);
        try {
            await deletePppProfile(selectedRouter, profileId);
            await fetchData();
        } catch (err) { alert(`Error deleting profile: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };
    
    // Profiles UI... (Modal + Table)
    const ProfileFormModal: React.FC<any> = ({ isOpen, onClose, onSave, initialData }) => {
        const [profile, setProfile] = useState<PppProfileData>({ name: '', localAddress: '', remoteAddress: 'none', rateLimit: '' });
        useEffect(() => {
            if (initialData) setProfile({ name: initialData.name, localAddress: initialData.localAddress || '', remoteAddress: initialData.remoteAddress || 'none', rateLimit: initialData.rateLimit || '' });
            else setProfile({ name: '', localAddress: '', remoteAddress: 'none', rateLimit: '' });
        }, [initialData, isOpen]);
        if (!isOpen) return null;
        const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(initialData ? { ...profile, id: initialData.id } : profile); };
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <div className="p-6"><h3 className="text-xl font-bold mb-4">{initialData ? 'Edit Profile' : 'Add New Profile'}</h3>
                           {/* Form fields */}
                            <div className="space-y-4">
                                <div><label>Profile Name</label><input type="text" name="name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label>Local Address</label><input type="text" name="localAddress" value={profile.localAddress} onChange={e => setProfile(p => ({ ...p, localAddress: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label>Remote Address (Pool)</label><select name="remoteAddress" value={profile.remoteAddress} onChange={e => setProfile(p => ({ ...p, remoteAddress: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2"><option value="none">none</option>{pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
                                <div><label>Rate Limit (rx/tx)</label><input type="text" name="rateLimit" value={profile.rateLimit} onChange={e => setProfile(p => ({ ...p, rateLimit: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={isSubmitting}>Save</button></div>
                    </form>
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error?.profiles) return <div className="p-4 text-red-600">{error.profiles}</div>;

    return (
        <div>
            <ProfileFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingProfile} />
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingProfile(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New Profile</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Local Address</th><th className="px-6 py-3">Remote Pool</th><th className="px-6 py-3">Rate Limit</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td><td>{p.localAddress || 'none'}</td><td>{p.remoteAddress || 'none'}</td><td>{p.rateLimit || 'N/A'}</td>
                                <td className="px-6 py-4 text-right"><button onClick={() => { setEditingProfile(p); setIsModalOpen(true); }}><EditIcon className="w-5 h-5"/></button><button onClick={() => handleDelete(p.id)}><TrashIcon className="w-5 h-5"/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- Users Management Sub-component ---
const UsersManager: React.FC<{ selectedRouter: RouterConfigWithId, addSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<void> }> = ({ selectedRouter, addSale }) => {
    // This will contain all the logic for fetching and managing PPPoE users (secrets)
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const { plans } = useBillingPlans();
    const { customers, addCustomer, updateCustomer } = useCustomers(selectedRouter.id);
    const { settings: companySettings } = useCompanySettings();

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Modal states
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedSecret, setSelectedSecret] = useState<PppSecret | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [secretsData, activeData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppActiveConnections(selectedRouter)
            ]);
            setSecrets(secretsData);
            setActive(activeData);
        } catch (err) {
            setError(`Failed to fetch PPPoE users: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData() }, [fetchData]);
    
    const combinedUsers = useMemo(() => {
        const activeMap = new Map(active.map(a => [a.name, a]));
        return secrets.map(secret => {
            const customer = customers.find(c => c.username === secret.name && c.routerId === selectedRouter.id);
            let subscription = { plan: 'N/A', dueDate: 'No Info' };
            if (secret.comment) {
                try { subscription = JSON.parse(secret.comment); } catch (e) { /* ignore */ }
            }
            return {
                ...secret,
                isActive: activeMap.has(secret.name),
                activeInfo: activeMap.get(secret.name),
                customer,
                subscription
            };
        });
    }, [secrets, active, customers, selectedRouter.id]);
    
    const handleSaveUser = async (secretData: PppSecretData, customerData: Partial<Customer>) => {
        setIsSubmitting(true);
        try {
            let customer = customers.find(c => c.username === secretData.name);
            if (customer) {
                await updateCustomer({ ...customer, ...customerData });
            } else {
                await addCustomer({ routerId: selectedRouter.id, username: secretData.name, ...customerData });
            }
            
            if (selectedSecret) { // Editing
                await updatePppSecret(selectedRouter, { ...selectedSecret, ...secretData });
            } else { // Adding
                await addPppSecret(selectedRouter, secretData);
            }

            setUserModalOpen(false);
            await fetchData();
        } catch(err) {
            alert(`Failed to save user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUser = async (secretId: string) => {
        if (!window.confirm("Are you sure you want to delete this user?")) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, secretId);
            await fetchData();
        } catch (err) {
            alert(`Error deleting user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePayment = async ({ sale, payment }: any) => {
        if (!selectedSecret) return false;
        try {
            await processPppPayment(selectedRouter, { secret: selectedSecret, ...payment });
            await addSale({ ...sale, routerName: selectedRouter.name });
            await fetchData();
            return true; // Success
        } catch (err) {
            alert(`Payment failed: ${(err as Error).message}`);
            return false; // Failure
        }
    };
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    // Simplified user table for brevity
    return (
        <div>
             {/* We need the non-payment profiles for the payment modal */}
            <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} secret={selectedSecret} plans={plans} profiles={secrets.map(s => ({id: s.id, name: s.profile}))} onSave={handlePayment} companySettings={companySettings} />

             <div className="flex justify-end mb-4">
                <button onClick={() => { setSelectedSecret(null); setUserModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New User</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                 <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Username</th><th className="px-6 py-3">Profile</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Subscription</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {combinedUsers.map(user => (
                            <tr key={user.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{user.name}</td><td>{user.profile}</td>
                                <td>{user.isActive ? <span className="text-green-500">Active</span> : <span className="text-slate-500">Inactive</span>}</td>
                                <td>{user.subscription.dueDate}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => { setSelectedSecret(user); setPaymentModalOpen(true); }}><CurrencyDollarIcon className="w-5 h-5"/></button>
                                    <button onClick={() => { setSelectedSecret(user); setUserModalOpen(true); }}><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDeleteUser(user.id)}><TrashIcon className="w-5 h-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// --- Main Container Component ---
export const Pppoe: React.FC<{ 
    selectedRouter: RouterConfigWithId | null;
    addSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<void>;
}> = ({ selectedRouter, addSale }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'profiles'>('users');
    
    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">PPPoE Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage PPPoE.</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Management</h2>
            
            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <TabButton label="Users" icon={<UsersIcon className="w-5 h-5" />} isActive={activeTab === 'users'} onClick={() => setActiveTab('users')} />
                    <TabButton label="Profiles" icon={<SignalIcon className="w-5 h-5" />} isActive={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} />
                </nav>
            </div>

            {activeTab === 'users' && <UsersManager selectedRouter={selectedRouter} addSale={addSale} />}
            {activeTab === 'profiles' && <ProfilesManager selectedRouter={selectedRouter} />}
        </div>
    );
};
