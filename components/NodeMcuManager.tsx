import React, { useMemo, useState, useEffect } from 'react';
import type { RouterConfigWithId, HotspotHost, NodeMcuSettings, NodeMcuRate } from '../types.ts';
// FIX: The `Loader` component is in its own file and not exported from `constants`.
import { ChipIcon, ExclamationTriangleIcon, EditIcon, TrashIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';
import { getSettings, saveSettings, rebootDevice, loginToDevice } from '../services/nodeMcuService.ts';

// FIX: Define a type for the device object that includes the dynamically added `name` property.
type NodeMcuDevice = HotspotHost & { name: string };

interface NodeMcuSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: NodeMcuSettings) => void;
    // FIX: Use the extended device type.
    device: NodeMcuDevice | null;
    initialSettings: NodeMcuSettings | null;
    isLoading: boolean;
}

const NodeMcuSettingsModal: React.FC<NodeMcuSettingsModalProps> = ({ isOpen, onClose, onSave, device, initialSettings, isLoading }) => {
    const [settings, setSettings] = useState<NodeMcuSettings | null>(initialSettings);

    useEffect(() => {
        // Deep copy to prevent modifying the original state directly
        setSettings(initialSettings ? JSON.parse(JSON.stringify(initialSettings)) : null);
    }, [initialSettings]);

    if (!isOpen || !device || !settings) return null;

    const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => prev ? { ...prev, [name]: value } : null);
    };

    const handleRateChange = (index: number, field: 'credit' | 'time', value: string) => {
        const numValue = parseInt(value, 10) || 0;
        setSettings(prev => {
            if (!prev) return null;
            const newRates = [...prev.rates];
            newRates[index] = { ...newRates[index], [field]: numValue };
            return { ...prev, rates: newRates };
        });
    };

    const addRate = () => {
        setSettings(prev => prev ? { ...prev, rates: [...prev.rates, { credit: 1, time: 10 }] } : null);
    };

    const removeRate = (index: number) => {
        setSettings(prev => prev ? { ...prev, rates: prev.rates.filter((_, i) => i !== index) } : null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (settings) {
            onSave(settings);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 overflow-y-auto">
                        <h3 className="text-xl font-bold text-[--color-primary-500] dark:text-[--color-primary-400] mb-4">Settings for {device.name}</h3>
                        <div className="space-y-4">
                             <div>
                                <label htmlFor="deviceName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Device Name</label>
                                <input type="text" name="deviceName" id="deviceName" value={settings.deviceName} onChange={handleFieldChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <label htmlFor="portalUrl" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Portal URL</label>
                                <input type="text" name="portalUrl" id="portalUrl" value={settings.portalUrl} onChange={handleFieldChange} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Time Rates</h4>
                                <div className="space-y-2">
                                    {settings.rates.map((rate, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <input type="number" value={rate.credit} onChange={(e) => handleRateChange(index, 'credit', e.target.value)} className="w-1/3 bg-slate-100 dark:bg-slate-700 rounded-md p-2" placeholder="Credit" />
                                            <span className="text-slate-500">=</span>
                                            <input type="number" value={rate.time} onChange={(e) => handleRateChange(index, 'time', e.target.value)} className="w-1/3 bg-slate-100 dark:bg-slate-700 rounded-md p-2" placeholder="Minutes" />
                                            <span className="text-slate-500 text-xs">mins</span>
                                            <button type="button" onClick={() => removeRate(index)} className="p-2 text-slate-500 hover:text-red-500 rounded-md"><TrashIcon className="h-4 w-4" /></button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={addRate} className="mt-2 text-sm text-[--color-primary-600] hover:text-[--color-primary-500] font-semibold">Add Rate</button>
                            </div>
                        </div>
                    </div>
                     <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end space-x-3 rounded-b-lg">
                        <button type="button" onClick={onClose} disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[--color-primary-600] hover:bg-[--color-primary-500]">
                            {isLoading ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface NodeMcuManagerProps {
    hosts: HotspotHost[];
    selectedRouter: RouterConfigWithId | null;
}

export const NodeMcuManager: React.FC<NodeMcuManagerProps> = ({ hosts, selectedRouter }) => {
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    // FIX: Use the extended device type.
    const [selectedDevice, setSelectedDevice] = useState<NodeMcuDevice | null>(null);
    const [currentSettings, setCurrentSettings] = useState<NodeMcuSettings | null>(null);
    const [loadingAction, setLoadingAction] = useState<{deviceId: string, action: 'reboot' | 'settings'} | null>(null);
    const [deviceError, setDeviceError] = useState<string | null>(null);
    const [sessions, setSessions] = useState<Record<string, string | null>>({});


    const nodeMcuDevices: NodeMcuDevice[] = useMemo(() => {
        return hosts
            .filter(host => host.comment && /vendo|nodemcu|pisowifi/i.test(host.comment))
            .map(host => ({
                ...host,
                name: host.comment?.replace(/\[|\]/g, '').trim() || host.macAddress,
            }));
    }, [hosts]);

    const handleAction = async (device: NodeMcuDevice, action: 'reboot' | 'settings') => {
        setLoadingAction({ deviceId: device.id, action });
        setDeviceError(null);

        if (action === 'reboot' && !window.confirm(`Are you sure you want to reboot ${device.name}?`)) {
            setLoadingAction(null);
            return;
        }

        try {
            let sessionCookie = sessions[device.address];

            if (!sessionCookie) {
                const password = window.prompt(`Enter admin password for ${device.name}:`);
                if (password === null) {
                    setLoadingAction(null);
                    return;
                }
                const loginResult = await loginToDevice(device.address, password);
                if (!loginResult.cookie) throw new Error("Login failed, no cookie returned.");
                
                sessionCookie = loginResult.cookie;
                setSessions(prev => ({ ...prev, [device.address]: sessionCookie }));
            }

            if (action === 'reboot') {
                await rebootDevice(device.address, sessionCookie);
                alert(`${device.name} reboot command sent.`);
            }

            if (action === 'settings') {
                const settings = await getSettings(device.address, sessionCookie);
                setCurrentSettings(settings);
                setSelectedDevice(device);
                setIsSettingsModalOpen(true);
            }

        } catch (error) {
            const err = error as Error & { status?: number };
            const errorMessage = err.message.toLowerCase();
            if (err.status === 401 || errorMessage.includes('unauthorized') || errorMessage.includes('incorrect password')) {
                setDeviceError(`Session expired or password was incorrect. Please try again.`);
                setSessions(prev => ({ ...prev, [device.address]: null }));
            } else {
                setDeviceError(err.message);
            }
        } finally {
            setLoadingAction(null);
        }
    };

    const handleSaveSettings = async (newSettings: NodeMcuSettings) => {
        if (!selectedDevice) return;

        const sessionCookie = sessions[selectedDevice.address];
        if (!sessionCookie) {
            setDeviceError("Session not found. Please close this modal and try opening settings again.");
            return;
        }

        setLoadingAction({ deviceId: selectedDevice.id, action: 'settings' });
        setDeviceError(null);
        try {
            await saveSettings(selectedDevice.address, sessionCookie, newSettings);
            setIsSettingsModalOpen(false);
            alert('Settings saved successfully!');
        } catch(error) {
            const err = error as Error & { status?: number };
            const errorMessage = err.message.toLowerCase();
            if (err.status === 401 || errorMessage.includes('unauthorized')) {
                setDeviceError(`Session expired. Please close this modal and try again.`);
                setSessions(prev => ({ ...prev, [selectedDevice.address]: null }));
            } else {
                setDeviceError(err.message);
            }
        } finally {
            setLoadingAction(null);
        }
    };
    

    return (
        <div className="space-y-6">
            <NodeMcuSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                onSave={handleSaveSettings}
                device={selectedDevice}
                initialSettings={currentSettings}
                isLoading={loadingAction?.action === 'settings' && loadingAction?.deviceId === selectedDevice?.id}
            />

            {deviceError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-300 flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold">Device Error</h4>
                        <p>{deviceError}</p>
                    </div>
                    <button onClick={() => setDeviceError(null)} className="ml-auto text-red-500">&times;</button>
                </div>
            )}
            
            <div className="p-4 bg-blue-50 dark:bg-slate-900/50 border border-blue-200 dark:border-slate-700 rounded-lg text-sm text-blue-800 dark:text-slate-400 flex items-start gap-3">
                 <ExclamationTriangleIcon className="w-8 h-8 text-blue-500 dark:text-yellow-400 flex-shrink-0" />
                 <div>
                    <h4 className="font-bold text-blue-900 dark:text-slate-200">How to add a NodeMCU device:</h4>
                    <p>This panel identifies NodeMCU/PisoWiFi devices by looking for specific keywords in the <span className="font-mono text-cyan-600 dark:text-cyan-400">Comment</span> field of an entry in your router's <span className="font-mono text-cyan-600 dark:text-cyan-400">IP &gt; Hotspot &gt; Hosts</span> list. To make a device appear here, add a comment containing <span className="font-mono text-orange-500 dark:text-orange-400">"vendo"</span>, <span className="font-mono text-orange-500 dark:text-orange-400">"nodemcu"</span>, or <span className="font-mono text-orange-500 dark:text-orange-400">"pisowifi"</span>.</p>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Device Name</th>
                                <th scope="col" className="px-6 py-3">IP Address</th>
                                <th scope="col" className="px-6 py-3">MAC Address</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {nodeMcuDevices.length > 0 ? nodeMcuDevices.map(device => {
                                const isRebooting = loadingAction?.deviceId === device.id && loadingAction.action === 'reboot';
                                const isOpeningSettings = loadingAction?.deviceId === device.id && loadingAction.action === 'settings';

                                return (
                                <tr key={device.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                        <ChipIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                                        {device.name}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{device.address}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{device.macAddress}</td>
                                    <td className="px-6 py-4">
                                        {device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400">Bypassed</span>}
                                        {device.authorized && !device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Authorized</span>}
                                        {!device.authorized && !device.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600/50 text-slate-600 dark:text-slate-400">Guest</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleAction(device, 'reboot')} disabled={!!loadingAction} className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-slate-700 dark:text-white w-20 text-center">
                                            {isRebooting ? <Loader /> : 'Reboot'}
                                        </button>
                                        <button onClick={() => handleAction(device, 'settings')} disabled={!!loadingAction} className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-md font-semibold text-slate-700 dark:text-white w-20 text-center">
                                            {isOpeningSettings ? <Loader /> : 'Settings'}
                                        </button>
                                    </td>
                                </tr>
                            )}) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-slate-500">
                                        No NodeMCU devices found.
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