import React, { useState, useEffect, useCallback } from 'react';
import type { ZeroTierNetwork, ZeroTierInfo } from '../types.ts';
import { getZeroTierStatus, joinZeroTierNetwork, leaveZeroTierNetwork, setZeroTierNetworkSetting } from '../services/zeroTierPanelService.ts';
import { Loader } from './Loader.tsx';
import { TrashIcon, ZeroTierIcon, ExclamationTriangleIcon } from '../constants.tsx';
import { CodeBlock } from './CodeBlock.tsx';

// --- Informational Components for Different States ---

const InstallationGuide: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-3xl mx-auto text-center">
        <ZeroTierIcon className="w-16 h-16 text-orange-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-100">ZeroTier One Not Found</h2>
        <p className="mt-2 text-slate-400">The `zerotier-cli` command was not found on this system. Please install it to continue.</p>
        
        <div className="text-left my-6 bg-slate-900/50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Installation Command</h3>
            <p className="text-sm text-slate-400 mb-4">Run the following command in your server's terminal (e.g., via SSH) to install ZeroTier:</p>
            <div className="bg-slate-800 rounded-lg border border-slate-700 min-h-[60px]">
                 <CodeBlock script="curl -s https://install.zerotier.com | sudo bash" />
            </div>
        </div>
        
        <button onClick={onRetry} className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 rounded-lg font-semibold">
            Re-check Status
        </button>
    </div>
);

const ServiceDownGuide: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="bg-slate-800 border border-yellow-700/50 rounded-lg p-8 max-w-3xl mx-auto text-center">
        <ExclamationTriangleIcon className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-100">ZeroTier Service Unavailable</h2>
        <p className="mt-2 text-slate-400">We found ZeroTier, but couldn't connect to its service. It may be stopped or malfunctioning.</p>
        
        <div className="text-left my-6 bg-slate-900/50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">How to Fix</h3>
            <p className="text-sm text-slate-400 mb-4">Run the following commands in your server's terminal to start and enable the service:</p>
            <div className="bg-slate-800 rounded-lg border border-slate-700">
                <CodeBlock script={`sudo systemctl start zerotier-one.service\nsudo systemctl enable zerotier-one.service`} />
            </div>
        </div>
        
        <button onClick={onRetry} className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 rounded-lg font-semibold">
            Re-check Status
        </button>
    </div>
);

const GenericError: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
     <div className="flex flex-col items-center justify-center h-64 bg-slate-800 rounded-lg border border-red-700 p-6 text-center">
        <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-xl font-semibold text-red-400">Failed to load ZeroTier data.</p>
        <p className="mt-2 text-slate-400 text-sm">{message}</p>
        <button onClick={onRetry} className="mt-6 px-4 py-2 bg-red-600/50 hover:bg-red-500/50 rounded-lg font-semibold">
            Try Again
        </button>
    </div>
);


// --- Add Network Modal ---
interface AddNetworkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (networkId: string) => void;
    isLoading: boolean;
}

const AddNetworkModal: React.FC<AddNetworkModalProps> = ({ isOpen, onClose, onSave, isLoading }) => {
    const [networkId, setNetworkId] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(networkId);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-700">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h3 className="text-xl font-bold text-orange-400 mb-4">Join ZeroTier Network</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="networkId" className="block text-sm font-medium text-slate-300">16-digit Network ID</label>
                                <input
                                    type="text"
                                    name="networkId"
                                    id="networkId"
                                    value={networkId}
                                    onChange={(e) => setNetworkId(e.target.value)}
                                    required
                                    pattern="^[0-9a-fA-F]{16}$"
                                    title="Please enter a 16-character hexadecimal Network ID"
                                    className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white font-mono tracking-wider focus:outline-none focus:ring-orange-500"
                                    placeholder="e.g., 8056c2e21c000001"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-50">Cancel</button>
                        <button type="submit" disabled={isLoading || !networkId.match(/^[0-9a-fA-F]{16}$/)} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isLoading ? 'Joining...' : 'Join Network'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- Toggle Switch Component ---
const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean; }> = ({ checked, onChange, disabled }) => (
    <label className="relative inline-flex items-center cursor-pointer">
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-orange-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600 disabled:opacity-50"></div>
    </label>
);


