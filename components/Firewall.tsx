
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, FirewallRule } from '../types.ts';
import { getFirewallRules } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ShieldCheckIcon } from '../constants.tsx';

const getActionColor = (action: string) => {
    switch (action) {
        case 'accept': return 'text-green-500 dark:text-green-400';
        case 'drop':
        case 'reject': return 'text-red-500 dark:text-red-400';
        case 'log': return 'text-yellow-500 dark:text-yellow-400';
        default: return 'text-sky-500 dark:text-sky-400';
    }
}

export const Firewall: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [rules, setRules] = useState<FirewallRule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await getFirewallRules(selectedRouter);
            setRules(data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">Firewall Rules</h2>
                <p className="mt-2 text-slate-500">Please select a router to view its firewall filter rules.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>;

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold flex items-center gap-3"><ShieldCheckIcon className="w-8 h-8"/> Firewall Filter Rules</h2>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">#</th>
                                <th className="px-6 py-3">Chain</th>
                                <th className="px-6 py-3">Action</th>
                                <th className="px-6 py-3">Protocol</th>
                                <th className="px-6 py-3">Src Address</th>
                                <th className="px-6 py-3">Dst Address</th>
                                <th className="px-6 py-3">Dst Port</th>
                                <th className="px-6 py-3">Comment</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((rule, index) => (
                                <tr key={rule['.id']} className={`border-b dark:border-slate-700 ${rule.disabled ? 'opacity-40 italic' : ''}`}>
                                    <td className="px-6 py-4">{index}</td>
                                    <td className="px-6 py-4 font-semibold">{rule.chain}</td>
                                    <td className={`px-6 py-4 font-bold ${getActionColor(rule.action)}`}>{rule.action}</td>
                                    <td className="px-6 py-4">{rule.protocol || 'any'}</td>
                                    <td className="px-6 py-4 font-mono">{rule['src-address'] || ''}</td>
                                    <td className="px-6 py-4 font-mono">{rule['dst-address'] || ''}</td>
                                    <td className="px-6 py-4">{rule['dst-port'] || ''}</td>
                                    <td className="px-6 py-4">{rule.comment || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
