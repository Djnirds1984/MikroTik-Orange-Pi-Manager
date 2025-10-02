import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfig, RouterConfigWithId } from '../types';
import { testRouterConnection } from '../services/mikrotikService';
import { RouterIcon, EditIcon, TrashIcon, SignalIcon } from '../constants';

interface RoutersProps {
    routers: RouterConfigWithId[];
    onAddRouter: (router: RouterConfig) => void;
    onUpdateRouter: (router: RouterConfigWithId) => void;
    onDeleteRouter: (id: string) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const RouterForm: React.FC<{
    onSubmit: (router: RouterConfig) => void;
    onCancel: () => void;
    initialData?: RouterConfig | null;
}> = ({ onSubmit, onCancel, initialData }) => {
    const [name, setName] = useState('');
    const [host, setHost] = useState('');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [port, setPort] = useState(8728);

    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testMessage, setTestMessage] = useState('');

    const formData: RouterConfig = { name, host, user, password, port };

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
            setHost(initialData.host);
            setUser(initialData.user);
            setPassword(initialData.password || '');
            setPort(initialData.port);
        }
    }, [initialData]);

    // Reset test status if form data changes
    useEffect(() => {
        setTestStatus('idle');
        setTestMessage('');
    }, [name, host, user, password, port]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const handleTestConnection = useCallback(async () => {
        setTestStatus('testing');
        setTestMessage('');
        try {
            const result = await testRouterConnection(formData);
            setTestMessage(result.message);
            setTestStatus(result.success ? 'success' : 'error');
        } catch (err) {
            setTestMessage('An unexpected error occurred.');
            setTestStatus('error');
        }
    }, [formData]);

    const isTesting = testStatus === 'testing';

    return (
        <form onSubmit={handleSubmit} className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
            <h3 className="text-xl font-bold text-orange-400">{initialData ? 'Edit Router' : 'Add a New Router'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">Nickname</label>
                    <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g., Home Router" className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-orange-500 focus:border-orange-500"/>
                </div>
                <div>
                    <label htmlFor="host" className="block text-sm font-medium text-slate-300 mb-1">Host / IP Address</label>
                    <input type="text" id="host" value={host} onChange={e => setHost(e.target.value)} required placeholder="192.168.88.1" className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-orange-500 focus:border-orange-500"/>
                </div>
                 <div>
                    <label htmlFor="user" className="block text-sm font-medium text-slate-300 mb-1">API Username</label>
                    <input type="text" id="user" value={user} onChange={e => setUser(e.target.value)} required placeholder="api-user" className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-orange-500 focus:border-orange-500"/>
                </div>
                 <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                    <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="(leave blank if none)" className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-orange-500 focus:border-orange-500"/>
                </div>
                 <div className="md:col-span-2">
                    <label htmlFor="port" className="block text-sm font-medium text-slate-300 mb-1">API Port</label>
                    <input type="number" id="port" value={port} onChange={e => setPort(parseInt(e.target.value, 10))} required className="w-full md:w-1/4 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-orange-500 focus:border-orange-500"/>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-2">
                <div className="w-full sm:w-auto sm:flex-grow text-center sm:text-left h-5">
                     {testStatus !== 'idle' && (
                        <p className={`text-sm ${
                            testStatus === 'success' ? 'text-green-400' :
                            testStatus === 'error' ? 'text-red-400' :
                            'text-orange-400'
                        }`}>
                            {isTesting ? 'Testing...' : testMessage}
                        </p>
                    )}
                </div>
                <button type="button" onClick={handleTestConnection} disabled={isTesting} className="w-full sm:w-auto bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center disabled:bg-sky-800 disabled:cursor-wait">
                    <SignalIcon className={`w-5 h-5 mr-2 ${isTesting ? 'animate-pulse' : ''}`}/>
                    Test Connection
                </button>
                <button type="button" onClick={onCancel} disabled={isTesting} className="w-full sm:w-auto bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-slate-700">Cancel</button>
                <button type="submit" disabled={isTesting} className="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-orange-800">
                    {initialData ? 'Save Changes' : 'Add Router'}
                </button>
            </div>
        </form>
    );
}

export const Routers: React.FC<RoutersProps> = ({ routers, onAddRouter, onUpdateRouter, onDeleteRouter }) => {
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingRouter, setEditingRouter] = useState<RouterConfigWithId | null>(null);

    const handleAddClick = () => {
        setEditingRouter(null);
        setIsFormVisible(true);
    };

    const handleEditClick = (router: RouterConfigWithId) => {
        setEditingRouter(router);
        setIsFormVisible(true);
    };
    
    const handleCancel = () => {
        setIsFormVisible(false);
        setEditingRouter(null);
    }
    
    const handleSubmit = (routerData: RouterConfig) => {
        if (editingRouter) {
            onUpdateRouter({ ...routerData, id: editingRouter.id });
        } else {
            onAddRouter(routerData);
        }
        setIsFormVisible(false);
        setEditingRouter(null);
    }

    const handleDelete = (id: string, name: string) => {
        if (window.confirm(`Are you sure you want to delete the router "${name}"?`)) {
            onDeleteRouter(id);
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-100">Manage Routers</h2>
                {!isFormVisible && (
                    <button onClick={handleAddClick} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Add New Router
                    </button>
                )}
            </div>
            
            {isFormVisible && <RouterForm onSubmit={handleSubmit} onCancel={handleCancel} initialData={editingRouter} />}
            
            <div className="bg-slate-800 border border-slate-700 rounded-lg">
                <ul className="divide-y divide-slate-700">
                    {routers.length > 0 ? routers.map(router => (
                        <li key={router.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <RouterIcon className="w-8 h-8 text-orange-400" />
                                <div>
                                    <p className="font-bold text-slate-200">{router.name}</p>
                                    <p className="text-sm text-slate-400 font-mono">{router.user}@{router.host}:{router.port}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => handleEditClick(router)} className="text-slate-400 hover:text-sky-400 transition-colors" title="Edit">
                                    <EditIcon className="w-5 h-5" />
                                </button>
                                 <button onClick={() => handleDelete(router.id, router.name)} className="text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </li>
                    )) : (
                        <li className="p-8 text-center text-slate-500">
                            You haven't added any routers yet. Click "Add New Router" to get started.
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};