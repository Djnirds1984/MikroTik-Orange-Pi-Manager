
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppSecret, PppSecretData, PppProfile, PppActiveConnection, BillingPlanWithId, SaleRecord } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, ExclamationTriangleIcon, SearchIcon } from '../constants.tsx';
// FIX: Import useLocalization to handle currency formatting correctly.
import { useLocalization } from '../contexts/LocalizationContext.tsx';

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
    if (!dueDate) return { text: 'No Info', color: 'text-slate-500 dark:text-slate-500' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    
    if (due < today) {
        return { text: 'Expired', color: 'text-red-600 dark:text-red-400' };
    }
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) {
        return { text: `Expires in ${diffDays} day(s)`, color: 'text-yellow-600 dark:text-yellow-400' };
    }
    
    return { text: 'Active', color: 'text-green-600 dark:text-green-400' };
};

// --- Secret Form Modal (Add/Edit User) ---
interface SecretFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (secretData: PppSecret | PppSecretData) => void;
    initialData: PppSecret | null;
    plans: BillingPlanWithId[];
    isLoading: boolean;
}

const SecretFormModal: React.FC<SecretFormModalProps> = ({ isOpen, onClose, onSave, initialData, plans, isLoading }) => {
    const defaultSecretState = { name: '', password: '', service: 'pppoe', profile: '', comment: '' };
    const [secret, setSecret] = useState<PppSecretData>(defaultSecretState);
    const [selectedPlanId, setSelectedPlanId] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const commentData = parseComment(initialData.comment);
                const currentPlan = plans.find(p => p.name === commentData.plan);
                setSelectedPlanId(currentPlan?.id || '');
                setSecret({ ...initialData, password: '' });
            } else {
                setSelectedPlanId(plans[0]?.id || '');
                setSecret(defaultSecretState);
            }
        }
    }, [initialData, isOpen, plans]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(s => ({ ...s, [name]: value }));
    };
    
    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedPlanId(e.target.value);
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const selectedPlan = plans.find(p => p.id === selectedPlanId);
        if (!selectedPlan) {
            alert("Please select a valid billing plan.");
            return;
        }

        const commentJson = parseComment(initialData?.comment);
        const newComment = JSON.stringify({
            ...commentJson,
            plan: selectedPlan.name,
        });

        let dataToSave: PppSecret | PppSecretData = {
            ...secret,
            profile: selectedPlan.pppoeProfile,
            comment: newComment,
        };
        
        if (initialData) {
            dataToSave = { ...initialData, ...dataToSave };
            if (!secret.password) {
                delete (dataToSave as PppSecret).password;
            }
        }
        
        onSave(dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                                <input type="text" name="name" id="name" value={secret.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                                <input type="password" name="password" id="password" value={secret.password || ''} onChange={handleChange} placeholder={initialData ? "Leave blank to keep existing" : ""} required={!initialData} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <label htmlFor="plan" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Billing Plan</label>
                                <select id="plan" value={selectedPlanId} onChange={handlePlanChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pppoeProfile})</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">
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
    onProcess: (discountDays: number, paymentDate: string, nonPaymentProfile: string) => void;
    user: PppSecret | null;
    plans: BillingPlanWithId[];
    profiles: PppProfile[];
    isLoading: boolean;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onProcess, user, plans, profiles, isLoading }) => {
    const [paymentDate, setPaymentDate] = useState('');
    const [discountDays, setDiscountDays] = useState(0);
    const [expiryProfile, setExpiryProfile] = useState('');
    // FIX: Use localization context to format currency based on the plan's currency.
    const { language } = useLocalization();

    const currentUserPlan = useMemo(() => {
        if (!user) return null;
        const commentData = parseComment(user.comment);
        return plans.find(p => p.name === commentData.plan) || null;
    }, [user, plans]);

    useEffect(() => {
        if (isOpen) {
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setDiscountDays(0);
            const defaultProfile = profiles.find(p => p.name.toLowerCase().includes('expired'))?.name || profiles[0]?.name || '';
            setExpiryProfile(defaultProfile);
        }
    }, [isOpen, profiles]);

    if (!isOpen || !user) return null;

    const planPrice = currentUserPlan?.price || 0;
    const pricePerDay = planPrice / 30;
    const discountAmount = pricePerDay * discountDays;
    const finalAmount = planPrice - discountAmount;

    const handleSubmit = () => {
        onProcess(discountDays, paymentDate, expiryProfile);
    };
    
    // FIX: Create a robust formatting function that respects the plan's specific currency.
    const formatInPlanCurrency = (amount: number): string => {
        if (!currentUserPlan) return amount.toFixed(2);
        const lang = language === 'fil' ? 'en-PH' : 'en-US';
        return new Intl.NumberFormat(lang, {
            style: 'currency',
            currency: currentUserPlan.currency,
        }).format(amount);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-2">Record Payment for <span className="text-slate-900 dark:text-white">{user.name}</span></h3>
                    <div className="space-y-4 mt-4">
                        <div>
                            <label htmlFor="paymentDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Payment Date</label>
                            <input type="date" name="paymentDate" id="paymentDate" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                            <label htmlFor="discountDays" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Discount for Downtime (Days)</label>
                            <input type="number" name="discountDays" id="discountDays" value={discountDays} onChange={(e) => setDiscountDays(Number(e.target.value))} min="0" className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                        </div>
                        <div>
                            <label htmlFor="expiryProfile" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile on Expiry</label>
                            <select 
                                name="expiryProfile" 
                                id="expiryProfile" 
                                value={expiryProfile} 
                                onChange={(e) => setExpiryProfile(e.target.value)} 
                                required 
                                className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white"
                            >
                                {profiles.length > 0 ? (
                                    profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)
                                ) : (
                                    <option value="" disabled>No profiles loaded</option>
                                )}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">The user will be moved to this profile when their plan expires.</p>
                        </div>
                    </div>

                    {currentUserPlan ? (
                        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Plan Price:</span>
                                <span className="text-slate-700 dark:text-slate-200">{formatInPlanCurrency(planPrice)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Discount:</span>
                                <span className="text-red-600 dark:text-red-400">- {formatInPlanCurrency(discountAmount)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold mt-2">
                                <span className="text-green-600 dark:text-green-400">Final Amount:</span>
                                <span className="text-green-600 dark:text-green-400">{formatInPlanCurrency(finalAmount)}</span>
                            </div>
                        </div>
                    ) : (
                         <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-center text-yellow-600 dark:text-yellow-400 text-sm">
                            User does not have a valid billing plan assigned. Payment will only extend access.
                        </div>
                    )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                    <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600">Cancel</button>
                    <button type="button" onClick={handleSubmit} disabled={isLoading || !currentUserPlan || !expiryProfile} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500] disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLoading ? 'Processing...' : 'Confirm Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---
export const Users: React.FC<{
    selectedRouter: RouterConfigWithId | null;
    addSale: (sale: Omit<SaleRecord, 'id'>) => void;
}> = ({ selectedRouter, addSale }) => {
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingSecret, setPayingSecret] = useState<PppSecret | null>(null);
    const { plans, isLoading: isLoadingPlans } = useBillingPlans();
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setSecrets([]);
            setActive([]);
            setProfiles([]);
            return;
        }
        setIsLoading(true);
        setErrors({});

        const [secretsResult, activeResult, profilesResult] = await Promise.allSettled([
            getPppSecrets(selectedRouter),
            getPppActive(selectedRouter),
            getPppProfiles(selectedRouter),
        ]);

        const newErrors: Record<string, string> = {};

        if (secretsResult.status === 'fulfilled') {
            setSecrets(secretsResult.value);
        } else {
            console.error("Failed to fetch PPPoE secrets:", secretsResult.reason);
            newErrors.secrets = `Could not fetch PPPoE users (secrets).`;
        }
        
        if (activeResult.status === 'fulfilled') {
            setActive(activeResult.value);
        } else {
            console.error("Failed to fetch active connections:", activeResult.reason);
            newErrors.active = `Could not fetch online user status.`;
        }
        
        if (profilesResult.status === 'fulfilled') {
            setProfiles(profilesResult.value);
        } else {
            console.error("Failed to fetch PPPoE profiles:", profilesResult.reason);
            newErrors.profiles = `Could not fetch PPPoE profiles for payment modal.`;
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
        }

        setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredSecrets = useMemo(() => {
        if (!searchTerm.trim()) {
            return secrets;
        }
        const lowerCaseTerm = searchTerm.toLowerCase();
        return secrets.filter(secret =>
            secret.name.toLowerCase().includes(lowerCaseTerm) ||
            secret.profile.toLowerCase().includes(lowerCaseTerm) ||
            (secret.comment && secret.comment.toLowerCase().includes(lowerCaseTerm)) ||
            (secret['remote-address'] && secret['remote-address'].toLowerCase().includes(lowerCaseTerm))
        );
    }, [secrets, searchTerm]);

    const handleAdd = () => {
        if (isLoadingPlans) {
            alert("Billing plans are still loading, please wait.");
            return;
        }
        if (plans.length === 0) {
            alert("No billing plans found. Please create a billing plan before adding a user.");
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

    const handleProcessPayment = async (discountDays: number, paymentDate: string, nonPaymentProfile: string) => {
        if (!selectedRouter || !payingSecret) return;
        
        if (!nonPaymentProfile) {
            alert("Please select a profile for when the plan expires.");
            return;
        }

        const commentData = parseComment(payingSecret.comment);
        const currentUserPlan = plans.find(p => p.name === commentData.plan);
        if (!currentUserPlan) {
            alert("Cannot process payment: The user does not have a valid billing plan assigned.");
            return;
        }

        setIsSubmitting(true);
        try {
            await processPppPayment(selectedRouter, payingSecret, currentUserPlan, nonPaymentProfile, discountDays, paymentDate);

            const pricePerDay = currentUserPlan.price / 30;
            const discountAmount = pricePerDay * discountDays;
            const finalAmount = currentUserPlan.price - discountAmount;
            
            addSale({
                date: paymentDate,
                clientName: payingSecret.name,
                planName: currentUserPlan.name,
                planPrice: currentUserPlan.price,
                // FIX: Pass the currency from the billing plan to the sales record.
                currency: currentUserPlan.currency,
                discountAmount: discountAmount,
                finalAmount: finalAmount,
                routerName: selectedRouter.name,
            });

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
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">PPPoE User Manager</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its PPPoE users.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-[--color-primary-500] dark:text-[--color-primary-400]">Fetching PPPoE users from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (errors.secrets) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-red-50 dark:bg-slate-800 rounded-lg border border-red-200 dark:border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-700 dark:text-red-400">Failed to load user data.</p>
                <p className="mt-2 text-red-600 dark:text-slate-400 text-sm">{errors.secrets}</p>
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
                plans={plans}
                isLoading={isSubmitting}
            />
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                onProcess={handleProcessPayment}
                user={payingSecret}
                plans={plans}
                profiles={profiles}
                isLoading={isSubmitting}
            />

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        NOTE: The payment system uses the MikroTik scheduler to automatically change a user's profile upon their due date.
                    </p>
                </div>
                <div className="flex items-center gap-4 self-stretch md:self-center">
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-slate-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search user, profile, IP..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[--color-primary-500]"
                        />
                    </div>
                    <button onClick={handleAdd} disabled={isLoadingPlans} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg flex-shrink-0 disabled:opacity-50">
                        Add New User
                    </button>
                </div>
            </div>
            
            {Object.keys(errors).length > 0 && (
                 <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-300 p-3 rounded-lg mb-4 text-sm flex items-center gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">Data Warning:</p>
                        <ul className="list-disc pl-5">
                            {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
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
                            {filteredSecrets.length > 0 ? filteredSecrets.map(secret => {
                                const commentData = parseComment(secret.comment);
                                const subscriptionStatus = getStatus(commentData.dueDate);
                                const isActive = activeUserNames.has(secret.name);
                                return (
                                    <tr key={secret.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{secret.name}</td>
                                        <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{secret.profile}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${isActive ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-slate-200 dark:bg-slate-600/50 text-slate-600 dark:text-slate-400'}`}>
                                                {isActive ? 'Online' : 'Offline'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{commentData.plan || 'N/A'}</td>
                                        <td className={`px-6 py-4 font-semibold ${subscriptionStatus.color}`}>{commentData.dueDate ? `${subscriptionStatus.text} (${commentData.dueDate})` : subscriptionStatus.text}</td>
                                        <td className="px-6 py-4 text-right space-x-1">
                                            <button onClick={() => handleOpenPayment(secret)} className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-500 rounded-md font-semibold text-white">
                                                Pay
                                            </button>
                                            <button onClick={() => handleEdit(secret)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-[--color-primary-500] dark:hover:text-[--color-primary-400] rounded-md" title="Edit User">
                                                <EditIcon className="h-5 w-5" />
                                            </button>
                                            <button onClick={() => handleDelete(secret.id)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md" title="Delete User">
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-500">
                                        {secrets.length > 0 ? 'No users found matching your search.' : 'No PPPoE users (secrets) found on this router.'}
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