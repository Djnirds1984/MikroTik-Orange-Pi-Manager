
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, PppActiveConnection, BillingPlan, PppSecretData } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, SignalIcon } from '../constants.tsx';

// --- Modal for Add/Edit User ---
interface SecretFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (secretData: PppSecret | PppSecretData) => void;
    initialData: PppSecret | null;
    profiles: PppProfile[];
    isLoading: boolean;
    profileError?: string;
}

const SecretFormModal: React.FC<SecretFormModalProps> = ({ isOpen, onClose, onSave, initialData, profiles, isLoading, profileError }) => {
    const [secret, setSecret] = useState<PppSecretData & { password?: string }>({ name: '', service: 'pppoe', profile: '', comment: '' });

    useEffect(() => {
        if (initialData) {
            setSecret({ ...initialData, password: '' });
        } else {
            setSecret({ name: '', service: 'pppoe', profile: profiles[0]?.name || '', comment: '', password: '' });
        }
    }, [initialData, isOpen, profiles]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(s => ({ ...s, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(initialData ? { ...secret, id: initialData.id } : secret);
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-orange-400 mb-4">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-slate-300">Username</label>
                                    <input type="text" name="name" id="name" value={secret.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                                </div>
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
                                    <input type="password" name="password" id="password" value={secret.password || ''} onChange={handleChange} placeholder={initialData ? "Leave blank to keep existing" : ""} required={!initialData} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="service" className="block text-sm font-medium text-slate-300">Service</label>
                                    <select name="service" id="service" value={secret.service} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white">
                                        <option value="pppoe">pppoe</option>
                                        <option value="any">any</option>
                                        <option value="l2tp">l2tp</option>
                                        <option value="ovpn">ovpn</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="profile" className="block text-sm font-medium text-slate-300">Profile</label>
                                    <select name="profile" id="profile" value={secret.profile} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white">
                                        {profileError && <option disabled>Error loading profiles</option>}
                                        {profiles.length > 0 ? profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>) : <option disabled>No profiles found</option>}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="comment" className="block text-sm font-medium text-slate-300">Comment</label>
                                <input type="text" name="comment" id="comment" value={secret.comment} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" placeholder="Optional info or payment details in JSON" />
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500">
                            {isLoading ? 'Saving...' : 'Save User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Modal for Payment Processing ---
interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (plan: BillingPlan, nonPaymentProfile: string) => void;
    user: PppSecret | null;
    plans: BillingPlan[];
    profiles: PppProfile[];
    isLoading: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSubmit, user, plans, profiles, isLoading }) => {
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [nonPaymentProfile, setNonPaymentProfile] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedPlanId(plans[0]?.id || '');
            const defaultCutoffProfile = profiles.find(p => p.name.toLowerCase().includes('cutoff') || p.name.toLowerCase().includes('expired'))?.name;
            setNonPaymentProfile(defaultCutoffProfile || profiles[0]?.name || '');
        }
    }, [isOpen, plans, profiles]);

    if (!isOpen || !user) return null;

    const handleSubmit = () => {
        const plan = plans.find(p => p.id === selectedPlanId);
        if (plan && nonPaymentProfile) {
            onSubmit(plan, nonPaymentProfile);
        } else {
            alert('Please select a valid plan and expiry profile.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-700">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-orange-400 mb-2">Process Payment</h3>
                    <p className="text-sm text-slate-400 mb-4">Renew subscription for user <span className="font-mono text-white">{user.name}</span>.</p>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="billingPlan" className="block text-sm font-medium text-slate-300">Select Billing Plan</label>
                            <select id="billingPlan" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white">
                                {plans.length > 0 ? plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.price} {p.currency})</option>) : <option disabled>No billing plans configured</option>}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="nonPaymentProfile" className="block text-sm font-medium text-slate-300">Profile on Expiry</label>
                             <select id="nonPaymentProfile" value={nonPaymentProfile} onChange={e => setNonPaymentProfile(e.target.value)} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white">
                                {profiles.length > 0 ? profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>) : <option disabled>No profiles found</option>}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">The user will be moved to this profile when their plan expires.</p>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                    <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700">Cancel</button>
                    <button onClick={handleSubmit} disabled={isLoading || !selectedPlanId || !nonPaymentProfile} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-500 disabled:opacity-50">
                        {isLoading ? 'Processing...' : 'Confirm Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Users Component ---
export const Users: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    const [payingSecret, setPayingSecret] = useState<PppSecret | null>(null);
    
    const { plans } = useBillingPlans();

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSecrets([]);
            setActive([]);
            setProfiles([]);
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const [secretsData, activeData, profilesData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppActive(selectedRouter),
                getPppProfiles(selectedRouter)
            ]);
            setSecrets(secretsData);
            setActive(activeData);
            setProfiles(profilesData);
        } catch (err) {
            console.error("Failed to fetch user data:", err);
            setError(`Could not fetch PPPoE users from "${selectedRouter.name}". Ensure the PPP package is enabled.`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(() => {
            if (selectedRouter && !isLoading) {
                 getPppActive(selectedRouter).then(setActive).catch(() => {}); // Poll active connections silently
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchData, selectedRouter, isLoading]);
    
    const handleAdd = () => {
        setEditingSecret(null);
        setIsFormModalOpen(true);
    };

    const handleEdit = (secret: PppSecret) => {
        setEditingSecret(secret);
        setIsFormModalOpen(true);
    };

    const handleDelete = async (secretId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to delete this user?")) return;
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

    const handleSave = async (secretData: PppSecret | PppSecretData) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            if ('id' in secretData) {
                await updatePppSecret(selectedRouter, secretData as PppSecret);
            } else {
                await addPppSecret(selectedRouter, secretData as PppSecretData);
            }
            setIsFormModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error saving user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleOpenPayment = (secret: PppSecret) => {
        setPayingSecret(secret);
        setIsPaymentModalOpen(true);
    };
    
    const handleProcessPayment = async (plan: BillingPlan, nonPaymentProfile: string) => {
        if (!selectedRouter || !payingSecret) return;
        setIsSubmitting(true);
        try {
            await processPppPayment(selectedRouter, payingSecret, plan, nonPaymentProfile);
            setIsPaymentModalOpen(false);
            setPayingSecret(null);
            await fetchData();
        } catch (err) {
             alert(`Error processing payment: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const parseComment = (comment?: string): { dueDate?: string; plan?: string; isExpired?: boolean } => {
        if (!comment) return {};
        try {
            const data = JSON.parse(comment);
            const result: { dueDate?: string; plan?: string; isExpired?: boolean } = {};
            if (data.dueDate) {
                result.dueDate = data.dueDate;
                const dueDate = new Date(data.dueDate);
                if (dueDate < new Date()) {
                    result.isExpired = true;
                }
            }
            if (data.plan) result.plan = data.plan;
            return result;
        } catch {
            return {};
        }
    };

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-slate-800 rounded-lg border border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-200">PPPoE User Manager</h2>
                <p className="mt-2 text-slate-400">Please select a router to manage its PPPoE users.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-orange-400">Fetching PPPoE users from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (error) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-400">Failed to load PPPoE data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error}</p>
            </div>
         );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <SecretFormModal
                isOpen={isFormModalOpen}
                onClose={() => setIsFormModalOpen(false)}
                onSave={handleSave}
                initialData={editingSecret}
                profiles={profiles}
                isLoading={isSubmitting}
            />
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onSubmit={handleProcessPayment}
                user={payingSecret}
                plans={plans}
                profiles={profiles}
                isLoading={isSubmitting}
            />

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-slate-100">PPPoE Users</h2>
                <button onClick={handleAdd} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">
                    Add New User
                </button>
            </div>
            
            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Username</th>
                                <th scope="col" className="px-6 py-3">Service</th>
                                <th scope="col" className="px-6 py-3">Profile</th>
                                <th scope="col" className="px-6 py-3">Payment Info</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                           {secrets.length > 0 ? secrets.map(secret => {
                                const isActive = active.some(a => a.name === secret.name);
                                const commentInfo = parseComment(secret.comment);
                                return (
                                <tr key={secret.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                                            {isActive ? 'Online' : 'Offline'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-200">{secret.name}</td>
                                    <td className="px-6 py-4 font-mono text-slate-300">{secret.service}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-400">{secret.profile}</td>
                                    <td className="px-6 py-4 font-mono text-xs">
                                        {commentInfo.plan ? (
                                            <div>
                                                <p className="text-slate-300">Plan: {commentInfo.plan}</p>
                                                <p className={commentInfo.isExpired ? 'text-red-400' : 'text-green-400'}>Due: {commentInfo.dueDate}</p>
                                            </div>
                                        ) : <span className="text-slate-500">N/A</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-1">
                                        <button onClick={() => handleOpenPayment(secret)} className="p-2 text-slate-400 hover:text-green-400 rounded-md" title="Process Payment">
                                            <SignalIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleEdit(secret)} className="p-2 text-slate-400 hover:text-orange-400 rounded-md" title="Edit User">
                                            <EditIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleDelete(secret.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-md" title="Delete User">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                                );
                           }) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-500">
                                        No PPPoE users (secrets) found on this router.
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
