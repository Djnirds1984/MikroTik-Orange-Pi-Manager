import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, BillingPlan, BillingPlanWithId, PppActiveConnection, PppSecretData } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, UsersIcon } from '../constants.tsx';

const NON_PAYMENT_PROFILE = "_profile-expired_"; // The profile to switch to on due date

// --- Add/Edit Modal for Secrets ---
const SecretFormModal = ({ isOpen, onClose, onSave, initialData, profiles, isLoading }) => {
    const [secret, setSecret] = useState({ name: '', password: '', profile: '', service: 'pppoe', comment: '' });

    useEffect(() => {
        if (initialData) {
            setSecret({ ...initialData, password: '' });
        } else {
            setSecret({ name: '', password: '', profile: profiles[0]?.name || '', service: 'pppoe', comment: '' });
        }
    }, [initialData, profiles, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => setSecret(s => ({ ...s, [e.target.name]: e.target.value }));
    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(initialData ? { ...initialData, ...secret } : secret);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <h3 className="text-xl font-bold text-orange-400">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Username</label>
                            <input type="text" name="name" value={secret.name} onChange={handleChange} required className="mt-1 w-full bg-slate-700 border-slate-600 rounded-md py-2 px-3 text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Password</label>
                            <input type="password" name="password" value={secret.password} onChange={handleChange} placeholder={initialData ? "Leave blank to keep existing" : ""} className="mt-1 w-full bg-slate-700 border-slate-600 rounded-md py-2 px-3 text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Profile</label>
                            <select name="profile" value={secret.profile} onChange={handleChange} required className="mt-1 w-full bg-slate-700 border-slate-600 rounded-md py-2 px-3 text-white">
                                {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 rounded-md">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-md">{isLoading ? 'Saving...' : 'Save User'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Payment Modal ---
const PaymentModal = ({ isOpen, onClose, onConfirm, user, plans, isLoading }) => {
    const [discountDays, setDiscountDays] = useState(0);

    const userMetadata = useMemo(() => {
        try {
            return user?.comment ? JSON.parse(user.comment) : {};
        } catch {
            return {};
        }
    }, [user]);

    const plan = useMemo(() => plans.find(p => p.name === userMetadata.plan), [plans, userMetadata]);
    const finalPrice = useMemo(() => {
        if (!plan) return 0;
        const dailyRate = plan.price / 30;
        return (dailyRate * (30 - discountDays)).toFixed(2);
    }, [plan, discountDays]);
    
    if (!isOpen || !user) return null;

    const handleConfirm = () => {
        if (!plan) {
            alert("This user is not associated with a valid billing plan. Please edit the user to assign one.");
            return;
        }
        onConfirm(user, plan);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-700">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-orange-400 mb-4">Process Payment for <span className="text-white">{user.name}</span></h3>
                    {plan ? (
                        <div className="space-y-4">
                            <div className="bg-slate-700/50 p-3 rounded-md">
                                <p className="text-sm text-slate-400">Billing Plan</p>
                                <p className="font-semibold">{plan.name} ({plan.price} {plan.currency}/month)</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Discount (days)</label>
                                <input type="number" value={discountDays} onChange={(e) => setDiscountDays(Math.max(0, parseInt(e.target.value) || 0))} className="mt-1 w-full bg-slate-700 rounded-md p-2"/>
                            </div>
                            <div className="text-center bg-slate-900 p-4 rounded-lg">
                                <p className="text-sm text-slate-400">TOTAL DUE</p>
                                <p className="text-3xl font-bold text-green-400">{finalPrice} <span className="text-lg">{plan.currency}</span></p>
                            </div>
                            <p className="text-xs text-slate-500 text-center">On success, the due date will be set to 30 days from now and the user's profile will be set to <strong className="text-slate-400">{plan.pppoeProfile}</strong>.</p>
                        </div>
                    ) : (
                        <p className="text-yellow-400">This user has no billing plan assigned. Please edit the user and add metadata in the comment field, e.g., {"{ \"plan\": \"PlanName\" }"}</p>
                    )}
                </div>
                <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isLoading} className="px-4 py-2 rounded-md">Cancel</button>
                    <button onClick={handleConfirm} disabled={isLoading || !plan} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md disabled:opacity-50">{isLoading ? 'Processing...' : 'Confirm Payment'}</button>
                </div>
            </div>
        </div>
    );
};


export const Users: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const { plans } = useBillingPlans();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [modal, setModal] = useState<'add' | 'edit' | 'pay' | null>(null);
    const [selectedSecret, setSelectedSecret] = useState<PppSecret | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) { setIsLoading(false); setSecrets([]); setProfiles([]); setActive([]); return; }
        setIsLoading(true);
        setError(null);
        try {
            const [secretsData, profilesData, activeData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppProfiles(selectedRouter),
                getPppActive(selectedRouter),
            ]);
            setSecrets(secretsData);
            setProfiles(profilesData);
            setActive(activeData);
        } catch (err) {
            setError(`Could not fetch PPPoE data. Ensure the PPP package is enabled on "${selectedRouter.name}".`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData() }, [fetchData]);

    const handleSaveSecret = async (data) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            if (data.id) {
                await updatePppSecret(selectedRouter, data);
            } else {
                await addPppSecret(selectedRouter, data);
            }
            setModal(null);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); } finally { setIsSubmitting(false); }
    };

    const handleDeleteSecret = async (id) => {
        if (!selectedRouter || !window.confirm("Delete this user?")) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, id);
            await fetchData();
        } catch (err) { alert(`Error: ${(err as Error).message}`); } finally { setIsSubmitting(false); }
    };
    
    const handlePayment = async (user, plan) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            await processPppPayment(selectedRouter, user, plan, NON_PAYMENT_PROFILE);
            setModal(null);
            await fetchData();
        } catch(err) { alert(`Payment processing failed: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    }

    const openModal = (type, secret = null) => {
        setSelectedSecret(secret);
        setModal(type);
    };

    if (!selectedRouter) return <div className="text-center p-8 bg-slate-800 rounded-lg"><RouterIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" /><h2 className="text-2xl font-bold">PPPoE User Manager</h2><p className="mt-2 text-slate-400">Please select a router to manage users.</p></div>
    if (isLoading) return <div className="text-center"><Loader /><p className="mt-4">Fetching users from {selectedRouter.name}...</p></div>
    if (error) return <div className="text-center p-8 bg-slate-800 rounded-lg border border-red-700 text-red-400">{error}</div>

    return (
        <div className="max-w-7xl mx-auto">
            <SecretFormModal isOpen={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)} onSave={handleSaveSecret} initialData={selectedSecret} profiles={profiles} isLoading={isSubmitting} />
            <PaymentModal isOpen={modal === 'pay'} onClose={() => setModal(null)} onConfirm={handlePayment} user={selectedSecret} plans={plans} isLoading={isSubmitting}/>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">PPPoE Users</h2>
                <button onClick={() => openModal('add')} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">Add New User</button>
            </div>
             <p className="text-sm text-slate-500 mb-4 -mt-4">NOTE: The payment scheduler will set expired users to the profile named "<strong className="text-slate-400">{NON_PAYMENT_PROFILE}</strong>". Please ensure this profile exists on your router.</p>

            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-900/50 text-xs text-slate-400 uppercase">
                        <tr>
                            <th className="px-6 py-3 text-left">Status</th>
                            <th className="px-6 py-3 text-left">Username</th>
                            <th className="px-6 py-3 text-left">Profile</th>
                            <th className="px-6 py-3 text-left">Due Date</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {secrets.map(s => {
                            const isActive = active.some(a => a.name === s.name);
                            const meta = (() => { try { return s.comment ? JSON.parse(s.comment) : {} } catch { return {} } })();
                            const isDue = meta.dueDate && new Date(meta.dueDate) < new Date();
                            return (
                                <tr key={s.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                                    <td className="px-6 py-4"><span className={`px-2 py-1 text-xs rounded-full ${isActive ? 'bg-green-500 text-black' : 'bg-slate-600 text-slate-200'}`}>{isActive ? 'Online' : 'Offline'}</span></td>
                                    <td className="px-6 py-4 font-medium text-slate-200">{s.name}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-400">{s.profile}</td>
                                    <td className={`px-6 py-4 font-mono ${isDue ? 'text-red-400' : 'text-slate-300'}`}>{meta.dueDate || 'N/A'}</td>
                                    <td className="px-6 py-4 text-right space-x-1">
                                        <button onClick={() => openModal('pay', s)} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs">Pay</button>
                                        <button onClick={() => openModal('edit', s)} className="p-2 text-slate-400 hover:text-orange-400"><EditIcon className="h-5 w-5" /></button>
                                        <button onClick={() => handleDeleteSecret(s.id)} className="p-2 text-slate-400 hover:text-red-500"><TrashIcon className="h-5 w-5" /></button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};