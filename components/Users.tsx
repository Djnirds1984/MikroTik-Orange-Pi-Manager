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
import { RouterIcon, EditIcon, TrashIcon, CurrencyDollarIcon, SearchIcon } from '../constants.tsx';
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
const UserFormModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    onSave: (secret: PppSecret | PppSecretData, customer: Customer | Omit<Customer, 'id'>) => void,
    initialData: CombinedUser | null,
    profiles: PppProfile[],
    isSubmitting: boolean
}> = ({ isOpen, onClose, onSave, initialData, profiles, isSubmitting }) => {
    
    const [secret, setSecret] = useState<PppSecretData>({ name: '', password: '', service: 'pppoe', profile: '', comment: '', disabled: 'false' });
    const [customer, setCustomer] = useState<Partial<Customer>>({ fullName: '', address: '', contactNumber: '', email: '' });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setSecret({
                    name: initialData.name,
                    password: '', // Don't show existing password
                    service: initialData.service || 'pppoe',
                    profile: initialData.profile,
                    comment: initialData.comment,
                    disabled: initialData.disabled || 'false',
                });
                setCustomer({
                    fullName: initialData.customer?.fullName || '',
                    address: initialData.customer?.address || '',
                    contactNumber: initialData.customer?.contactNumber || '',
                    email: initialData.customer?.email || '',
                });
            } else {
                setSecret({ name: '', password: '', service: 'pppoe', profile: profiles.find(p => p.name.toLowerCase() !== 'default')?.[0]?.name || profiles[0]?.name || '', comment: '', disabled: 'false' });
                setCustomer({ fullName: '', address: '', contactNumber: '', email: '' });
            }
        }
    }, [initialData, profiles, isOpen]);

    if (!isOpen) return null;

    const handleSecretChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSecret(s => ({ ...s, [name]: value }));
    };

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCustomer(c => ({...c, [name]: value }));
    }
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        let finalSecretData: PppSecret | PppSecretData = { ...secret };
        if (initialData) {
             finalSecretData = { ...initialData, ...secret };
            // If password is not changed, don't send it to preserve it
            if (!secret.password) {
                 delete (finalSecretData as Partial<PppSecretData>).password;
            }
        }

        let finalCustomerData: Customer | Omit<Customer, 'id'> = {
            ...customer,
            username: secret.name, // Link by username
            routerId: initialData?.customer?.routerId || '', // This will be set properly in the parent
        };
        if (initialData?.customer) {
            finalCustomerData = { ...initialData.customer, ...customer };
        }

        onSave(finalSecretData, finalCustomerData);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400]">{initialData ? 'Edit User' : 'Add New User'}</h3>
                    </div>
                    
                    <div className="p-6 flex-1 overflow-y-auto">
                        <div className="space-y-6">
                             {/* PPPoE Credentials Section */}
                            <fieldset className="border border-slate-300 dark:border-slate-600 rounded-lg p-4">
                                <legend className="px-2 text-sm font-semibold text-slate-600 dark:text-slate-300">PPPoE Credentials (Required)</legend>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
                                            <input type="text" name="name" id="name" value={secret.name} onChange={handleSecretChange} required disabled={!!initialData} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md disabled:opacity-50" />
                                        </div>
                                        <div>
                                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                                            <input type="password" name="password" id="password" value={secret.password} onChange={handleSecretChange} required={!initialData} placeholder={initialData ? "Leave blank to keep old" : ""} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                                        </div>
                                    </div>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="service" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Service</label>
                                            <select name="service" id="service" value={secret.service} onChange={handleSecretChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                                <option value="pppoe">pppoe</option>
                                                <option value="any">any</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label htmlFor="profile" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile</label>
                                            <select name="profile" id="profile" value={secret.profile} onChange={handleSecretChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                                {profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </fieldset>

                            {/* Customer Information Section */}
                             <fieldset className="border border-slate-300 dark:border-slate-600 rounded-lg p-4">
                                <legend className="px-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Customer Information (Optional)</legend>
                                <div className="space-y-4">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                                            <input type="text" name="fullName" id="fullName" value={customer.fullName} onChange={handleCustomerChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md"/>
                                        </div>
                                        <div>
                                            <label htmlFor="contactNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Contact Number</label>
                                            <input type="text" name="contactNumber" id="contactNumber" value={customer.contactNumber} onChange={handleCustomerChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md"/>
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="address" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                                        <input type="text" name="address" id="address" value={customer.address} onChange={handleCustomerChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md"/>
                                    </div>
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                                        <input type="email" name="email" id="email" value={customer.email} onChange={handleCustomerChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md"/>
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg border-t border-slate-200 dark:border-slate-700">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500] disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save User'}
                        </button>
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

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CombinedUser | null>(null);

    const { customers, addCustomer, updateCustomer, deleteCustomer } = useCustomers(selectedRouter?.id || null);

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
        const sortedSecrets = [...secrets].sort((a, b) => a.name.localeCompare(b.name));
        return sortedSecrets.map(secret => {
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
            (user.customer?.fullName && user.customer.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (user.profile && user.profile.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [secrets, active, customers, selectedRouter, searchTerm]);

    const handleSaveUser = async (secretData: PppSecret | PppSecretData, customerData: Customer | Omit<Customer, 'id'>) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            // Save secret to router
            if ('id' in secretData) {
                await updatePppSecret(selectedRouter, secretData as PppSecret);
            } else {
                await addPppSecret(selectedRouter, secretData as PppSecretData);
            }
            
            // Save customer to local DB
            if ('id' in customerData) {
                await updateCustomer(customerData as Customer);
            } else {
                await addCustomer({ ...customerData, routerId: selectedRouter.id });
            }

            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUser = async (user: CombinedUser) => {
        if (!selectedRouter || !window.confirm(`Are you sure you want to delete user "${user.name}"?`)) return;
        setIsSubmitting(true);
        try {
            await deletePppSecret(selectedRouter, user.id);
            if (user.customer) {
                await deleteCustomer(user.customer.id);
            }
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadCsv = () => {
        const headers = ["Username", "Full Name", "Address", "Contact Number", "Email", "Profile", "Subscription Plan", "Due Date", "Status"];
        const rows = combinedUsers.map(user => [
            user.name,
            user.customer?.fullName || '',
            user.customer?.address || '',
            user.customer?.contactNumber || '',
            user.customer?.email || '',
            user.profile,
            user.parsedComment?.plan || '',
            user.parsedComment?.dueDate || '',
            user.disabled === 'true' ? 'Disabled' : (user.isActive ? 'Active' : 'Offline')
        ].map(field => `"${field.replace(/"/g, '""')}"`).join(','));

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `pppoe_users_${selectedRouter?.name}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getStatusChip = (user: CombinedUser) => {
        if (user.isActive) {
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Online</span>;
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
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">PPPoE User Manager</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its users.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="flex justify-center mt-8"><Loader /></div>;
    if (error) return <div className="text-red-500 text-center">{error}</div>;

    return (
        <div className="max-w-7xl mx-auto">
            <UserFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveUser}
                initialData={editingUser}
                profiles={profiles}
                isSubmitting={isSubmitting}
            />
            
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">PPPoE Users ({combinedUsers.length})</h2>
                <div className="flex items-center gap-2 flex-wrap">
                     <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-slate-400" /></span>
                        <input type="text" placeholder="Search user, profile, IP..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-64 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-10 pr-4" />
                    </div>
                     <button onClick={handleDownloadCsv} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-lg font-semibold">Download CSV</button>
                    <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="px-4 py-2 text-sm text-white bg-[--color-primary-600] hover:bg-[--color-primary-500] rounded-lg font-semibold">Add New User</button>
                </div>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">NOTE: The payment system uses the 'Comment' field on the router to store subscription data. Manually editing it may cause issues.</p>
            
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-4 py-3">Username</th>
                                <th className="px-4 py-3">Profile / Plan</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Due Date</th>
                                <th className="px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {combinedUsers.map(user => (
                                <tr key={user.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-900 dark:text-slate-200">{user.name}</p>
                                        <p className="text-xs text-slate-500">{user.customer?.fullName || 'No customer info'}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">{user.profile}</span>
                                        {user.parsedComment && <span className="block text-xs mt-1 text-slate-500">{user.parsedComment.plan}</span>}
                                    </td>
                                    <td className="px-4 py-3">{getStatusChip(user)}</td>
                                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{user.parsedComment?.dueDate ? new Date(user.parsedComment.dueDate).toLocaleDateString() : 'No Info'}</td>
                                    <td className="px-4 py-3 space-x-1">
                                        <button onClick={() => { alert('Payment feature coming soon!'); }} className="p-2 text-slate-400 hover:text-green-500" title="Process Payment (Coming Soon)"><CurrencyDollarIcon className="h-5 w-5"/></button>
                                        <button onClick={() => { setEditingUser(user); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-[--color-primary-500]" title="Edit User"><EditIcon className="h-5 w-5"/></button>
                                        <button onClick={() => handleDeleteUser(user)} className="p-2 text-slate-400 hover:text-red-500" title="Delete User"><TrashIcon className="h-5 w-5"/></button>
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
