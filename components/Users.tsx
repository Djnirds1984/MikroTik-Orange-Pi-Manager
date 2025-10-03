
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, PppSecret, PppSecretData, PppProfile, PppActiveConnection, BillingPlanWithId } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon } from '../constants.tsx';

// --- Helper Functions ---
const parseComment = (comment: string | undefined): { dueDate?: string; plan?: string } => {
    if (!comment) return {};
    try {
        const data = JSON.parse(comment);
        return {
            dueDate: data.dueDate,
            plan: data.plan,
        };
    } catch {
        return {};
    }
};

const getStatus = (dueDate: string | undefined): { text: string; color: string } => {
    if (!dueDate) return { text: 'No Info', color: 'text-slate-500' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    
    if (due < today) {
        return { text: 'Expired', color: 'text-red-400' };
    }
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) {
        return { text: `Expires in ${diffDays} day(s)`, color: 'text-yellow-400' };
    }
    
    return { text: 'Active', color: 'text-green-400' };
};

// --- Secret Form Modal ---
interface SecretFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (secretData: PppSecret | PppSecretData) => void;
    initialData: PppSecret | null;
    profiles: PppProfile[];
    isLoading: boolean;
}

const SecretFormModal: React.FC<SecretFormModalProps> = ({ isOpen, onClose, onSave, initialData, profiles, isLoading }) => {
    // FIX: Define a default state to avoid issues with controlled/uncontrolled components.
    const defaultSecretState: PppSecretData = { name: '', password: '', service: 'pppoe', profile: '', comment: '' };
    const [secret, setSecret] = useState<PppSecretData>(defaultSecretState);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // For editing, pre-fill data but keep password blank for security
                setSecret({ ...initialData, password: '' });
            } else {
                // For adding, set default values, including the first available profile
                setSecret({ ...defaultSecretState, profile: profiles[0]?.name || '' });
            }
        }
    }, [initialData, isOpen, profiles]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(s => ({ ...s, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        let dataToSave: PppSecret | PppSecretData = { ...secret };
        
        if (initialData) {
            // It's an update
            dataToSave = { ...initialData, ...secret };
            if (!secret.password) {
                // If password field is empty on edit, we don't want to change it.
                // The backend service needs to handle the absence of the password field.
                // @ts-ignore
                delete dataToSave.password;
            }
        }
        
        onSave(dataToSave);
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
                                    <input type="text" name="name" id="name" value={secret.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" />
                                </div>
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
                                    <input type="password" name="password" id="password" value={secret.password || ''} onChange={handleChange} placeholder={initialData ? "Leave blank to keep existing" : ""} required={!initialData} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="service" className="block text-sm font-medium text-slate-300">Service</label>
                                    <select name="service" id="service" value={secret.service} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500">
                                        <option value="any">any</option>
                                        <option value="pppoe">pppoe</option>
                                        <option value="l2tp">l2tp</option>
                                        <option value="ovpn">ovpn</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="profile" className="block text-sm font-medium text-slate-300">Profile</label>
                                    <select name="profile" id="profile" value={secret.profile} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500">
                                        {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50">
                            {isLoading ? 'Saving...' : 'Save User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Payment Modal ---
interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProcess: (plan: BillingPlanWithId) => void;
    user: PppSecret | null;
    plans: BillingPlanWithId[];
    isLoading: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onProcess, user, plans, isLoading }) => {
    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    
    useEffect(() => {
        if (isOpen && plans.length > 0) {
            setSelectedPlanId(plans[0].id);
        }
    }, [isOpen, plans]);

    if (!isOpen || !user) return null;

    const handleSubmit = () => {
        const selectedPlan = plans.find(p => p.id === selectedPlanId);
        if (selectedPlan) {
            onProcess(selectedPlan);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-700">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-orange-400 mb-2">Process Payment</h3>
                    <p className="text-sm text-slate-400 mb-4">Select a billing plan for user <span className="font-mono text-white">{user.name}</span>.</p>
                    <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500"
                    >
                        {plans.map(plan => (
                            <option key={plan.id} value={plan.id}>
                                {plan.name} ({plan.price} {plan.currency}/{plan.cycle})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                    <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700">Cancel</button>
                    <button type="button" onClick={handleSubmit} disabled={isLoading || !selectedPlanId} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50">
                        {isLoading ? 'Processing...' : 'Process'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---
export const Users: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingSecret, setPayingSecret] = useState<PppSecret | null>(null);
    const { plans } = useBillingPlans();

    // In a real app, this should be a configurable setting.
    const nonPaymentProfile = 'expired-profile'; 

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
                getPppProfiles(selectedRouter),
            ]);
            setSecrets(secretsData);
            setActive(activeData);
            setProfiles(profilesData);
        } catch (err) {
            console.error("Failed to fetch PPPoE user data:", err);
            setError(`Could not fetch PPPoE data. Ensure the PPP package is enabled on "${selectedRouter.name}".`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAdd = () => {
        if (profiles.length === 0) {
            alert("No PPPoE profiles found. Please create a profile before adding a user.");
            return;
        }
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
            if ('id' in secretData && secretData.id) {
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

    const handleProcessPayment = async (plan: BillingPlanWithId) => {
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
                <p className="text-xl font-semibold text-red-400">Failed to load user data.</p>
                <p className="mt-2 text-slate-400 text-sm">{error}</p>
            </div>
         );
    }

    const activeUserNames = new Set(active.map(a => a.name));

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
                onProcess={handleProcessPayment}
                user={payingSecret}
                plans={plans}
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
                                <th scope="col" className="px-6 py-3">Username</th>
                                <th scope="col" className="px-6 py-3">Profile</th>
                                <th scope="col" className="px-6 py-3">Connection</th>
                                <th scope="col" className="px-6 py-3">Billing Plan</th>
                                <th scope="col" className="px-6 py-3">Subscription</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {secrets.length > 0 ? secrets.map(secret => {
                                const commentData = parseComment(secret.comment);
                                const subscriptionStatus = getStatus(commentData.dueDate);
                                const isActive = activeUserNames.has(secret.name);
                                return (
                                    <tr key={secret.id} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-slate-200">{secret.name}</td>
                                        <td className="px-6 py-4 font-mono text-slate-300">{secret.profile}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/50 text-slate-400'}`}>
                                                {isActive ? 'Online' : 'Offline'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-cyan-400">{commentData.plan || 'N/A'}</td>
                                        <td className={`px-6 py-4 font-semibold ${subscriptionStatus.color}`}>{subscriptionStatus.text}</td>
                                        <td className="px-6 py-4 text-right space-x-1">
                                            <button onClick={() => handleOpenPayment(secret)} className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded-md font-semibold text-white">
                                                Pay
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
