import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Loader } from './Loader.tsx';
import { TrashIcon, UsersIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';
import { getAuthHeader } from '../services/databaseService.ts';

interface PanelUser {
    id: string;
    username: string;
    role: { name: string; };
}

interface Role {
    id: string;
    name: string;
}

export const PanelRoles: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<PanelUser[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [usersRes, rolesRes] = await Promise.all([
                fetch('/api/panel-users', { headers: getAuthHeader() }),
                fetch('/api/roles', { headers: getAuthHeader() })
            ]);

            if (!usersRes.ok || !rolesRes.ok) {
                const usersError = !usersRes.ok ? await usersRes.json() : null;
                const rolesError = !rolesRes.ok ? await rolesRes.json() : null;
                throw new Error(usersError?.message || rolesError?.message || 'Failed to fetch data');
            }
            
            const usersData = await usersRes.json();
            const rolesData = await rolesRes.json();

            setUsers(usersData);
            setRoles(rolesData);
            if (rolesData.length > 0) {
                // Default to 'Employee' if it exists
                const employeeRole = rolesData.find(r => r.name.toLowerCase() === 'employee');
                setSelectedRoleId(employeeRole ? employeeRole.id : rolesData[0].id);
            }

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
            const response = await fetch('/api/panel-users', {
                method: 'POST',
                headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUsername, password: newPassword, role_id: selectedRoleId })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to add user');
            }
            setNewUsername('');
            setNewPassword('');
            fetchData(); // Refresh list
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
            setIsSubmitting(true);
            setError(null);
            try {
                const response = await fetch(`/api/panel-users/${userId}`, {
                    method: 'DELETE',
                    headers: getAuthHeader()
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({ message: 'Failed to delete user' }));
                    throw new Error(data.message);
                }
                fetchData(); // Refresh list
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setIsSubmitting(false);
            }
        }
    };


    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader /></div>;
    }
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Panel User Management</h2>

            {error && <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded-md text-red-700 dark:text-red-300 text-sm">{error}</div>}

            {/* Add User Form */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Add New User</h3>
                </div>
                <form onSubmit={handleAddUser} className="p-6 space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                             <label className="block text-sm font-medium">Username</label>
                             <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" />
                        </div>
                        <div className="relative">
                            <label className="block text-sm font-medium">Password</label>
                            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-9 text-slate-400 hover:text-slate-600">
                                {showPassword ? <EyeSlashIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Role</label>
                            <select value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)} className="mt-1 w-full p-2 rounded-md bg-slate-100 dark:bg-slate-700">
                                {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                        </div>
                     </div>
                     <div className="flex justify-end">
                         <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[--color-primary-600] text-white font-bold rounded-lg disabled:opacity-50">
                            {isSubmitting ? 'Adding...' : 'Add User'}
                        </button>
                     </div>
                </form>
            </div>

            {/* User List */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                 <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Current Users</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">Username</th>
                                <th className="px-6 py-3">Role</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} className="border-b dark:border-slate-700 last:border-0">
                                    <td className="px-6 py-4 font-medium flex items-center gap-2">
                                        <UsersIcon className="w-5 h-5 text-slate-400"/>
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role.name === 'Administrator' ? 'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200' : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'}`}>
                                            {user.role.name}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleDeleteUser(user.id)} 
                                            disabled={isSubmitting || currentUser?.id === user.id}
                                            className="p-2 text-slate-500 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={currentUser?.id === user.id ? 'Cannot delete yourself' : 'Delete user'}
                                        >
                                            <TrashIcon className="h-5 w-5" />
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