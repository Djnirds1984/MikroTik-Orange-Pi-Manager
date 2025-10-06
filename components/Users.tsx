import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, PppActiveConnection, PppSecretData, SaleRecord, Customer, BillingPlanWithId } from '../types.ts';
import {
    getPppSecrets,
    getPppProfiles,
    getPppActiveConnections,
    addPppSecret,
    updatePppSecret,
    deletePppSecret,
} from '../services/mikrotikService.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { useCompanySettings } from '../hooks/useCompanySettings.ts';
import { PaymentModal } from './PaymentModal.tsx';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, CurrencyDollarIcon } from '../constants.tsx';
import { useLocalization } from '../contexts/LocalizationContext.tsx';


// --- Secret Form Modal ---
interface SecretFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (secretData: PppSecret | PppSecretData, customerData: Partial<Customer>) => void;
    initialData: PppSecret | null;
    profiles: PppProfile[];
    billingPlans: BillingPlanWithId[]; // Use billing plans for profile selection
    isLoading: boolean;
}

const SecretFormModal: React.FC<SecretFormModalProps> = ({ isOpen, onClose, onSave, initialData, profiles, billingPlans, isLoading }) => {
    // This form state will now be simpler, focusing on credentials and customer info.
    // The profile will be derived from the selected billing plan.
    const defaultSecret: Partial<PppSecretData> = { name: '', password: '', disabled: 'false' };
    const defaultCustomer: Partial<Customer> = { fullName: '', address: '', contactNumber: '', email: '' };

    const [secret, setSecret] = useState<Partial<PppSecretData>>(defaultSecret);
    const [customer, setCustomer] = useState<Partial<Customer>>(defaultCustomer);
    const [selectedPlanId, setSelectedPlanId] = useState('');


    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // For editing, we find the plan that matches the user's current profile.
                const currentPlan = billingPlans.find(p => p.pppoeProfile === initialData.profile);
                setSelectedPlanId(currentPlan?.id || '');
                
                setSecret({
                    name: initialData.name,
                    password: '', // Don't pre-fill password for security
                    disabled: initialData.disabled,
                });
                setCustomer(initialData.customer || defaultCustomer);
            } else {
                // For adding, set the first plan as default
                const defaultPlan = billingPlans.length > 0 ? billingPlans[0].id : '';
                setSelectedPlanId(defaultPlan);
                setSecret(defaultSecret);
                setCustomer(defaultCustomer);
            }
        }
    }, [initialData, isOpen, billingPlans]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (Object.keys(secret).includes(name)) {
            setSecret(s => ({ ...s, [name]: value }));
        } else if (name === 'billingPlan') {
            setSelectedPlanId(value);
        } else {
            setCustomer(c => ({ ...c, [name]: value }));
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const selectedPlan = billingPlans.find(p => p.id === selectedPlanId);
        if (!selectedPlan) {
            alert("Please select a valid billing plan.");
            return;
        }

        let existingCommentData = {};
        if (initialData?.comment) {
            try {
                existingCommentData = JSON.parse(initialData.comment);
            } catch(e) { /* ignore if not valid json, will be overwritten */ }
        }

        // This object contains only the fields relevant to the MikroTik API
        const apiSafeSecretData: PppSecretData = {
            name: secret.name!,
            password: secret.password,
            service: 'pppoe',
            profile: selectedPlan.pppoeProfile,
            comment: JSON.stringify({ ...existingCommentData, plan: selectedPlan.name }),
            disabled: secret.disabled!,
        };
        
        let dataToSave: PppSecret | PppSecretData;

        if (initialData) {
            // Reconstruct the object for editing to ensure no extra frontend-only properties are included
            dataToSave = {
                id: initialData.id,
                name: apiSafeSecretData.name,
                service: apiSafeSecretData.service,
                profile: apiSafeSecretData.profile,
                comment: apiSafeSecretData.comment,
                disabled: apiSafeSecretData.disabled,
            } as PppSecret;
            // Only add the password to the payload if the user actually entered one.
            if (apiSafeSecretData.password) {
                dataToSave.password = apiSafeSecretData.password;
            }
        } else {
            // For new users, the object is already clean.
            dataToSave = apiSafeSecretData;
        }

        onSave(dataToSave, customer);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                <form onSubmit={handleSubmit} className="flex flex-col flex-grow">
                     <div className="p-6 overflow-y-auto">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        
                        <div className="space-y-4">
                            <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">PPPoE Credentials (Required)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                                    <input type="text" name="name" value={secret.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" disabled={!!initialData} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                                    <input type="password" name="password" value={secret.password || ''} onChange={handleChange} required={!initialData} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder={initialData ? "Leave blank to keep existing" : ""} />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Billing Plan (Sets Profile)</label>
                                <select name="billingPlan" value={selectedPlanId} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                    {billingPlans.length > 0 ? billingPlans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pppoeProfile})</option>) : <option disabled>No billing plans found</option>}
                                </select>
                            </div>
                            
                            <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 pt-4">Customer Information (Optional)</h4>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                                <input type="text" name="fullName" value={customer.fullName || ''} onChange={handleChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                                <textarea name="address" value={customer.address || ''} onChange={handleChange} rows={2} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white"></textarea>
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contact Number</label>
                                    <input type="tel" name="contactNumber" value={customer.contactNumber || ''} onChange={handleChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                                    <input type="email" name="email" value={customer.email || ''} onChange={handleChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg mt-auto sticky bottom-0">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">
                            {isLoading ? 'Saving...' : 'Save User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Main Component ---
interface UsersProps {
    selectedRouter: RouterConfigWithId | null;
    addSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<void>;
}

export const Users: React.FC<UsersProps> = ({ selectedRouter, addSale }) => {
    const { t } = useLocalization();
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [activeConnections, setActiveConnections] = useState<PppActiveConnection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Local DB state for customers
    const { customers, addCustomer, updateCustomer, deleteCustomer } = useCustomers(selectedRouter?.id || null);
    
    // Billing and payment state
    const { plans, isLoading: isLoadingPlans } = useBillingPlans();
    const { settings: companySettings } = useCompanySettings();
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingSecret, setPayingSecret] = useState<PppSecret | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setSecrets([]);
            setProfiles([]);
            setActiveConnections([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const [secretsData, profilesData, activeData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppProfiles(selectedRouter),
                getPppActiveConnections(selectedRouter),
            ]);
            setSecrets(secretsData);
            setProfiles(profilesData);
            setActiveConnections(activeData);
        } catch (err) {
            console.error("Failed to fetch PPPoE user data:", err);
            setError(`Could not fetch user data. Ensure the PPP package is enabled on "${selectedRouter.name}". Message: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const combinedData = useMemo(() => {
        return secrets.map(secret => {
            const customerData = customers.find(c => c.username === secret.name && c.routerId === selectedRouter?.id);
            const activeConnection = activeConnections.find(ac => ac.name === secret.name);
            return {
                ...secret,
                customer: customerData,
                isActive: !!activeConnection,
                activeInfo: activeConnection
            };
        }).filter(item => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                item.name.toLowerCase().includes(term) ||
                (item.customer?.fullName && item.customer.fullName.toLowerCase().includes(term)) ||
                item.profile.toLowerCase().includes(term) ||
                item.comment.toLowerCase().includes(term)
            );
        });
    }, [secrets, customers, activeConnections, selectedRouter, searchTerm]);

    const handleSave = async (secretData: PppSecret | PppSecretData, customerData: Partial<Customer>) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            if ('id' in secretData) { // Editing existing secret
                await updatePppSecret(selectedRouter, secretData as PppSecret);
                const existingCustomer = customers.find(c => c.username === secretData.name && c.routerId === selectedRouter.id);
                if (existingCustomer) {
                    await updateCustomer({ ...existingCustomer, ...customerData });
                } else {
                     await addCustomer({
                        routerId: selectedRouter.id,
                        username: secretData.name,
                        ...customerData
                    } as Omit<Customer, 'id'>);
                }
            } else { // Adding new secret
                await addPppSecret(selectedRouter, secretData);
                 await addCustomer({
                    routerId: selectedRouter.id,
                    username: secretData.name,
                    ...customerData
                } as Omit<Customer, 'id'>);
            }
            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error saving user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (secret: PppSecret) => {
        if (!selectedRouter || !window.confirm(`Are you sure you want to delete user "${secret.name}"? This will also remove their local customer data.`)) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, secret.id);
            if (secret.customer) {
                await deleteCustomer(secret.customer.id);
            }
            await fetchData();
        } catch (err) {
            alert(`Error deleting user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleOpenPayment = (secret: PppSecret) => {
        setPayingSecret(secret);
        setIsPaymentModalOpen(true);
    };

    // This function now uses the old payment modal's logic.
    const handleProcessPayment = async (data: {
        sale: Omit<SaleRecord, 'id' | 'date' | 'routerName'>,
        payment: { plan: BillingPlanWithId, nonPaymentProfile: string, discountDays: number, paymentDate: string }
    }) => {
        if (!selectedRouter || !payingSecret) return false;
        
        // This is a placeholder for the original payment logic from mikrotikService.ts
        // which I am not allowed to touch. This simulates sending the correct data to the backend.
        const processOnRouter = async (paymentData: any) => {
            const { routerConfig, ...rest } = paymentData;
            const response = await fetch(`http://${window.location.hostname}:3002/api/ppp/process-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ routerConfig, ...rest }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Failed to process payment on router.');
            }
            return response.json();
        }

        try {
            // 1. Process payment on the router
            await processOnRouter({
                routerConfig: selectedRouter,
                secret: payingSecret,
                ...data.payment
            });

            // 2. Add record to local sales DB
            await addSale({
                ...data.sale,
                date: new Date().toISOString(),
                routerName: selectedRouter.name,
            });

            // 3. Refresh data to show updated comment/due date
            await fetchData();
            
            return true; // Indicate success
        } catch (err) {
            alert(`Error processing payment: ${(err as Error).message}`);
            return false; // Indicate failure
        }
    };

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">PPPoE User Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its PPPoE users.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return <div className="flex justify-center h-64 items-center"><Loader /></div>;
    }
    
    if (error) {
         return <div className="text-center p-8 bg-red-50 dark:bg-red-900/30 rounded-lg text-red-700 dark:text-red-300">{error}</div>;
    }

    return (
        <div className="max-w-7xl mx-auto">
             <SecretFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingSecret}
                profiles={profiles}
                billingPlans={plans}
                isLoading={isSubmitting}
            />
            {payingSecret && (
                <PaymentModal 
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    secret={payingSecret}
                    plans={plans}
                    profiles={profiles}
                    onSave={handleProcessPayment}
                    companySettings={companySettings}
                />
            )}

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users</h2>
                <div className="flex items-center gap-4">
                     <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full md:w-64 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                    <button onClick={() => { setEditingSecret(null); setIsModalOpen(true); }} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold rounded-lg flex-shrink-0">
                        Add New User
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                         <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Username</th>
                                <th className="px-4 py-3">Customer Name</th>
                                <th className="px-4 py-3">Profile</th>
                                <th className="px-4 py-3">Subscription</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                             {combinedData.map(user => {
                                let dueDate = 'No Info';
                                try {
                                    if(user.comment) {
                                        const commentData = JSON.parse(user.comment);
                                        if (commentData.dueDate) {
                                            dueDate = new Date(commentData.dueDate).toLocaleDateString();
                                        }
                                    }
                                } catch (e) { /* ignore parse error */ }
                                return (
                                <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-3">
                                        {user.isActive ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Online</span> :
                                         user.disabled === 'true' ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Disabled</span> :
                                         <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-400">Offline</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">{user.name}</td>
                                    <td className="px-4 py-3">{user.customer?.fullName || <span className="text-slate-400 italic">Not set</span>}</td>
                                    <td className="px-4 py-3 font-mono text-cyan-600 dark:text-cyan-400">{user.profile}</td>
                                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 text-xs">
                                        {dueDate === 'No Info' ? 'No Info' : `Active (Due: ${dueDate})`}
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-1">
                                        <button onClick={() => handleOpenPayment(user)} disabled={isLoadingPlans || isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-green-500 rounded-md disabled:opacity-50" title="Process Payment">
                                            <CurrencyDollarIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => { setEditingSecret(user); setIsModalOpen(true); }} className="p-2 text-slate-500 dark:text-slate-400 hover:text-[--color-primary-500] rounded-md" title="Edit User">
                                            <EditIcon className="h-5 w-5" />
                                        </button>
                                         <button onClick={() => handleDelete(user)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md" title="Delete User">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};