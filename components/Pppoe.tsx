
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, PppActiveConnection, SaleRecord, BillingPlanWithId, Customer } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActiveConnections, disconnectPppUser, addPppSecret, updatePppSecret, deletePppSecret } from '../services/mikrotikService.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { EditIcon, TrashIcon, PowerIcon, SearchIcon, UsersIcon, RouterIcon } from '../constants.tsx';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { PaymentModal } from './PaymentModal.tsx';
import { useCompanySettings } from '../hooks/useCompanySettings.ts';

// Add/Edit Secret Modal
const SecretFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (secret: Partial<PppSecret>) => Promise<void>;
    profiles: PppProfile[];
    initialData?: PppSecret | null;
    customers: Customer[];
    addCustomer: (customerData: Omit<Customer, 'id'>) => Promise<Customer>;
}> = ({ isOpen, onClose, onSave, profiles, initialData, customers, addCustomer }) => {
    const [secret, setSecret] = useState({ name: '', password: '', profile: '', service: 'pppoe', comment: '' });
    const [customer, setCustomer] = useState({ fullName: '', address: '', contactNumber: '', email: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setSecret({
                    name: initialData.name,
                    password: '', // Don't pre-fill password for security
                    profile: initialData.profile,
                    service: initialData.service || 'pppoe',
                    comment: initialData.comment || ''
                });
                const existingCustomer = customers.find(c => c.username === initialData.name);
                if (existingCustomer) {
                    setCustomer(existingCustomer);
                } else {
                     setCustomer({ fullName: '', address: '', contactNumber: '', email: '' });
                }
            } else {
                setSecret({ name: '', password: '', profile: profiles[0]?.name || '', service: 'pppoe', comment: '' });
                setCustomer({ fullName: '', address: '', contactNumber: '', email: '' });
            }
        }
    }, [initialData, isOpen, profiles, customers]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // First save the secret, then save the customer data
            const secretToSave = { ...secret, comment: secret.comment };
            if (initialData?.id) {
                 // @ts-ignore
                secretToSave['.id'] = initialData.id;
            }

            await onSave(secretToSave);

        } catch (error) {
            alert(`Error saving secret: ${(error as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">{initialData ? 'Edit PPPoE User' : 'Add New PPPoE User'}</h3>
                        <div className="space-y-4">
                            {/* ... Form fields ... */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label>Username</label><input value={secret.name} onChange={e => setSecret(s => ({...s, name: e.target.value}))} required className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"/></div>
                                <div><label>Password</label><input type="password" placeholder={initialData ? "Leave blank to keep" : ""} onChange={e => setSecret(s => ({...s, password: e.target.value}))} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"/></div>
                            </div>
                             <div><label>Profile</label><select value={secret.profile} onChange={e => setSecret(s => ({...s, profile: e.target.value}))} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700">{profiles.map(p => <option key={p['.id']} value={p.name}>{p.name}</option>)}</select></div>
                             <div><label>Comment (Optional)</label><input value={secret.comment} onChange={e => setSecret(s => ({...s, comment: e.target.value}))} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"/></div>
                        </div>
                    </div>
                     <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                        <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save User"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Main Component
export const Pppoe: React.FC<{ selectedRouter: RouterConfigWithId | null, addSale: (sale: Omit<SaleRecord, 'id'>) => Promise<void> }> = ({ selectedRouter, addSale }) => {
    const { t } = useLocalization();
    const { plans } = useBillingPlans(selectedRouter?.id || null);
    const { customers, addCustomer, updateCustomer } = useCustomers(selectedRouter?.id || null);
    const { settings: companySettings } = useCompanySettings();

    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    const [paymentSecret, setPaymentSecret] = useState<PppSecret | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const [s, p, a] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppProfiles(selectedRouter),
                getPppActiveConnections(selectedRouter)
            ]);
            setSecrets(s);
            setProfiles(p);
            setActive(a);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveSecret = async (secretData: Partial<PppSecret>) => {
        if (!selectedRouter) return;
        try {
            if (secretData['.id']) {
                await updatePppSecret(selectedRouter, secretData['.id'], secretData);
            } else {
                await addPppSecret(selectedRouter, secretData);
            }
            await fetchData();
            setIsModalOpen(false);
        } catch (err) {
            alert(`Failed to save: ${(err as Error).message}`);
        }
    };

    const handleDeleteSecret = async (secretId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to delete this PPPoE user?")) return;
        try {
            await deletePppSecret(selectedRouter, secretId);
            await fetchData();
        } catch (err) {
            alert(`Failed to delete: ${(err as Error).message}`);
        }
    };
    
    const handleDisconnect = async (connId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to disconnect this user?")) return;
        try {
            await disconnectPppUser(selectedRouter, connId);
            // Poll for active connections again after a short delay
            setTimeout(async () => {
                try {
                    const a = await getPppActiveConnections(selectedRouter);
                    setActive(a);
                } catch(e) { console.error(e) }
            }, 1000);
        } catch (err) {
            alert(`Failed to disconnect: ${(err as Error).message}`);
        }
    };
    
    const handlePayment = async (data: { sale: Omit<SaleRecord, 'id'>, payment: any }) => {
        if (!selectedRouter || !paymentSecret) return false;
        
        const { plan, nonPaymentProfile, discountDays, paymentDate } = data.payment;
        const expiryDate = new Date(paymentDate);
        let daysInCycle = 30;
        if(plan.cycle === 'Yearly') daysInCycle = 365;
        if(plan.cycle === 'Quarterly') daysInCycle = 90;

        expiryDate.setDate(expiryDate.getDate() + daysInCycle - discountDays);
        const expiryDateString = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const comment = `Paid until ${expiryDateString}. Plan: ${plan.name}. On due, switch to ${nonPaymentProfile}.`;
        
        try {
            // Update the user's profile on MikroTik
            await updatePppSecret(selectedRouter, paymentSecret['.id'], { profile: plan.pppoeProfile, comment });
            
            // Add the sale record to the local DB
            await addSale({ ...data.sale, routerId: selectedRouter.id, routerName: selectedRouter.name, date: new Date().toISOString() });
            
            await fetchData();
            return true;
        } catch (err) {
            alert(`Payment processing failed: ${(err as Error).message}`);
            return false;
        }
    };

    const combinedSecrets = useMemo(() => {
        return secrets.map(s => {
            const activeUser = active.find(a => a.name === s.name);
            const customer = customers.find(c => c.username === s.name);
            return { ...s, activeUser, customer };
        }).filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.customer?.fullName.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [secrets, active, customers, searchTerm]);

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">PPPoE Management</h2>
                <p className="mt-2 text-slate-500">Please select a router to manage PPPoE users.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>;

    return (
        <div className="space-y-6">
            <PaymentModal 
                isOpen={!!paymentSecret}
                onClose={() => setPaymentSecret(null)}
                secret={paymentSecret}
                plans={plans}
                profiles={profiles}
                onSave={handlePayment}
                companySettings={companySettings}
            />

            <SecretFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(null)}
                onSave={handleSaveSecret}
                profiles={profiles}
                initialData={editingSecret}
                customers={customers}
                addCustomer={addCustomer}
            />
            
             <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                 <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3"><UsersIcon className="w-8 h-8"/> PPPoE Users</h2>
                 </div>
                 <div className="flex items-center gap-2">
                     <div className="relative">
                         <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-slate-400"/></span>
                         <input type="text" placeholder="Search user..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full md:w-64 bg-white dark:bg-slate-700 border rounded-md py-2 pl-10 pr-4"/>
                     </div>
                     <button onClick={() => { setEditingSecret(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add User</button>
                 </div>
             </div>
             
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Service</th>
                                <th className="px-6 py-3">Profile</th>
                                <th className="px-6 py-3">IP Address</th>
                                <th className="px-6 py-3">Last Logged Out</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {combinedSecrets.map(s => (
                                <tr key={s['.id']} className={`border-b dark:border-slate-700 ${s.disabled ? 'opacity-50 bg-slate-50 dark:bg-slate-800' : ''}`}>
                                    <td className="px-6 py-4">
                                        {s.activeUser ? <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">Online</span> : <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-200 text-slate-600">Offline</span>}
                                    </td>
                                    <td className="px-6 py-4 font-medium">{s.name}</td>
                                    <td className="px-6 py-4">{s.service}</td>
                                    <td className="px-6 py-4">{s.profile}</td>
                                    <td className="px-6 py-4 font-mono">{s.activeUser?.address || 'N/A'}</td>
                                    <td className="px-6 py-4">{s['last-logged-out'] || 'N/A'}</td>
                                    <td className="px-6 py-4 text-right space-x-1">
                                         <button onClick={() => setPaymentSecret(s)} className="p-2 text-green-600" title="Process Payment">Pay</button>
                                        {s.activeUser && <button onClick={() => handleDisconnect(s.activeUser['.id'])} className="p-2 text-red-500" title="Disconnect"><PowerIcon className="w-5 h-5"/></button>}
                                        <button onClick={() => { setEditingSecret(s); setIsModalOpen(true); }} className="p-2" title="Edit"><EditIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeleteSecret(s['.id'])} className="p-2" title="Delete"><TrashIcon className="w-5 h-5"/></button>
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
