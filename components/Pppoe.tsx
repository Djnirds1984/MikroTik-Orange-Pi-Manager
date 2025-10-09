
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
        try {
            const [profilesData, poolsData] = await Promise.all([
                getPppProfiles(selectedRouter),
                getIpPools(selectedRouter),
            ]);
            setProfiles(profilesData);
            setPools(poolsData);
        } catch (err) {
            setError({ profiles: `Could not fetch data: ${(err as Error).message}` });
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (profileData: PppProfile | PppProfileData) => {
        setIsSubmitting(true);
        try {
            if ('id' in profileData) await updatePppProfile(selectedRouter, profileData);
            else await addPppProfile(selectedRouter, profileData);
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) { alert(`Error saving profile: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (profileId: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deletePppProfile(selectedRouter, profileId);
            await fetchData();
        } catch (err) { alert(`Error deleting profile: ${(err as Error).message}`); }
    };
    
    const ProfileFormModal: React.FC<any> = ({ isOpen, onClose, onSave, initialData }) => {
        const [profile, setProfile] = useState<PppProfileData>({ name: '', localAddress: '', remoteAddress: '', rateLimit: '' });
        
        useEffect(() => {
            if (isOpen) {
                if (initialData) {
                    setProfile({ name: initialData.name, localAddress: initialData.localAddress || '', remoteAddress: initialData.remoteAddress || '', rateLimit: initialData.rateLimit || '' });
                } else {
                    const defaultPool = pools.length > 0 ? pools[0].name : '';
                    setProfile({ name: '', localAddress: '', remoteAddress: defaultPool, rateLimit: '' });
                }
            }
        }, [initialData, isOpen]);

        if (!isOpen) return null;
        const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(initialData ? { ...profile, id: initialData.id } : profile); };
        
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <div className="p-6"><h3 className="text-xl font-bold mb-4">{initialData ? 'Edit Profile' : 'Add New Profile'}</h3>
                           <div className="space-y-4">
                                <div><label>Profile Name</label><input type="text" name="name" value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label>Local Address</label><input type="text" name="localAddress" value={profile.localAddress} onChange={e => setProfile(p => ({ ...p, localAddress: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
                                <div><label>Remote Address (Pool)</label><select name="remoteAddress" value={profile.remoteAddress} onChange={e => setProfile(p => ({ ...p, remoteAddress: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2"><option value="">none</option>{pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
                                <div><label>Rate Limit (rx/tx)</label><input type="text" placeholder="e.g., 10M/20M" name="rateLimit" value={profile.rateLimit} onChange={e => setProfile(p => ({ ...p, rateLimit: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md p-2" /></div>
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
            <ProfileFormModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingProfile(null); }} onSave={handleSave} initialData={editingProfile} />
            <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingProfile(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New Profile</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Local Address</th><th className="px-6 py-3">Remote Pool</th><th className="px-6 py-3">Rate Limit</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {profiles.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td><td className="px-6 py-4">{p.localAddress || 'n/a'}</td><td className="px-6 py-4">{p.remoteAddress || 'n/a'}</td><td className="px-6 py-4">{p.rateLimit || 'N/A'}</td>
                                <td className="px-6 py-4 text-right space-x-2"><button onClick={() => { setEditingProfile(p); setIsModalOpen(true); }} className="p-1"><EditIcon className="w-5 h-5"/></button><button onClick={() => handleDelete(p.id)} className="p-1"><TrashIcon className="w-5 h-5"/></button></td>
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
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const { plans } = useBillingPlans(selectedRouter.id);
    const { customers, addCustomer, updateCustomer } = useCustomers(selectedRouter.id);
    const { settings: companySettings } = useCompanySettings();

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedSecret, setSelectedSecret] = useState<PppSecret | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [secretsData, activeData, profilesData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppActiveConnections(selectedRouter),
                getPppProfiles(selectedRouter),
            ]);
            setSecrets(secretsData);
            setActive(activeData);
            setProfiles(profilesData);
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
            const customer = customers.find(c => c.username === secret.name);
            let subscription = { plan: 'N/A', dueDate: 'No Info' };
            if (secret.comment) {
                try { 
                    const parsedComment = JSON.parse(secret.comment);
                    subscription.plan = parsedComment.plan || 'N/A';
                    subscription.dueDate = parsedComment.dueDate || 'No Info';
                } catch (e) { /* ignore */ }
            }
            return {
                ...secret,
                isActive: activeMap.has(secret.name),
                activeInfo: activeMap.get(secret.name),
                customer,
                subscription
            };
        });
    }, [secrets, active, customers]);
    
    const handleSaveUser = async (secretData: PppSecretData, customerData: Partial<Customer>) => {
        setIsSubmitting(true);
        try {
            // Find if a customer record already exists in our local DB for this user.
            const existingCustomer = customers.find(c => c.username === secretData.name);

            // Step 1: Update the MikroTik router first. If this fails, we don't touch our DB.
            if (selectedSecret) { // Editing an existing secret
                await updatePppSecret(selectedRouter, { ...selectedSecret, ...secretData });
            } else { // Adding a new secret
                await addPppSecret(selectedRouter, secretData);
            }

            // Step 2: Update our local customer database.
            if (existingCustomer) {
                // If the customer record exists, update it with the new form data.
                await updateCustomer({ ...existingCustomer, ...customerData });
            } else {
                // Only create a new customer record if there's actual customer info to save.
                const hasCustomerInfo = Object.values(customerData).some(val => val && String(val).trim() !== '');
                if (hasCustomerInfo) {
                    await addCustomer({ 
                        routerId: selectedRouter.id, 
                        username: secretData.name, 
                        ...customerData 
                    });
                }
            }
            
            // Step 3: Close modal and refresh data from router.
            setUserModalOpen(false);
            setSelectedSecret(null);
            await fetchData(); // The `useCustomers` hook will refresh itself after add/update.
        } catch(err) {
            alert(`Failed to save user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUser = async (secretId: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deletePppSecret(selectedRouter, secretId);
            await fetchData();
        } catch (err) { alert(`Error deleting user: ${(err as Error).message}`); }
    };

    const handlePayment = async ({ sale, payment }: any) => {
        if (!selectedSecret) return false;
        try {
            await processPppPayment(selectedRouter, { secret: selectedSecret, ...payment });
            await addSale({ ...sale, routerName: selectedRouter.name, date: new Date().toISOString() });
            await fetchData();
            return true;
        } catch (err) {
            alert(`Payment failed: ${(err as Error).message}`);
            return false;
        }
    };
    
    const UserFormModal: React.FC<any> = ({ isOpen, onClose, onSave, initialData }) => {
        const [secret, setSecret] = useState({ name: '', password: '', profile: '' }); // profile is plan ID
        const [customer, setCustomer] = useState({ fullName: '', address: '', contactNumber: '', email: '' });
        const [showPass, setShowPass] = useState(false);

        useEffect(() => {
            if(isOpen) {
                if (initialData) {
                    const linkedCustomer = customers.find(c => c.username === initialData.name);
                    const linkedPlan = plans.find(p => p.pppoeProfile === initialData.profile);
                    
                    setSecret({ name: initialData.name, password: '', profile: linkedPlan?.id || '' });
                    setCustomer({ 
                        fullName: linkedCustomer?.fullName || '', 
                        address: linkedCustomer?.address || '', 
                        contactNumber: linkedCustomer?.contactNumber || '', 
                        email: linkedCustomer?.email || '' 
                    });
                } else {
                    setSecret({ name: '', password: '', profile: plans.length > 0 ? plans[0].id : '' });
                    setCustomer({ fullName: '', address: '', contactNumber: '', email: '' });
                }
            }
        }, [isOpen, initialData, plans, customers]);

        if (!isOpen) return null;
        
        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            const selectedPlan = plans.find(p => p.id === secret.profile);
            
            const secretPayload: PppSecretData = {
                name: secret.name,
                service: 'pppoe',
                profile: initialData?.profile || 'default', // Default to original profile
                comment: initialData?.comment || '',
                disabled: initialData?.disabled || 'false',
            };

            if (selectedPlan) {
                secretPayload.profile = selectedPlan.pppoeProfile;
            }

            if (secret.password) {
                secretPayload.password = secret.password;
            }
            onSave(secretPayload, customer);
        }

        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                         <h3 className="text-xl font-bold mb-4">{initialData ? `Edit User: ${initialData.name}` : 'Add New User'}</h3>
                         <div className="space-y-4">
                            <div><label>Username</label><input type="text" value={secret.name} onChange={e => setSecret(s => ({...s, name: e.target.value}))} disabled={!!initialData} required className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700 disabled:opacity-50" /></div>
                            <div className="relative"><label>Password</label><input type={showPass ? 'text' : 'password'} value={secret.password} onChange={e => setSecret(s => ({...s, password: e.target.value}))} placeholder={initialData ? "Leave blank to keep old" : ""} required={!initialData} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" /><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-9">{showPass ? <EyeSlashIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}</button></div>
                            <div><label>Billing Plan</label><select value={secret.profile} onChange={e => setSecret(s => ({...s, profile: e.target.value}))} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700">
                                <option value="">-- No Change --</option>
                                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select></div>
                            <hr className="my-4 border-slate-200 dark:border-slate-700" />
                            <h4 className="font-semibold">Customer Information (Optional)</h4>
                            <div><label>Full Name</label><input type="text" value={customer.fullName} onChange={e => setCustomer(c => ({...c, fullName: e.target.value}))} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" /></div>
                            <div><label>Full Address</label><input type="text" value={customer.address} onChange={e => setCustomer(c => ({...c, address: e.target.value}))} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" /></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label>Contact Number</label><input type="text" value={customer.contactNumber} onChange={e => setCustomer(c => ({...c, contactNumber: e.target.value}))} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" /></div>
                                <div><label>Email</label><input type="email" value={customer.email} onChange={e => setCustomer(c => ({...c, email: e.target.value}))} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" /></div>
                            </div>
                         </div>
                    </div>
                     <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={isSubmitting}>Save</button></div>
                </form>
                </div>
            </div>
        )
    };
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return (
        <div>
            <UserFormModal isOpen={isUserModalOpen} onClose={() => setUserModalOpen(false)} onSave={handleSaveUser} initialData={selectedSecret} />
            <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} secret={selectedSecret} plans={plans} profiles={profiles} onSave={handlePayment} companySettings={companySettings} />

             <div className="flex justify-end mb-4">
                <button onClick={() => { setSelectedSecret(null); setUserModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New User</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                 <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Username/Customer</th><th className="px-6 py-3">Profile</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Subscription Due</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {combinedUsers.map(user => (
                            <tr key={user.id} className={`border-b dark:border-slate-700 ${user.disabled === 'true' ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 font-medium">
                                    <p className="text-slate-900 dark:text-slate-100">{user.name}</p>
                                    <p className="text-xs text-slate-500">{user.customer?.fullName}</p>
                                </td>
                                <td>{user.profile}</td>
                                <td>{user.isActive ? <span className="text-green-500">Active</span> : <span className="text-slate-500">Inactive</span>}</td>
                                <td>{user.subscription.dueDate}</td>
                                <td className="px-6 py-4 text-right space-x-1">
                                    <button onClick={() => { setSelectedSecret(user); setPaymentModalOpen(true); }} className="p-1"><CurrencyDollarIcon className="w-5 h-5"/></button>
                                    <button onClick={() => { setSelectedSecret(user); setUserModalOpen(true); }} className="p-1"><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDeleteUser(user.id)} className="p-1"><TrashIcon className="w-5 h-5"/></button>
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
        <div className="space-y-8">
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
