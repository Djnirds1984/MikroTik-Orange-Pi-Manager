
import React, { useState, useEffect, useCallback } from 'react';
import { Loader } from './Loader.tsx';
// FIX: Import the missing UsersIcon component.
import { TrashIcon, KeyIcon, UsersIcon } from '../constants.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { getPanelUsers, createPanelUser, removePanelUser } from '../services/panelUserService.ts';

interface PanelUser {
    id: string;
    username: string;
    role: 'admin' | 'employee';
}

export const PanelRoles: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<PanelUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'employee' | 'admin'>('employee');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getPanelUsers();
            setUsers(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await createPanelUser({ username: newUsername, password: newPassword, role: newRole });
            setNewUsername('');
            setNewPassword('');
            await fetchData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (userId: string, username: string) => {
        if (currentUser?.id === userId) {
            alert("You cannot delete your own account.");
            return;
        }
        if (window.confirm(`Are you sure you want to delete the user "${username}"? This action cannot be undone.`)) {
            try {
                await removePanelUser(userId);
                await fetchData();
            } catch (err) {
                setError((err as Error).message);
            }
        }
    };

    if (isLoading) {
        return <div className="flex justify-center"><Loader /></div>;
    }
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                 <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <KeyIcon className="w-6 h-6 text-[--color-primary-500]" />
                    <h3 className="text-lg font-semibold text-[--color-primary-500]">Add New User</h3>
                </div>
                <form onSubmit={handleAddUser} className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm">{error}</div>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium">Username</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Password</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md" />
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium">Role</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value as 'employee' | 'admin')} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-md">
                                <option value="employee">Employee</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-700] text-white font-bold rounded-lg disabled:opacity-50">
                            {isSubmitting ? 'Creating...' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
            
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                     <UsersIcon className="w-6 h-6 text-[--color-primary-500]" />
                     <h3 className="text-lg font-semibold text-[--color-primary-500]">Existing Users</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Role</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="border-b dark:border-slate-700">
                                    <td className="px-6 py-4 font-medium">{user.username} {user.id === currentUser?.id && '(You)'}</td>
                                    <td className="px-6 py-4 capitalize">{user.role}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleDeleteUser(user.id, user.username)} 
                                            disabled={user.id === currentUser?.id}
                                            className="p-2 text-slate-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
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