// --- Main ZeroTier Management UI ---
const ZeroTierManager: React.FC<{
    info: ZeroTierInfo;
    networks: ZeroTierNetwork[];
    onJoin: () => void;
    onLeave: (nwid: string) => void;
    onToggle: (nwid: string, setting: 'allowManaged' | 'allowGlobal' | 'allowDefault', value: boolean) => void;
    isSubmitting: boolean;
}> = ({ info, networks, onJoin, onLeave, onToggle, isSubmitting }) => {

    const getStatusChip = (status: string) => {
        switch (status) {
            case 'OK': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">OK</span>;
            case 'ACCESS_DENIED': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-400">Access Denied</span>;
            case 'NOT_FOUND': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-400">Not Found</span>;
            case 'REQUESTING_CONFIGURATION': return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-400">Configuring...</span>;
            default: return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-600/50 text-slate-400">{status}</span>;
        }
    };

    return (
         <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-100">ZeroTier Panel Management</h2>
                    <p className="text-slate-400 mt-1">Manage the ZeroTier service running on this panel's host.</p>
                </div>
                <button onClick={onJoin} className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded-lg self-start sm:self-center">
                    Join Network
                </button>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="font-mono"><span className="text-slate-400">Node ID:</span> <span className="text-orange-300">{info.address}</span></div>
                <div><span className="text-slate-400">Version:</span> <span className="text-slate-200">{info.version}</span></div>
                <div><span className="text-slate-400">Online:</span> <span className={info.online ? 'text-green-400' : 'text-red-400'}>{info.online ? 'Yes' : 'No'}</span></div>
                <div><span className="text-slate-400">Port Mapping:</span> <span className="text-slate-200">{info.config.settings.portMappingEnabled ? 'Enabled' : 'Disabled'}</span></div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-4 py-3">Network</th>
                                <th scope="col" className="px-4 py-3">Status</th>
                                <th scope="col" className="px-4 py-3">Assigned IPs</th>
                                <th scope="col" className="px-4 py-3 text-center">Allow Managed</th>
                                <th scope="col" className="px-4 py-3 text-center">Allow Global</th>
                                <th scope="col" className="px-4 py-3 text-center">Allow Default</th>
                                <th scope="col" className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {networks.length > 0 ? networks.map(net => (
                                <tr key={net.nwid} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                                    <td className="px-4 py-4">
                                        <p className="font-semibold text-slate-200">{net.name || <span className="text-slate-500 italic">No Name</span>}</p>
                                        <p className="font-mono text-cyan-400 text-xs">{net.nwid}</p>
                                    </td>
                                    <td className="px-4 py-4">{getStatusChip(net.status)}</td>
                                    <td className="px-4 py-4 font-mono text-slate-300 text-xs">
                                        {net.assignedAddresses.map(ip => <div key={ip}>{ip}</div>)}
                                    </td>
                                    <td className="px-4 py-4 text-center"><ToggleSwitch checked={net.allowManaged} onChange={() => onToggle(net.nwid, 'allowManaged', !net.allowManaged)} /></td>
                                    <td className="px-4 py-4 text-center"><ToggleSwitch checked={net.allowGlobal} onChange={() => onToggle(net.nwid, 'allowGlobal', !net.allowGlobal)} /></td>
                                    <td className="px-4 py-4 text-center"><ToggleSwitch checked={net.allowDefault} onChange={() => onToggle(net.nwid, 'allowDefault', !net.allowDefault)} /></td>
                                    <td className="px-4 py-4 text-right">
                                        <button onClick={() => onLeave(net.nwid)} disabled={isSubmitting} className="p-2 text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Leave Network">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-slate-500">
                                        Not joined to any ZeroTier networks.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---
export const ZeroTier: React.FC = () => {
    const [status, setStatus] = useState<'loading' | 'ready' | 'not_installed' | 'service_down' | 'error'>('loading');
    const [networks, setNetworks] = useState<ZeroTierNetwork[]>([]);
    const [ztInfo, setZtInfo] = useState<ZeroTierInfo | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setStatus('loading');
        try {
            const { info, networks } = await getZeroTierStatus();
            setZtInfo(info);
            setNetworks(networks);
            setStatus('ready');
        } catch (err) {
            const error = err as any;
            if (error?.data?.code === 'ZEROTIER_NOT_INSTALLED') {
                setStatus('not_installed');
            } else if (error?.data?.code === 'ZEROTIER_SERVICE_DOWN') {
                setStatus('service_down');
            } else {
                setStatus('error');
                setErrorMessage(error.message || 'An unknown error occurred.');
            }
            console.error("Failed to fetch ZeroTier status:", err);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleJoin = async (networkId: string) => {
        setIsSubmitting(true);
        try {
            await joinZeroTierNetwork(networkId);
            setIsModalOpen(false);
            setTimeout(fetchData, 1000); // Give a moment for the service to update
        } catch (err) {
            alert(`Error joining network: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLeave = async (nwid: string) => {
        if (!window.confirm(`Are you sure you want to leave network ${nwid}?`)) return;
        setIsSubmitting(true);
        try {
            await leaveZeroTierNetwork(nwid);
            await fetchData();
        } catch (err) {
            alert(`Error leaving network: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggle = async (nwid: string, setting: 'allowManaged' | 'allowGlobal' | 'allowDefault', value: boolean) => {
        setNetworks(prev => prev.map(n => n.nwid === nwid ? { ...n, [setting]: value } : n));
        try {
            await setZeroTierNetworkSetting(nwid, setting, value);
        } catch (err) {
            alert(`Error updating setting: ${(err as Error).message}`);
            fetchData(); // Revert on error
        }
    };

    const renderContent = () => {
        switch (status) {
            case 'loading':
                return (
                    <div className="flex flex-col items-center justify-center h-64">
                        <Loader />
                        <p className="mt-4 text-orange-400">Fetching ZeroTier status from panel host...</p>
                    </div>
                );
            case 'not_installed':
                return <InstallationGuide onRetry={fetchData} />;
            case 'service_down':
                return <ServiceDownGuide onRetry={fetchData} />;
            case 'error':
                return <GenericError message={errorMessage} onRetry={fetchData} />;
            case 'ready':
                if (!ztInfo) return <GenericError message="Failed to parse ZeroTier info." onRetry={fetchData} />;
                return (
                    <ZeroTierManager
                        info={ztInfo}
                        networks={networks}
                        onJoin={() => setIsModalOpen(true)}
                        onLeave={handleLeave}
                        onToggle={handleToggle}
                        isSubmitting={isSubmitting}
                    />
                );
            default:
                return null;
        }
    };
    
    return (
        <div>
            <AddNetworkModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleJoin}
                isLoading={isSubmitting}
            />
            {renderContent()}
        </div>
    );
};