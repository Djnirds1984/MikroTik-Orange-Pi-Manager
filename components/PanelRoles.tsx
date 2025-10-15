import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Loader } from './Loader.tsx';
import { LockClosedIcon, EditIcon, TrashIcon, UsersIcon } from '../constants.tsx';

interface PanelUser {
    id: number;
    username: string;
    role: string;
}

interface PanelRole {
    id: number;
    name: string;
}

const getAuthHeader = () => ({ 'Authorization': `Bearer ${localStorage.getItem('authToken')}` });

const UserFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    initialData: PanelUser | null;
    roles: PanelRole[];
    isLoading: boolean;
}> = ({ isOpen, onClose, onSave, initialData, roles, isLoading }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [roleId, setRoleId] = useState<number | ''>('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setUsername(initialData.username);
                const role = roles.find(r => r.name === initialData.role);
                setRoleId(role?.id || '');
            } else {
                setUsername('');
                setPassword('');
                setRoleId(roles.length > 0 ? roles[0].id : '');
            }
        }
    }, [initialData, isOpen, roles]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = initialData 
            ? { role_id: roleId } 
            : { username, password, role_id: roleId };
        onSave(data);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">{initialData ? 'Edit User Role' : 'Create New User'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Username</label>
                                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required disabled={!!initialData} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md disabled:opacity-50" />
                            </div>
                            {!initialData && (
                                <div>
                                    <label className="block text-sm font-medium">Password</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium">Role</label>
                                <select value={roleId} onChange={e => setRoleId(Number(e.target.value))} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md">
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 bg-orange-600 text-white rounded-md">{isLoading ? 'Saving...' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const PanelRoles: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<PanelUser[]>([]);
    const [roles, setRoles] = useState<PanelRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<PanelUser | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [usersRes, rolesRes] = await Promise.all([
                fetch('/api/panel-management/users', { headers: getAuthHeader() }),
                fetch('/api/panel-management/roles', { headers: getAuthHeader() })
            ]);
            if (!usersRes.ok || !rolesRes.ok) throw new Error('Failed to fetch data');
            setUsers(await usersRes.json());
            setRoles(await rolesRes.json());
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSave = async (data: any) => {
        setIsSubmitting(true);
        try {
            const url = editingUser ? `/api/panel-management/users/${editingUser.id}` : '/api/panel-management/users';
            const method = editingUser ? 'PATCH' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to save user');
            }
            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = async (userId: number) => {
        if (!window.confirm("Are you sure you want to delete this user?")) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/panel-management/users/${userId}`, { method: 'DELETE', headers: getAuthHeader() });
             if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to delete user');
            }
            await fetchData();
        } catch (err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <UserFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingUser} roles={roles} isLoading={isSubmitting} />
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3"><LockClosedIcon className="w-8 h-8" /> Panel User Roles</h2>
                <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg">Create User</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50"><tr><th className="px-6 py-3">Username</th><th className="px-6 py-3">Role</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{user.username}</td>
                                <td className="px-6 py-4">{user.role}</td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    {user.username !== 'superadmin' && user.id !== currentUser?.id && (
                                        <>
                                            <button onClick={() => { setEditingUser(user); setIsModalOpen(true); }} className="p-2"><EditIcon className="h-5 w-5"/></button>
                                            <button onClick={() => handleDelete(user.id)} className="p-2"><TrashIcon className="h-5 w-5"/></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};