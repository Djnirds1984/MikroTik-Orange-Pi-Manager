import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { RouterConfigWithId, VlanInterface, Interface, IpAddress, WanRoute } from '../types.ts';
import { getVlans, addVlan, deleteVlan, getInterfaces, getIpAddresses, getWanRoutes, setRouteProperty } from '../services/mikrotikService.ts';
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

// --- Multi-WAN Manager Sub-component ---
const MultiWanManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [routes, setRoutes] = useState<WanRoute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRoutes = useCallback(async () => {
        try {
            const wanRoutes = await getWanRoutes(selectedRouter);
            setRoutes(wanRoutes);
        } catch (err) {
            console.error("Failed to fetch WAN routes:", err);
            setError(`Could not fetch WAN routes: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchRoutes();
        const interval = setInterval(fetchRoutes, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [fetchRoutes]);
    
    const handleToggleRoute = async (routeId: string, isDisabled: boolean) => {
        try {
            // Optimistically update UI
            setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, disabled: !isDisabled } : r));
            await setRouteProperty(selectedRouter, routeId, { disabled: !isDisabled ? 'true' : 'false' });
            // Re-fetch to get the authoritative state
            await fetchRoutes();
        } catch (err) {
            alert(`Failed to update route: ${(err as Error).message}`);
            // Revert UI on failure
            await fetchRoutes();
        }
    };

    if (isLoading) {
        return <div className="p-6 text-center text-slate-500 dark:text-slate-400">Loading WAN routes...</div>;
    }

    if (error) {
        return <div className="p-6 text-center text-red-600 dark:text-red-400">{error}</div>;
    }

    return (
        <div className="p-6 space-y-4">
             <p className="text-sm text-slate-500 dark:text-slate-400">
                This manager shows your default routes (dst-address 0.0.0.0/0). The 'Active' status reflects the health of the connection. For automatic status updates, enable <code className="text-xs bg-slate-200 dark:bg-slate-700 p-1 rounded">check-gateway=ping</code> on each route in your router.
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                        <tr>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Gateway</th>
                            <th className="px-4 py-3">Distance</th>
                            <th className="px-4 py-3">Comment</th>
                            <th className="px-4 py-3 text-center">Enabled</th>
                        </tr>
                    </thead>
                    <tbody>
                        {routes.length > 0 ? routes.map(route => (
                            <tr key={route.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                                <td className="px-4 py-4">
                                    {route.active ? 
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Active</span> :
                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">Inactive</span>
                                    }
                                </td>
                                <td className="px-4 py-4 font-mono text-cyan-600 dark:text-cyan-400">{route.gateway}</td>
                                <td className="px-4 py-4 font-mono">{route.distance}</td>
                                <td className="px-4 py-4 text-slate-500 dark:text-slate-400 italic">{route.comment}</td>
                                <td className="px-4 py-4 text-center">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!route.disabled}
                                            onChange={() => handleToggleRoute(route.id, !route.disabled)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-focus:ring-2 peer-focus:ring-[--color-primary-500] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[--color-primary-600]"></div>
                                    </label>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-slate-500">
                                    No default WAN routes found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Main Component ---
export const Network: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [vlans, setVlans] = useState<VlanInterface[]>([]);
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [ipAddresses, setIpAddresses] = useState<IpAddress[]>([]);
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
            setIpAddresses([]);
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            const [vlanData, interfaceData, ipData] = await Promise.all([
                getVlans(selectedRouter),
                getInterfaces(selectedRouter),
                getIpAddresses(selectedRouter)
            ]);
            setVlans(vlanData);
            setInterfaces(interfaceData);
            setIpAddresses(ipData);
            
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

    const wanIps = useMemo(() => {
        const wanNames = wanInterfaces.split(',').map(i => i.trim().toLowerCase());
        return ipAddresses
            .filter(ip => wanNames.includes(ip.interface.toLowerCase()))
            .map(ip => `${ip.interface} (${ip.address})`)
            .join(', ');
    }, [wanInterfaces, ipAddresses]);

    const lanIp = useMemo(() => {
        return ipAddresses.find(ip => ip.interface.toLowerCase() === lanInterface.toLowerCase())?.address || null;
    }, [lanInterface, ipAddresses]);
    
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

            {/* Multi-WAN Manager Card */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <ShareIcon className="w-6 h-6 text-green-500 dark:text-green-400" />
                    <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">Multi-WAN Manager</h3>
                </div>
                <MultiWanManager selectedRouter={selectedRouter} />
            </div>

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

            {/* AI Multi-WAN Script Assistant Card */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
                 <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <ShareIcon className="w-6 h-6 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                    <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">AI Multi-WAN Script Assistant</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="wanInterfaces" className="block text-sm font-medium text-slate-700 dark:text-slate-300">WAN Interfaces</label>
                            <input type="text" name="wanInterfaces" id="wanInterfaces" value={wanInterfaces} onChange={e => setWanInterfaces(e.target.value)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., ether1, ether2, pppoe-out1"/>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Enter a comma-separated list of your WAN interfaces.</p>
                            {wanIps && <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono">Detected IPs: {wanIps}</p>}
                        </div>
                         <div>
                            <label htmlFor="lanInterface" className="block text-sm font-medium text-slate-700 dark:text-slate-300">LAN Interface</label>
                            <select name="lanInterface" id="lanInterface" value={lanInterface} onChange={e => setLanInterface(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                 {interfaces.filter(i => i.type === 'bridge' || i.type === 'ether').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                            </select>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Select the interface your local users are on.</p>
                             {lanIp && <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono">Detected IP: {lanIp}</p>}
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