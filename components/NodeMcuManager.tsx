import React, { useState, useEffect, useCallback } from 'react';
import type { NodeMcuDevice, NodeMcuSettings } from '../types.ts';
import { dbApi } from '../services/databaseService.ts';
import { loginToDevice, getNodeMcuSettings, saveNodeMcuSettings, rebootNodeMcu } from '../services/nodeMcuService.ts';
import { Loader } from './Loader.tsx';
import { ChipIcon, EditIcon, TrashIcon, PowerIcon } from '../constants.tsx';

// --- Device Form Modal ---
interface DeviceFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (device: NodeMcuDevice | Omit<NodeMcuDevice, 'id'>) => void;
    initialData: NodeMcuDevice | null;
}
const DeviceFormModal: React.FC<DeviceFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [device, setDevice] = useState({ name: '', ip: '', username: '', password: '' });

    useEffect(() => {
        if (isOpen) {
            setDevice(initialData ? { ...initialData, password: '' } : { name: '', ip: '', username: 'admin', password: '' });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDevice(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const dataToSave = { ...device };
        if (initialData && !device.password) {
            // @ts-ignore
            dataToSave.password = initialData.password;
        }
        onSave(initialData ? { ...initialData, ...dataToSave } : dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        <h3 className="text-xl font-bold text-[--color-primary-500]">{initialData ? 'Edit Device' : 'Add New Device'}</h3>
                        <div><label className="block text-sm">Name</label><input type="text" name="name" value={device.name} onChange={handleChange} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                        <div><label className="block text-sm">IP Address</label><input type="text" name="ip" value={device.ip} onChange={handleChange} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                        <div><label className="block text-sm">Username</label><input type="text" name="username" value={device.username} onChange={handleChange} required className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                        <div><label className="block text-sm">Password</label><input type="password" name="password" value={device.password} onChange={handleChange} placeholder={initialData ? "Leave blank to keep existing" : ""} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save</button></div>
                </form>
            </div>
        </div>
    );
};

// --- Login Modal ---
interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (password: string) => void;
    device: NodeMcuDevice;
    isLoading: boolean;
    error: string | null;
}
const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin, device, isLoading, error }) => {
    const [password, setPassword] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm">
                <form onSubmit={e => { e.preventDefault(); onLogin(password); }}>
                    <div className="p-6 space-y-4">
                        <h3 className="text-xl font-bold">Login to {device.name}</h3>
                        {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}
                        <div><label>Username</label><input value={device.username} disabled className="mt-1 w-full p-2 bg-slate-200 dark:bg-slate-700 rounded-md" /></div>
                        <div><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose} disabled={isLoading}>Cancel</button><button type="submit" disabled={isLoading}>{isLoading ? 'Logging in...' : 'Login'}</button></div>
                </form>
            </div>
        </div>
    );
};

