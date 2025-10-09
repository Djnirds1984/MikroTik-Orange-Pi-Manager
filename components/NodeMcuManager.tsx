import React, { useState } from 'react';
import type { NodeMcuSettings } from '../types.ts';
import { getNodeMcuSettings, saveNodeMcuSettings, generateNodeMcuApiKey } from '../services/nodeMcuService.ts';
import { ChipIcon, KeyIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
);

export const NodeMcuManager: React.FC = () => {
    const [deviceIp, setDeviceIp] = useState('');
    const [currentApiKey, setCurrentApiKey] = useState('');
    const [settings, setSettings] = useState<NodeMcuSettings | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);

    const handleConnect = async () => {
        if (!deviceIp || !currentApiKey) return;
        setIsLoading(true);
        setError(null);
        setStatusMessage(null);
        try {
            const data = await getNodeMcuSettings(deviceIp, currentApiKey);
            setSettings(data);
            setIsConnected(true);
        } catch (err) {
            setError((err as Error).message);
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDisconnect = () => {
        setIsConnected(false);
        setSettings(null);
        setError(null);
        setStatusMessage(null);
    };

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        setError(null);
        setStatusMessage(null);
        try {
            const dataToSave = {
                api_key: settings.api_key,
                auto_restart_minutes: Number(settings.auto_restart_minutes),
                a0_button_function: settings.a0_button_function
            };
            await saveNodeMcuSettings(deviceIp, currentApiKey, dataToSave);
            setStatusMessage("Settings saved successfully!");
            // If the API key was changed, we must update the key used for subsequent requests
            if (currentApiKey !== settings.api_key) {
                setCurrentApiKey(settings.api_key);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleGenerateKey = async () => {
        if (!settings || !window.confirm("Are you sure? This will generate a new API key. The current key will no longer work.")) return;
        setIsSaving(true);
        setError(null);
        setStatusMessage(null);
        try {
            const response = await generateNodeMcuApiKey(deviceIp, currentApiKey);
            const newKey = response.new_api_key;
            setSettings(s => s ? { ...s, api_key: newKey } : null);
            setCurrentApiKey(newKey); // IMPORTANT: Update the key for future requests
            setStatusMessage("New API key generated. Make sure to use this new key for future connections.");
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCopyKey = () => {
        if (settings?.api_key) {
            navigator.clipboard.writeText(settings.api_key);
            alert("API Key copied to clipboard!");
        }
    };

    if (isConnected && settings) {
        return (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md max-w-2xl mx-auto">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Vendo Machine Configuration</h3>
                        <p className="text-sm font-mono text-cyan-600 dark:text-cyan-400">{deviceIp}</p>
                    </div>
                    <button onClick={handleDisconnect} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm">Disconnect</button>
                </div>
                <div className="p-6 space-y-4">
                     {error && <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
                    {statusMessage && <div className="p-3 bg-green-50 text-green-700 rounded-md text-sm">{statusMessage}</div>}

                    <div>
                        <label htmlFor="api_key" className="block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                        <div className="relative mt-1">
                            <input type={showApiKey ? 'text' : 'password'} id="api_key" value={settings.api_key} onChange={e => setSettings(s => s ? { ...s, api_key: e.target.value } : null)} className="w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3 pr-20" />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5">
                                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="text-slate-500 hover:text-slate-700">{showApiKey ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}</button>
                                <button type="button" onClick={handleCopyKey} className="text-slate-500 hover:text-slate-700 ml-2"><CopyIcon className="h-5 w-5"/></button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="auto_restart_minutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Auto Restart Schedule (Minutes)</label>
                        <input type="number" id="auto_restart_minutes" value={settings.auto_restart_minutes} onChange={e => setSettings(s => s ? { ...s, auto_restart_minutes: Number(e.target.value) } : null)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3" />
                    </div>
                    <div>
                        <label htmlFor="a0_button_function" className="block text-sm font-medium text-slate-700 dark:text-slate-300">A0+3v Button Function</label>
                        <select id="a0_button_function" value={settings.a0_button_function} onChange={e => setSettings(s => s ? { ...s, a0_button_function: e.target.value } : null)} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 rounded-md py-2 px-3">
                            <option value="disable">Disable</option>
                            <option value="coin_slot">Coin Slot</option>
                            <option value="e_load">E-Load</option>
                            {/* Add other options if they exist */}
                        </select>
                    </div>
                </div>
                 <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 flex flex-col-reverse sm:flex-row justify-between items-center gap-4 rounded-b-lg">
                    <button onClick={handleGenerateKey} disabled={isSaving} className="w-full sm:w-auto px-4 py-2 text-sm text-white bg-amber-600 hover:bg-amber-700 font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                        <KeyIcon className="w-4 h-4" />
                        Generate New Key
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto px-6 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold rounded-lg flex items-center justify-center disabled:opacity-50">
                        {isSaving && <Loader />}
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md max-w-lg mx-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
                 <ChipIcon className="w-6 h-6 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                 <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">Connect to Vendo Machine</h3>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleConnect(); }} className="p-6 space-y-4">
                 {error && <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-300">{error}</div>}
                <div>
                    <label htmlFor="deviceIp" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Device IP Address</label>
                    <input type="text" id="deviceIp" value={deviceIp} onChange={e => setDeviceIp(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" placeholder="e.g., 10.0.0.207" />
                </div>
                 <div>
                    <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                    <input type="password" id="apiKey" value={currentApiKey} onChange={e => setCurrentApiKey(e.target.value)} required className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                </div>
                 <div className="pt-2">
                    <button type="submit" disabled={isLoading} className="w-full bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50">
                        {isLoading ? <Loader /> : 'Connect'}
                    </button>
                </div>
            </form>
        </div>
    );
};