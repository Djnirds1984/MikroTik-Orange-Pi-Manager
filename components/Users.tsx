
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, PppSecret, PppProfile, PppActiveConnection, PppSecretData, BillingPlanWithId, SaleRecord, Customer } from '../types.ts';
import { getPppSecrets, getPppProfiles, getPppActive, addPppSecret, updatePppSecret, deletePppSecret, processPppPayment } from '../services/mikrotikService.ts';
import { useBillingPlans } from '../hooks/useBillingPlans.ts';
import { useCustomers } from '../hooks/useCustomers.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { Loader } from './Loader.tsx';
import { RouterIcon, EditIcon, TrashIcon, ExclamationTriangleIcon, CurrencyDollarIcon, SearchIcon } from '../constants.tsx';

// --- Helper Functions ---
const parseComment = (comment: string): { plan?: string; dueDate?: string; customerId?: string; notes?: string } => {
    try {
        const data = JSON.parse(comment);
        return typeof data === 'object' && data !== null ? data : { notes: comment };
    } catch (e) {
        return { notes: comment };
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


// --- User Add/Edit Modal ---
interface UserFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (secretData: PppSecret | PppSecretData, customerData: Customer | Omit<Customer, 'id'>) => void;
    initialData: PppSecret | null;
    profiles: PppProfile[];
    isLoading: boolean;
}
const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, onSave, initialData, profiles, isLoading }) => {
    const [secret, setSecret] = useState<Partial<PppSecret>>({ service: 'pppoe', profile: '', name: '', password: '' });
    const [customer, setCustomer] = useState<Partial<Customer>>({ fullName: '', address: '', contactNumber: '', email: '' });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setSecret({ ...initialData, password: '' }); // Don't show password on edit
                setCustomer(initialData.customer || {});
            } else {
                setSecret({ service: 'pppoe', profile: profiles[0]?.name || '', name: '', password: '' });
                setCustomer({ fullName: '', address: '', contactNumber: '', email: '' });
            }
        }
    }, [initialData, isOpen, profiles]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(p => ({ ...p, [name]: value }));
    };
    
    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCustomer(p => ({ ...p, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const secretToSave = { ...secret };
        if (initialData && !secret.password) {
            delete secretToSave.password; // Don't send empty password on update
        }
        onSave(initialData ? { ...initialData, ...secretToSave } : secretToSave as PppSecretData, customer as Omit<Customer, 'id'>);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
                <form onSubmit={handleSubmit} className="flex flex-col flex-grow">
                    <div className="p-6 overflow-y-auto">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">{initialData ? 'Edit User' : 'Add New User'}</h3>
                        <div className="space-y-6">
                            {/* PPPoE Credentials */}
                            <fieldset className="border border-slate-300 dark:border-slate-600 p-4 rounded-md">
                                <legend className="px-2 text-sm font-medium text-slate-600 dark:text-slate-300">PPPoE Credentials (Required)</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm">Username</label>
                                        <input type="text" name="name" value={secret.name} onChange={handleChange} required disabled={!!initialData} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3 disabled:opacity-50" />
                                    </div>
                                    <div>
                                        <label className="block text-sm">Password</label>
                                        <input type="password" name="password" value={secret.password} onChange={handleChange} required={!initialData} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" placeholder={initialData ? "Leave blank to keep existing" : ""} />
                                    </div>
                                    <div>
                                        <label className="block text-sm">Service</label>
                                        <select name="service" value={secret.service} onChange={handleChange} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3">
                                            <option>pppoe</option>
                                            <option>any</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm">Profile</label>
                                        <select name="profile" value={secret.profile} onChange={handleChange} required className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3">
                                            {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>

                            {/* Customer Information */}
                             <fieldset className="border border-slate-300 dark:border-slate-600 p-4 rounded-md">
                                <legend className="px-2 text-sm font-medium text-slate-600 dark:text-slate-300">Customer Information (Optional)</legend>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-sm">Full Name</label>
                                        <input type="text" name="fullName" value={customer.fullName} onChange={handleCustomerChange} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" />
                                    </div>
                                     <div>
                                        <label className="block text-sm">Contact Number</label>
                                        <input type="tel" name="contactNumber" value={customer.contactNumber} onChange={handleCustomerChange} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" />
                                    </div>
                                     <div className="md:col-span-2">
                                        <label className="block text-sm">Address</label>
                                        <input type="text" name="address" value={customer.address} onChange={handleCustomerChange} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm">Email</label>
                                        <input type="email" name="email" value={customer.email} onChange={handleCustomerChange} className="mt-1 w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" />
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 mt-auto flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">{isLoading ? 'Saving...' : 'Save User'}</button>
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
    const [secrets, setSecrets] = useState<PppSecret[]>([]);
    const [profiles, setProfiles] = useState<PppProfile[]>([]);
    const [active, setActive] = useState<PppActiveConnection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSecret, setEditingSecret] = useState<PppSecret | null>(null);
    
    // Data from hooks
    const { customers, addCustomer, updateCustomer } = useCustomers(selectedRouter?.id || null);
    
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

    const secretsWithCustomers = useMemo(() => {
        return secrets.map(secret => {
            const customer = customers.find(c => c.username === secret.name && c.routerId === selectedRouter?.id);
            return { ...secret, customer };
        });
    }, [secrets, customers, selectedRouter]);

    const filteredSecrets = useMemo(() => {
        if (!searchTerm) return secretsWithCustomers;
        const lowerTerm = searchTerm.toLowerCase();
        return secretsWithCustomers.filter(s => 
            s.name.toLowerCase().includes(lowerTerm) || 
            (s.customer?.fullName && s.customer.fullName.toLowerCase().includes(lowerTerm)) ||
            (s.customer?.address && s.customer.address.toLowerCase().includes(lowerTerm))
        );
    }, [secretsWithCustomers, searchTerm]);

    const handleAdd = () => {
        setEditingSecret(null);
        setIsModalOpen(true);
    };

    const handleEdit = (secret: PppSecret) => {
        setEditingSecret(secret);
        setIsModalOpen(true);
    };

    const handleDelete = async (secret: PppSecret) => {
        if (!selectedRouter || !window.confirm(`Are you sure you want to delete user "${secret.name}"?`)) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, secret.id);
            await fetchData();
        } catch (err) {
            alert(`Error deleting user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSave = async (secretData: PppSecret | PppSecretData, customerData: Customer | Omit<Customer, 'id'>) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            // Step 1: Save the secret on MikroTik
            if ('id' in secretData) {
                await updatePppSecret(selectedRouter, secretData as PppSecret);
            } else {
                await addPppSecret(selectedRouter, secretData as PppSecretData);
            }

            // Step 2: Save the customer info locally
            const existingCustomer = customers.find(c => c.username === secretData.name && c.routerId === selectedRouter.id);
            if (existingCustomer) {
                await updateCustomer({ ...existingCustomer, ...customerData });
            } else {
                await addCustomer({ ...customerData, username: secretData.name!, routerId: selectedRouter.id });
            }

            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error saving user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const downloadCSV = () => {
        const headers = ["Username", "Full Name", "Address", "Contact Number", "Email", "Profile", "Status", "Due Date"];
        const rows = secretsWithCustomers.map(s => {
            const status = getStatus(s, active);
            const comment = parseComment(s.comment);
            return [
                s.name,
                s.customer?.fullName || '',
                s.customer?.address || '',
                s.customer?.contactNumber || '',
                s.customer?.email || '',
                s.profile,
                status.text,
                comment.dueDate || ''
            ].map(field => `"${field.replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `pppoe_users_${selectedRouter?.name || ''}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
            <UserFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingSecret}
                profiles={profiles}
                isLoading={isSubmitting}
            />

            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users ({secrets.length})</h2>
                <div className="flex items-center gap-4">
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-slate-400" />
                        </span>
                        <input
                            type="text"
                            placeholder="Search user, name, address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4 text-slate-900 dark:text-white"
                        />
                    </div>
                    <button onClick={downloadCSV} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        Download CSV
                    </button>
                    <button onClick={handleAdd} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg flex-shrink-0">
                        Add New User
                    </button>
                </div>
            </div>

             <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">NOTE: The payment system automatically creates scripts and schedulers on the router to manage users based on their due date.</p>

             <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Profile / Plan</th>
                                <th className="px-6 py-3">Subscription</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                         <tbody>
                            {filteredSecrets.map(secret => {
                                const status = getStatus(secret, active);
                                const comment = parseComment(secret.comment);
                                return (
                                    <tr key={secret.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full text-white ${status.color}`} title={status.info}>{status.text}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-slate-900 dark:text-slate-200">{secret.name}</p>
                                            <p className="text-xs text-slate-500">{secret.customer?.fullName || 'No Name'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs text-cyan-700 dark:text-cyan-400">{secret.profile}</span>
                                            {comment.plan && <p className="text-xs text-slate-500 mt-1">{comment.plan}</p>}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">{comment.dueDate ? `Active (${comment.dueDate})` : 'No Info'}</td>
                                        <td className="px-6 py-4 text-right space-x-1">
                                            <button title="Process Payment" className="p-2 text-slate-500 dark:text-slate-400 hover:text-green-500 rounded-md"><CurrencyDollarIcon className="h-5 w-5"/></button>
                                            <button onClick={() => handleEdit(secret)} title="Edit User" className="p-2 text-slate-500 dark:text-slate-400 hover:text-[--color-primary-500] dark:hover:text-[--color-primary-400] rounded-md"><EditIcon className="h-5 w-5" /></button>
                                            <button onClick={() => handleDelete(secret)} title="Delete User" className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md"><TrashIcon className="h-5 w-5" /></button>
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
