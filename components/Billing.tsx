import React, { useState, useEffect } from 'react';
import type { BillingPlan, BillingPlanWithId } from '../types';
import { useBillingPlans } from '../hooks/useBillingPlans';
import { EditIcon, TrashIcon, SignalIcon } from '../constants';

// Form component for adding/editing plans
const PlanForm: React.FC<{
    onSave: (plan: BillingPlan | BillingPlanWithId) => void;
    onCancel: () => void;
    initialData?: BillingPlanWithId | null;
}> = ({ onSave, onCancel, initialData }) => {
    const [plan, setPlan] = useState<BillingPlan>(
        { name: '', price: 0, uploadSpeed: 0, downloadSpeed: 0, description: '' }
    );
    
    useEffect(() => {
        setPlan(initialData || { name: '', price: 0, uploadSpeed: 0, downloadSpeed: 0, description: '' });
    }, [initialData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setPlan(prev => ({ ...prev, [name]: name === 'price' || name === 'uploadSpeed' || name === 'downloadSpeed' ? parseFloat(value) || 0 : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(initialData ? { ...initialData, ...plan } : plan);
    };

    return (
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-xl font-bold text-orange-400 mb-4">{initialData ? `Edit '${initialData.name}'` : 'Add New Billing Plan'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300">Plan Name</label>
                    <input type="text" name="name" value={plan.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., Premium 100Mbps" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="price" className="block text-sm font-medium text-slate-300">Price ($)</label>
                        <input type="number" name="price" value={plan.price} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="downloadSpeed" className="block text-sm font-medium text-slate-300">Download (Mbps)</label>
                        <input type="number" name="downloadSpeed" value={plan.downloadSpeed} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                    </div>
                     <div>
                        <label htmlFor="uploadSpeed" className="block text-sm font-medium text-slate-300">Upload (Mbps)</label>
                        <input type="number" name="uploadSpeed" value={plan.uploadSpeed} onChange={handleChange} required className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                    </div>
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-300">Description</label>
                    <textarea name="description" value={plan.description} onChange={handleChange} rows={3} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="A brief description of the plan."></textarea>
                </div>
                <div className="flex items-center justify-end space-x-4 pt-4">
                    <button type="button" onClick={onCancel} className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700">Cancel</button>
                    <button type="submit" className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500">Save Plan</button>
                </div>
            </form>
        </div>
    );
};

export const Billing: React.FC = () => {
    const { plans, addPlan, updatePlan, deletePlan } = useBillingPlans();
    const [editingPlan, setEditingPlan] = useState<BillingPlanWithId | null>(null);
    const [isAdding, setIsAdding] = useState(false);

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
        setIsAdding(true);
        setEditingPlan(null);
    }
    
    const handleEdit = (plan: BillingPlanWithId) => {
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
                    <PlanForm
                        onSave={handleSave}
                        onCancel={handleCancel}
                        initialData={editingPlan}
                    />
                </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md">
                <ul role="list" className="divide-y divide-slate-700">
                    {plans.map((plan) => (
                        <li key={plan.id} className="p-4 flex items-center justify-between hover:bg-slate-700/50">
                            <div className="flex items-center gap-4">
                                <SignalIcon className="h-8 w-8 text-orange-400" />
                                <div>
                                    <p className="text-lg font-semibold text-slate-100">{plan.name}</p>
                                    <p className="text-sm text-slate-400">
                                        ${plan.price}/mo - {plan.downloadSpeed}/{plan.uploadSpeed} Mbps
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
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
