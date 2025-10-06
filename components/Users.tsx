
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type {
    RouterConfigWithId,
    PppSecret,
    PppActiveConnection,
    PppProfile,
    SaleRecord,
    BillingPlanWithId,
    Customer,
    PppSecretData
} from '../types.ts';
import {
    getPppSecrets,
    getPppActive,
    addPppSecret,
    updatePppSecret,
    deletePppSecret,
    processPppPayment,
    getPppProfiles
} from '../services/mikrotikService.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, CurrencyDollarIcon, UsersIcon, CheckCircleIcon, ExclamationTriangleIcon, SearchIcon, KeyIcon } from '../constants.tsx';
import { useLocalization } from '../contexts/LocalizationContext.tsx';

interface UsersProps {
    selectedRouter: RouterConfigWithId | null;
    addSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<void>;
}

type CombinedUser = PppSecret & {
    isActive: boolean;
    customer?: Customer;
    parsedComment?: { plan: string; dueDate: string };
    connectionInfo?: PppActiveConnection;
};

// Helper to parse comment JSON safely
const parseComment = (comment: string): { plan: string; dueDate: string } | undefined => {
    try {
        const data = JSON.parse(comment);
        if (data && data.dueDate) {
            return data;
        }
    } catch (e) {
        // Not a JSON comment, ignore
    }
    return undefined;
};

