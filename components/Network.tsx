import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, VlanInterface, Interface } from '../types.ts';
import { getVlans, addVlan, deleteVlan, getInterfaces } from '../services/mikrotikService.ts';
import { generateMultiWanScript } from '../services/geminiService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, TrashIcon, VlanIcon, ShareIcon } from '../constants.tsx';
import { CodeBlock } from './CodeBlock.tsx';

// --- VLAN Add/Edit Modal ---
interface VlanFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (vlanData: Omit<VlanInterface, 'id'>) => void;
    interfaces: Interface[];
    isLoading: boolean;
}

const VlanFormModal: React.FC<VlanFormModalProps> = ({ isOpen, onClose, onSave, interfaces, isLoading }) => {
    const [vlanData, setVlanData] = useState({ name: '', 'vlan-id': '', interface: '' });

    useEffect(() => {
        if (isOpen) {
            // Reset form and select first available physical interface
            const firstPhysicalInterface = interfaces.find(i => i.type === 'ether' || i.type === 'sfp' || i.type === 'wlan')?.name || '';
            setVlanData({ name: '', 'vlan-id': '', interface: firstPhysicalInterface });
        }
    }, [isOpen, interfaces]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setVlanData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(vlanData);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">Add New VLAN</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">VLAN Name</label>
                                <input type="text" name="name" id="name" value={vlanData.name} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-[--color-primary-500]" placeholder="e.g., vlan10-guests" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="vlan-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300">VLAN ID</label>
                                    <input type="number" name="vlan-id" id="vlan-id" value={vlanData['vlan-id']} onChange={handleChange} min="1" max="4094" required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                                </div>
                                <div>
                                    <label htmlFor="interface" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Parent Interface</label>
                                    <select name="interface" id="interface" value={vlanData.interface} onChange={handleChange} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-[--color-primary-500]">
                                        {interfaces.filter(i => i.type === 'ether' || i.type === 'sfp' || i.type === 'wlan' || i.type === 'bridge').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">
                            {isLoading ? 'Saving...' : 'Save VLAN'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Main Component ---
export const Network: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [vlans, setVlans] = useState<VlanInterface[]>([]);
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Multi-WAN state
    const [wanInterfaces, setWanInterfaces] = useState('ether1, ether2');
    const [lanInterface, setLanInterface] = useState('');
    const [wanType, setWanType] = useState<'pcc' | 'pbr'>('pcc');
    const [wanScript, setWanScript] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) {
            setIsLoading(false);
            setVlans([]);
            setInterfaces([]);
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const [vlanData, interfaceData] = await Promise.all([
                getVlans(selectedRouter),
                getInterfaces(selectedRouter)
            ]);
            setVlans(vlanData);
            setInterfaces(interfaceData);
            // Set default LAN interface for multi-WAN form
            if (interfaceData.length > 0) {
                const defaultLan = interfaceData.find(i => i.type === 'bridge' && i.name.toLowerCase().includes('lan'))?.name || interfaceData.find(i => i.type === 'bridge')?.name || '';
                setLanInterface(defaultLan);
            }
        } catch (err) {
            console.error("Failed to fetch network data:", err);
            setError(`Could not fetch network data from "${selectedRouter.name}". Ensure the router is connected.`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleAddVlan = async (vlanData: Omit<VlanInterface, 'id'>) => {
        if (!selectedRouter) return;
        setIsSubmitting(true);
        try {
            await addVlan(selectedRouter, vlanData);
            setIsModalOpen(false);
            await fetchData();
        } catch (err) {
            alert(`Error adding VLAN: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteVlan = async (vlanId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure you want to delete this VLAN interface?")) return;
        setIsSubmitting(true);
        try {
            await deleteVlan(selectedRouter, vlanId);
            await fetchData();
        } catch (err) {
            alert(`Error deleting VLAN: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGenerateWanScript = async () => {
        if (!wanInterfaces.trim() || !lanInterface) {
            alert("Please specify at least one WAN interface and a LAN interface.");
            return;
        }
        setIsGenerating(true);
        setWanScript('');
        try {
            const wanList = wanInterfaces.split(',').map(i => i.trim()).filter(Boolean);
            const script = await generateMultiWanScript(wanList, lanInterface, wanType);
            setWanScript(script);
        } catch (err) {
            setWanScript(`# Error generating script: ${(err as Error).message}`);
        } finally {
            setIsGenerating(false);
        }
    };
    
    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Network Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its network settings.</p>
            </div>
        );
    }
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64">
                <Loader />
                <p className="mt-4 text-[--color-primary-500] dark:text-[--color-primary-400]">Fetching network data from {selectedRouter.name}...</p>
            </div>
        );
    }
    
    if (error) {
         return (
            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-lg border border-red-300 dark:border-red-700 p-6 text-center">
                <p className="text-xl font-semibold text-red-600 dark:text-red-400">Failed to load data.</p>
                <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">{error}</p>
            </div>
         );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <VlanFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleAddVlan}
                interfaces={interfaces}
                isLoading={isSubmitting}
            />

            {/* VLAN Management Card */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <VlanIcon className="w-6 h-6 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                        <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">VLAN Interfaces</h3>
                    </div>
                    <button onClick={() => setIsModalOpen(true)} className="bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-3 rounded-lg text-sm">
                        Add VLAN
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3">VLAN Name</th>
                                <th className="px-6 py-3">VLAN ID</th>
                                <th className="px-6 py-3">Parent Interface</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vlans.length > 0 ? vlans.map(vlan => (
                                <tr key={vlan.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{vlan.name}</td>
                                    <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{vlan['vlan-id']}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{vlan.interface}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleDeleteVlan(vlan.id)} disabled={isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-8 text-slate-500">
                                        No VLAN interfaces found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Multi-WAN Card */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                 <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <ShareIcon className="w-6 h-6 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                    <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">AI Multi-WAN Assistant</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="wanInterfaces" className="block text-sm font-medium text-slate-700 dark:text-slate-300">WAN Interfaces</label>
                            <input type="text" name="wanInterfaces" id="wanInterfaces" value={wanInterfaces} onChange={e => setWanInterfaces(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., ether1, ether2, pppoe-out1"/>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Enter a comma-separated list of your WAN interfaces.</p>
                        </div>
                         <div>
                            <label htmlFor="lanInterface" className="block text-sm font-medium text-slate-700 dark:text-slate-300">LAN Interface</label>
                            <select name="lanInterface" id="lanInterface" value={lanInterface} onChange={e => setLanInterface(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                 {interfaces.filter(i => i.type === 'bridge' || i.type === 'ether').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                            </select>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Select the interface your local users are on.</p>
                        </div>
                        <div>
                            <label htmlFor="wanType" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Configuration Type</label>
                            <select name="wanType" id="wanType" value={wanType} onChange={e => setWanType(e.target.value as 'pcc' | 'pbr')} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                <option value="pcc">PCC - Load Balance (Merge Speed)</option>
                                <option value="pbr">PBR - Failover</option>
                            </select>
                        </div>
                        <button onClick={handleGenerateWanScript} disabled={isGenerating} className="w-full bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50">
                            {isGenerating ? 'Generating...' : 'Generate Script'}
                        </button>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 border border-slate-200 dark:border-slate-700 min-h-[300px] relative">
                        {isGenerating && <div className="absolute inset-0 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-center"><Loader /></div>}
                        <CodeBlock script={wanScript || '# Your generated multi-WAN script will appear here.'} />
                    </div>
                </div>
            </div>
        </div>
    );
};