// --- Main Manager ---
export const NodeMcuManager: React.FC = () => {
    // Device list state
    const [devices, setDevices] = useState<NodeMcuDevice[]>([]);
    const [isLoadingDevices, setIsLoadingDevices] = useState(true);
    const [isDeviceFormOpen, setIsDeviceFormOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<NodeMcuDevice | null>(null);

    // Active session state
    const [connectedDevice, setConnectedDevice] = useState<NodeMcuDevice | null>(null);
    const [sessionCookie, setSessionCookie] = useState<string | null>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [loginTarget, setLoginTarget] = useState<NodeMcuDevice | null>(null);

    // Settings state
    const [settings, setSettings] = useState<NodeMcuSettings | null>(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    
    const fetchDevices = useCallback(async () => {
        setIsLoadingDevices(true);
        try {
            const data = await dbApi.get<NodeMcuDevice[]>('/nodemcu-devices');
            setDevices(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingDevices(false);
        }
    }, []);

    useEffect(() => { fetchDevices(); }, [fetchDevices]);

    const handleSaveDevice = async (deviceData: NodeMcuDevice | Omit<NodeMcuDevice, 'id'>) => {
        try {
            if ('id' in deviceData) {
                await dbApi.patch(`/nodemcu-devices/${deviceData.id}`, deviceData);
            } else {
                const newDevice = { ...deviceData, id: `nodemcu_${Date.now()}` };
                await dbApi.post('/nodemcu-devices', newDevice);
            }
            setIsDeviceFormOpen(false);
            await fetchDevices();
        } catch (err) { alert(`Error: ${(err as Error).message}`); }
    };

    const handleDeleteDevice = async (deviceId: string) => {
        if (window.confirm("Are you sure?")) {
            await dbApi.delete(`/nodemcu-devices/${deviceId}`);
            await fetchDevices();
        }
    };

    const handleLogin = async (password: string) => {
        if (!loginTarget) return;
        setIsLoggingIn(true);
        setLoginError(null);
        try {
            const { cookie } = await loginToDevice(loginTarget.ip, loginTarget.username, password);
            setSessionCookie(cookie);
            setConnectedDevice(loginTarget);
            setLoginTarget(null); // Close login modal
        } catch (err) {
            setLoginError((err as Error).message);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleDisconnect = () => {
        setConnectedDevice(null);
        setSessionCookie(null);
        setSettings(null);
        setSettingsError(null);
    };
    
    const handleReboot = async () => {
        if (!connectedDevice || !sessionCookie || !window.confirm("Are you sure you want to reboot this device?")) return;
        setIsSaving(true);
        setSettingsError(null);
        setStatusMessage("Sending reboot command...");
        try {
            await rebootNodeMcu(connectedDevice.ip, sessionCookie);
            setStatusMessage("Reboot command sent. The device will disconnect.");
            setTimeout(handleDisconnect, 3000);
        } catch(err) {
            setSettingsError((err as Error).message);
            setStatusMessage(null);
        } finally {
            setIsSaving(false);
        }
    }

    const handleSaveSettings = async () => {
        if (!connectedDevice || !sessionCookie || !settings) return;
        setIsSaving(true);
        setSettingsError(null);
        setStatusMessage(null);
        try {
            const dataToSave = {
                api_key: settings.api_key, // The form field is named api_key in firmware
                auto_restart_minutes: Number(settings.auto_restart_minutes),
                a0_button_function: settings.a0_button_function
            };
            await saveNodeMcuSettings(connectedDevice.ip, sessionCookie, dataToSave);
            setStatusMessage("Settings saved successfully!");
        } catch (err) {
            setSettingsError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };
    
    // Fetch settings when connection is established
    useEffect(() => {
        if (connectedDevice && sessionCookie) {
            setIsLoadingSettings(true);
            setSettingsError(null);
            getNodeMcuSettings(connectedDevice.ip, sessionCookie)
                .then(setSettings)
                .catch(err => setSettingsError((err as Error).message))
                .finally(() => setIsLoadingSettings(false));
        }
    }, [connectedDevice, sessionCookie]);

    // --- RENDER LOGIC ---

    if (connectedDevice && sessionCookie) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md max-w-2xl mx-auto">
                <div className="p-4 border-b flex justify-between items-center">
                    <div><h3>Configuration for {connectedDevice.name}</h3><p className="text-sm font-mono text-cyan-500">{connectedDevice.ip}</p></div>
                    <button onClick={handleDisconnect} className="px-4 py-2 bg-red-600 text-white rounded-lg">Disconnect</button>
                </div>
                {isLoadingSettings && <div className="p-8 flex justify-center"><Loader/></div>}
                {settingsError && <div className="p-4 m-4 bg-red-100 text-red-700 rounded">{settingsError}</div>}
                {settings && (
                    <>
                        <div className="p-6 space-y-4">
                            {statusMessage && <div className="p-2 bg-green-100 text-green-700 rounded">{statusMessage}</div>}
                            <div><label>Vendo API Key</label><input type="text" value={settings.api_key} onChange={e => setSettings(s => s ? { ...s, api_key: e.target.value } : null)} className="w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>Auto Restart (Minutes)</label><input type="number" value={settings.auto_restart_minutes} onChange={e => setSettings(s => s ? { ...s, auto_restart_minutes: Number(e.target.value) } : null)} className="w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md" /></div>
                            <div><label>A0+3v Button Function</label><select value={settings.a0_button_function} onChange={e => setSettings(s => s ? { ...s, a0_button_function: e.target.value } : null)} className="w-full p-2 bg-slate-100 dark:bg-slate-700 rounded-md"><option value="disable">Disable</option><option value="coin_slot">Coin Slot</option></select></div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 flex justify-between items-center">
                             <button onClick={handleReboot} disabled={isSaving} className="px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50"><PowerIcon className="w-5 h-5"/> Reboot Device</button>
                             <button onClick={handleSaveSettings} disabled={isSaving} className="px-6 py-2 bg-[--color-primary-600] text-white font-bold rounded-lg disabled:opacity-50">{isSaving ? 'Saving...' : 'Save Settings'}</button>
                        </div>
                    </>
                )}
            </div>
        );
    }
    
    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md max-w-2xl mx-auto">
            <DeviceFormModal isOpen={isDeviceFormOpen} onClose={() => setIsDeviceFormOpen(false)} onSave={handleSaveDevice} initialData={editingDevice} />
            <LoginModal isOpen={!!loginTarget} onClose={() => setLoginTarget(null)} onLogin={handleLogin} device={loginTarget!} isLoading={isLoggingIn} error={loginError} />

            <div className="p-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-semibold flex items-center gap-2"><ChipIcon className="w-6 h-6 text-[--color-primary-500]"/> Vendo Machines</h3>
                <button onClick={() => { setEditingDevice(null); setIsDeviceFormOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add Device</button>
            </div>
            {isLoadingDevices ? <div className="p-8 flex justify-center"><Loader /></div> : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {devices.map(device => (
                        <li key={device.id} className="p-4 flex justify-between items-center">
                            <div><p className="font-semibold">{device.name}</p><p className="text-sm text-slate-500 font-mono">{device.ip}</p></div>
                            <div className="flex gap-2">
                                <button onClick={() => setLoginTarget(device)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-md">Connect</button>
                                <button onClick={() => { setEditingDevice(device); setIsDeviceFormOpen(true); }} className="p-2"><EditIcon className="w-5 h-5"/></button>
                                <button onClick={() => handleDeleteDevice(device.id)} className="p-2"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
