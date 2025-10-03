
import React, { useState, useEffect } from 'react';
import type { BillingPlan, BillingPlanWithId, PppProfile, RouterConfigWithId } from '../types.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { getPppProfiles } from '../services/mikrotikService.ts';
import { EditIcon, TrashIcon, SignalIcon, RouterIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';

// Form component for adding/editing plans
const PlanForm: React.FC<{
    onSave: (plan: BillingPlan | BillingPlanWithId) => void;
    onCancel: () => void;
    initialData?: BillingPlanWithId | null;
    profiles: PppProfile[];
    isLoadingProfiles: boolean;
}> = ({ onSave, onCancel, initialData, profiles, isLoadingProfiles }) => {
    const defaultPlanState: BillingPlan = { name: '', price: 0, currency: 'USD', cycle: 'Monthly', pppoeProfile: '', description: '' };
    const [plan, setPlan] = useState<BillingPlan>(initialData || defaultPlanState);
    
    useEffect(() => {
        const initialState = { ...defaultPlanState, ...(initialData || {}) };
        if (!initialState.pppoeProfile && profiles.length > 0) {
            initialState.pppoeProfile = profiles[0].name;
        }
        setPlan(initialState);
    }, [initialData, profiles]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setPlan(prev => ({ ...prev, [name]: name === 'price' ? parseFloat(value) || 0 : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(initialData ? { ...initialData, ...plan } : plan);
    };

    return (
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xl font-bold text-orange-400 mb-4">{initialData ? `Edit '${initialData.name}'` : 'Add New Billing Plan'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-300">Plan Name</label>
                        <input type="text" name="name" value={plan.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., Premium 100Mbps" />
                    </div>
                    <div>
                        <label htmlFor="pppoeProfile" className="block text-sm font-medium text-slate-300">PPPoE Profile</label>
                        <select name="pppoeProfile" value={plan.pppoeProfile} onChange={handleChange} required disabled={isLoadingProfiles || profiles.length === 0} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500 disabled:opacity-50">
                            {isLoadingProfiles ? <option>Loading profiles...</option> : profiles.length === 0 ? <option>No profiles found</option> : profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="price" className="block text-sm font-medium text-slate-300">Price</label>
                        <input type="number" name="price" value={plan.price} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="currency" className="block text-sm font-medium text-slate-300">Currency</label>
                        <input type="text" name="currency" value={plan.currency} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="cycle" className="block text-sm font-medium text-slate-300">Cycle</label>
                        <select name="cycle" value={plan.cycle} onChange={handleChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500">
                            <option>Monthly</option>
                            <option>Quarterly</option>
                            <option>Yearly</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-300">Description</label>
                    <textarea name="description" value={plan.description} onChange={handleChange} rows={2} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="A brief description of the plan."></textarea>
                </div>
                <div className="flex items-center justify-end space-x-4 pt-4">
                    <button type="button" onClick={onCancel} className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700">Cancel</button>
                    <button type="submit" className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500">Save Plan</button>
                </div>
            </form>
        </div>
    );
};

interface BillingProps {
  selectedRouter: RouterConfigWithId | null;
}

export const Billing: React.FC<BillingProps> = ({ selectedRouter }) => {
    const { plans, addPlan, updatePlan, deletePlan } = useBillingPlans();
    const [editingPlan, setEditingPlan] = useState<BillingPlanWithId | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

    useEffect(() => {
        if ((isAdding || editingPlan) && selectedRouter) {
            setIsLoadingProfiles(true);
            getPppProfiles(selectedRouter)
                .then(setProfiles)
                .catch(err => {
                    console.error("Failed to fetch PPP profiles:", err);
                    setProfiles([]);
                })
                .finally(() => setIsLoadingProfiles(false));
        }
    }, [isAdding, editingPlan, selectedRouter]);

    const handleSave = (planData: BillingPlan | BillingPlanWithId) => {
        if ('id' in planData && planData.id) {
            updatePlan(planData as BillingPlanWithId);
        } else {
            addPlan(planData as BillingPlan);
        }
        setEditingPlan(null);
        setIsAdding(false);
    };

    const handleDelete = (planId: string) => {
        if (window.confirm("Are you sure you want to delete this billing plan?")) {
            deletePlan(planId);
        }
    };
    
    const handleAddNew = () => {
        if (!selectedRouter) {
            alert("Please select a router before adding a new plan.");
            return;
        }
        setIsAdding(true);
        setEditingPlan(null);
    }
    
    const handleEdit = (plan: BillingPlanWithId) => {
        if (!selectedRouter) {
            alert("Please select a router before editing a plan.");
            return;
        }
        setEditingPlan(plan);
        setIsAdding(false);
    }

    const handleCancel = () => {
        setIsAdding(false);
        setEditingPlan(null);
    }

    return (
        <div className="max-w-4xl mx-auto">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-slate-100">Billing Plans</h2>
                {!isAdding && !editingPlan && (
                     <button onClick={handleAddNew} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">
                        Add New Plan
                    </button>
                )}
            </div>

            {(isAdding || editingPlan) && (
                <div className="mb-8">
                    { !selectedRouter ? (
                        <div className="text-center p-8 bg-slate-800 rounded-lg border border-yellow-700 text-yellow-300">
                           <p>Please select a router from the top bar to manage billing plans.</p>
                        </div>
                    ) : (
                        <PlanForm
                            onSave={handleSave}
                            onCancel={handleCancel}
                            initialData={editingPlan}
                            profiles={profiles}
                            isLoadingProfiles={isLoadingProfiles}
                        />
                    )}
                </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md">
                <ul role="list" className="divide-y divide-slate-700">
                    {plans.map((plan) => (
                        <li key={plan.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-slate-700/50">
                            <div className="flex items-center gap-4 mb-2 sm:mb-0">
                                <SignalIcon className="h-8 w-8 text-orange-400 flex-shrink-0" />
                                <div>
                                    <p className="text-lg font-semibold text-slate-100">{plan.name}</p>
                                    <p className="text-sm text-slate-400">
                                        <span className="font-bold text-slate-200">{plan.price} {plan.currency}</span> / {plan.cycle}
                                        <span className="mx-2 text-slate-600">|</span>
                                        Profile: <span className="font-mono bg-slate-700 px-1.5 py-0.5 rounded text-xs">{plan.pppoeProfile}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 self-end sm:self-center">
                                <button onClick={() => handleEdit(plan)} className="p-2 text-slate-400 hover:text-orange-400">
                                    <EditIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => handleDelete(plan.id)} className="p-2 text-slate-400 hover:text-red-500">
                                    <TrashIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};