// --- Secret Form Modal ---
const SecretFormModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    onSave: (secret: PppSecret | PppSecretData) => void,
    initialData: PppSecret | null,
    profiles: PppProfile[],
    isSubmitting: boolean
}> = ({ isOpen, onClose, onSave, initialData, profiles, isSubmitting }) => {
    const [secret, setSecret] = useState<PppSecretData>({ name: '', password: '', service: 'pppoe', profile: '', comment: '', disabled: 'false' });

    useEffect(() => {
        if (initialData) {
            setSecret({
                name: initialData.name,
                password: '', // Don't show existing password
                service: initialData.service || 'pppoe',
                profile: initialData.profile,
                comment: initialData.comment,
                disabled: initialData.disabled || 'false',
            });
        } else {
            setSecret({ name: '', password: '', service: 'pppoe', profile: profiles[0]?.name || '', comment: '', disabled: 'false' });
        }
    }, [initialData, profiles, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(s => ({ ...s, [name]: value }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave = { ...secret };
        if (initialData) {
            // If password is not changed, don't send it
            if (!dataToSave.password) delete dataToSave.password;
            onSave({ ...initialData, ...dataToSave });
        } else {
            onSave(dataToSave);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-[--color-primary-500] mb-4">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                                    <input type="text" name="name" id="name" value={secret.name} onChange={handleChange} required disabled={!!initialData} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md disabled:opacity-50" />
                                </div>
                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                                    <input type="password" name="password" id="password" value={secret.password} onChange={handleChange} required={!initialData} placeholder={initialData ? "Leave blank to keep old" : ""} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="profile" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile</label>
                                <select name="profile" id="profile" value={secret.profile} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                    {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="disabled" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                                <select name="disabled" id="disabled" value={secret.disabled} onChange={handleChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                    <option value="false">Enabled</option>
                                    <option value="true">Disabled</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Payment Modal ---
const PaymentModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    onProcessPayment: (plan: BillingPlanWithId, nonPaymentProfile: string, discount: number, paymentDate: string) => void,
    user: CombinedUser,
    plans: BillingPlanWithId[],
    profiles: PppProfile[],
    isSubmitting: boolean
}> = ({ isOpen, onClose, onProcessPayment, user, plans, profiles, isSubmitting }) => {
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [nonPaymentProfile, setNonPaymentProfile] = useState('');
    const [discount, setDiscount] = useState(0);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if(isOpen) {
            setSelectedPlanId(plans[0]?.id || '');
            const defaultNonPaymentProfile = profiles.find(p => p.name.toLowerCase().includes('expired') || p.name.toLowerCase().includes('cutoff'))?.name || profiles[0]?.name || '';
            setNonPaymentProfile(defaultNonPaymentProfile);
            setDiscount(0);
            setPaymentDate(new Date().toISOString().split('T')[0]);
        }
    }, [isOpen, plans, profiles]);
    
    if (!isOpen) return null;

    const selectedPlan = plans.find(p => p.id === selectedPlanId);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedPlan) {
            onProcessPayment(selectedPlan, nonPaymentProfile, discount, paymentDate);
        }
    };
    
    return (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-[--color-primary-500] mb-1">Process Payment</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">For user: <span className="font-bold">{user.name}</span></p>
                        <div className="space-y-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium">Billing Plan</label>
                                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.price} {p.currency})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Non-Payment Profile</label>
                                <select value={nonPaymentProfile} onChange={e => setNonPaymentProfile(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                    {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                                <p className="text-xs text-slate-500 mt-1">Profile to apply on due date.</p>
                            </div>
                             <div>
                                <label className="block text-sm font-medium">Payment Date</label>
                                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium">Discount</label>
                                <input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} min="0" className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                            </div>
                            <div className="text-right font-bold text-lg pt-2 border-t border-slate-200 dark:border-slate-700">
                                Total: {selectedPlan ? (selectedPlan.price - discount).toFixed(2) : '0.00'} {selectedPlan?.currency}
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting || !selectedPlan}>{isSubmitting ? 'Processing...' : 'Process Payment'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Main Component ---
export const Users: React.FC<UsersProps> = ({ selectedRouter, addSale }) => {
    const { t } = useLocalization();
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingUser, setPayingUser] = useState<CombinedUser | null>(null);

    const { plans, isLoading: isLoadingPlans } = useBillingPlans();
    const { customers, addCustomer, updateCustomer } = useCustomers(selectedRouter?.id || null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setSecrets([]);
            setActive([]);
            setProfiles([]);
            setIsLoading(false);
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
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const combinedUsers = useMemo<CombinedUser[]>(() => {
        return secrets.map(secret => {
            const connectionInfo = active.find(a => a.name === secret.name);
            const customer = customers.find(c => c.username === secret.name && c.routerId === selectedRouter?.id);
            const parsedComment = parseComment(secret.comment);
            
            return {
                ...secret,
                isActive: !!connectionInfo,
                connectionInfo,
                customer,
                parsedComment,
            };
        }).filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.customer?.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [secrets, active, customers, selectedRouter, searchTerm]);

    const handleSaveSecret = async (secret: PppSecret | PppSecretData) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            if ('id' in secret) {
                await updatePppSecret(selectedRouter, secret as PppSecret);
            } else {
                await addPppSecret(selectedRouter, secret as PppSecretData);
            }
            setIsSecretModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteSecret = async (secretId: string) => {
        if (!selectedRouter || !window.confirm("Delete this user?")) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, secretId);
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleProcessPayment = async (plan: BillingPlanWithId, nonPaymentProfile: string, discount: number, paymentDate: string) => {
        if (!selectedRouter || !payingUser) return;
        setIsSubmitting(true);
        try {
            await processPppPayment(selectedRouter, payingUser, plan, nonPaymentProfile, 0, paymentDate);
            
            const saleRecord: Omit<SaleRecord, 'id'> = {
                date: new Date(paymentDate).toISOString(),
                clientName: payingUser.customer?.fullName || payingUser.name,
                planName: plan.name,
                planPrice: plan.price,
                discountAmount: discount,
                finalAmount: plan.price - discount,
                routerName: selectedRouter.name,
                currency: plan.currency,
                clientAddress: payingUser.customer?.address,
                clientContact: payingUser.customer?.contactNumber,
                clientEmail: payingUser.customer?.email,
            };
            await addSale(saleRecord);
            
            alert('Payment processed successfully!');
            setIsPaymentModalOpen(false);
            await fetchData();
        } catch (err) {
             alert(`Payment failed: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusChip = (user: CombinedUser) => {
        if (user.isActive) {
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Active</span>;
        }
        if (user.disabled === 'true') {
             return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Disabled</span>;
        }
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600/50 text-slate-600 dark:text-slate-400">Offline</span>;
    };

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">PPPoE User Manager</h2>
                <p className="mt-2 text-slate-500">Please select a router to manage its users.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="flex justify-center mt-8"><Loader /></div>;
    if (error) return <div className="text-red-500 text-center">{error}</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <SecretFormModal 
                isOpen={isSecretModalOpen}
                onClose={() => setIsSecretModalOpen(false)}
                onSave={handleSaveSecret}
                initialData={editingSecret}
                profiles={profiles}
                isSubmitting={isSubmitting}
            />
            {payingUser && <PaymentModal 
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onProcessPayment={handleProcessPayment}
                user={payingUser}
                plans={plans}
                profiles={profiles}
                isSubmitting={isSubmitting}
            />}
            
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users</h2>
                <div className="flex items-center gap-4">
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-slate-400" /></span>
                        <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4" />
                    </div>
                    <button onClick={() => { setEditingSecret(null); setIsSecretModalOpen(true); }} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg">Add User</button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-4 py-3">Username</th>
                                <th className="px-4 py-3">Full Name</th>
                                <th className="px-4 py-3">Profile / Plan</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Due Date</th>
                                <th className="px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {combinedUsers.map(user => (
                                <tr key={user.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-200">{user.name}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.customer?.fullName || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">{user.profile}</span>
                                        {user.parsedComment && <span className="block text-xs mt-1">{user.parsedComment.plan}</span>}
                                    </td>
                                    <td className="px-4 py-3">{getStatusChip(user)}</td>
                                    <td className="px-4 py-3 font-mono">{user.parsedComment?.dueDate ? new Date(user.parsedComment.dueDate).toLocaleDateString() : '-'}</td>
                                    <td className="px-4 py-3 space-x-1">
                                        <button onClick={() => { setPayingUser(user); setIsPaymentModalOpen(true); }} className="p-2 text-slate-500 hover:text-green-500" title="Process Payment"><CurrencyDollarIcon className="h-5 w-5"/></button>
                                        <button onClick={() => { setEditingSecret(user); setIsSecretModalOpen(true); }} className="p-2 text-slate-500 hover:text-[--color-primary-500]" title="Edit User"><EditIcon className="h-5 w-5"/></button>
                                        <button onClick={() => handleDeleteSecret(user.id)} className="p-2 text-slate-500 hover:text-red-500" title="Delete User"><TrashIcon className="h-5 w-5"/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
