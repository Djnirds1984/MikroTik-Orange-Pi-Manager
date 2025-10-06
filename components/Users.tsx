
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, PppActiveConnection, PppSecretData, BillingPlanWithId, SaleRecord, Customer } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, ExclamationTriangleIcon, CurrencyDollarIcon, UsersIcon, SearchIcon, SignalIcon } from '../constants.tsx';

// --- Helper Functions ---
const parseComment = (comment: string): { plan?: string; dueDate?: string; customerId?: string; notes?: string } => {
    try {
        const data = JSON.parse(comment);
        return typeof data === 'object' && data !== null ? data : {};
    } catch (e) {
        return { notes: comment }; // If not JSON, treat it as a simple note
    }
};

const getStatus = (secret: PppSecret, active: PppActiveConnection[]): { text: string; color: string; info: string } => {
    const activeConnection = active.find(a => a.name === secret.name);
    if (secret.disabled === 'true') {
        return { text: 'Disabled', color: 'bg-slate-500', info: 'This user is manually disabled.' };
    }
    if (activeConnection) {
        return { text: 'Online', color: 'bg-green-500', info: `IP: ${activeConnection.address}, Uptime: ${activeConnection.uptime}` };
    }
    const commentData = parseComment(secret.comment);
    if (commentData.dueDate) {
        const dueDate = new Date(commentData.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dueDate < today) {
            return { text: 'Expired', color: 'bg-red-500', info: `Due date was ${commentData.dueDate}` };
        }
    }
    return { text: 'Offline', color: 'bg-yellow-500', info: 'User is not currently connected.' };
};

// --- Modals will go here ---

// --- Main Component ---
interface UsersProps {
    selectedRouter: RouterConfigWithId | null;
    addSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<void>;
}

export const Users: React.FC<UsersProps> = ({ selectedRouter, addSale }) => {
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Data from hooks
    const { plans } = useBillingPlans();
    const { customers, addCustomer } = useCustomers();
    const { t, formatCurrency } = useLocalization();

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setSecrets([]);
            setProfiles([]);
            setActive([]);
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const [secretsData, profilesData, activeData] = await Promise.all([
                getPppSecrets(selectedRouter),
                getPppProfiles(selectedRouter),
                getPppActive(selectedRouter)
            ]);
            setSecrets(secretsData);
            setProfiles(profilesData);
            setActive(activeData);
        } catch (err) {
            console.error("Failed to fetch PPPoE user data:", err);
            setError(`Could not fetch user data from "${selectedRouter.name}".`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredSecrets = useMemo(() => {
        if (!searchTerm) return secrets;
        const lowerTerm = searchTerm.toLowerCase();
        return secrets.filter(s => s.name.toLowerCase().includes(lowerTerm) || s.comment.toLowerCase().includes(lowerTerm));
    }, [secrets, searchTerm]);
    
    // Render logic will go here

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
                <p className="mt-4 text-[--color-primary-500] dark:text-[--color-primary-400]">Fetching users from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (error) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-lg border border-red-300 dark:border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-600 dark:text-red-400">Failed to load user data.</p>
                <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">{error}</p>
            </div>
         );
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users</h2>
                <div className="flex items-center gap-4">
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-slate-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4 text-slate-900 dark:text-white"
                        />
                    </div>
                    <button className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        Add New User
                    </button>
                </div>
            </div>

             <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Profile / Plan</th>
                                <th className="px-6 py-3">Customer Info</th>
                                <th className="px-6 py-3">Due Date</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                         <tbody>
                            {filteredSecrets.map(secret => {
                                const status = getStatus(secret, active);
                                const comment = parseComment(secret.comment);
                                const customer = customers.find(c => c.id === comment.customerId);
                                return (
                                    <tr key={secret.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full text-white ${status.color}`} title={status.info}>{status.text}</span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{secret.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs text-cyan-700 dark:text-cyan-400">{secret.profile}</span>
                                            {comment.plan && <p className="text-xs text-slate-500 mt-1">{comment.plan}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{customer?.name || 'N/A'}</td>
                                        <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">{comment.dueDate || 'N/A'}</td>
                                        <td className="px-6 py-4 text-right space-x-1">
                                            <button title="Process Payment" className="p-2 text-slate-500 dark:text-slate-400 hover:text-green-500 rounded-md"><CurrencyDollarIcon className="h-5 w-5"/></button>
                                            <button title="Edit User" className="p-2 text-slate-500 dark:text-slate-400 hover:text-[--color-primary-500] dark:hover:text-[--color-primary-400] rounded-md"><EditIcon className="h-5 w-5" /></button>
                                            <button title="Delete User" className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md"><TrashIcon className="h-5 w-5" /></button>
                                        </td>
                                    </tr>
                                )
                            })}
                         </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};
