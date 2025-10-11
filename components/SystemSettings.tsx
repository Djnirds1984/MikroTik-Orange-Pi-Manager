
import React, { useState, useEffect } from 'react';
import type { RouterConfigWithId, PanelHostStatus, PanelNtpStatus } from '../types.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { savePanelSettings } from '../services/databaseService.ts';
import { getPanelHostStatus, getPanelNtpStatus, togglePanelNtp, createDatabaseBackup, listDatabaseBackups, deleteDatabaseBackup } from '../services/panelService.ts';
import { Loader } from './Loader.tsx';
import { initializeAiClient } from '../services/geminiService.ts';
import { CogIcon, ServerIcon, KeyIcon, TrashIcon } from '../constants.tsx';

// Panel Settings Component
const GeneralSettings: React.FC = () => {
    const { language, currency, setLanguage, setCurrency, t } = useLocalization();
    const [apiKey, setApiKey] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    useEffect(() => {
        const savedKey = localStorage.getItem('geminiApiKey') || '';
        setApiKey(savedKey);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setStatusMessage('');
        try {
            await savePanelSettings({ language, currency });
            localStorage.setItem('geminiApiKey', apiKey);
            initializeAiClient(apiKey);
            setStatusMessage('Settings saved successfully!');
            setTimeout(() => setStatusMessage(''), 3000);
        } catch (err) {
            setStatusMessage(`Error: ${(err as Error).message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b flex items-center gap-3"><CogIcon className="w-6 h-6 text-[--color-primary-500]"/><h3 className="text-lg font-semibold">Panel Settings</h3></div>
            <form onSubmit={handleSave}>
                <div className="p-6 space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium">Language</label><select value={language} onChange={e => setLanguage(e.target.value as any)} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"><option value="en">English</option><option value="es">Español</option><option value="fil">Filipino</option></select></div>
                        <div><label className="block text-sm font-medium">Currency</label><select value={currency} onChange={e => setCurrency(e.target.value as any)} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"><option value="USD">USD</option><option value="EUR">EUR</option><option value="PHP">PHP</option></select></div>
                    </div>
                     <div><label className="block text-sm font-medium flex items-center gap-2"><KeyIcon className="w-4 h-4"/> Gemini API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700" placeholder="Paste your key here"/></div>
                     {statusMessage && <p className="text-sm text-green-600">{statusMessage}</p>}
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end"><button type="submit" disabled={isSaving} className="px-4 py-2 bg-[--color-primary-600] text-white font-bold rounded-lg">{isSaving ? 'Saving...' : 'Save Settings'}</button></div>
            </form>
        </div>
    );
};

// Host Status Component
const HostStatus: React.FC = () => {
    const [hostStatus, setHostStatus] = useState<PanelHostStatus | null>(null);
    const [ntpStatus, setNtpStatus] = useState<PanelNtpStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [host, ntp] = await Promise.all([getPanelHostStatus(), getPanelNtpStatus()]);
                setHostStatus(host);
                setNtpStatus(ntp);
            } catch (error) {
                console.error("Failed to fetch host status:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleNtpToggle = async () => {
        if (!ntpStatus) return;
        try {
            await togglePanelNtp(!ntpStatus.enabled);
            const newStatus = await getPanelNtpStatus();
            setNtpStatus(newStatus);
        } catch (error) {
            alert(`Error toggling NTP: ${(error as Error).message}`);
        }
    };

    if (isLoading) return <Loader />;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
             <div className="p-4 border-b flex items-center gap-3"><ServerIcon className="w-6 h-6 text-[--color-primary-500]"/><h3 className="text-lg font-semibold">Host System Status</h3></div>
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div><span className="font-semibold">CPU Usage:</span> {hostStatus?.cpuUsage.toFixed(2)}%</div>
                <div><span className="font-semibold">Memory:</span> {hostStatus?.memory.used} / {hostStatus?.memory.total} ({hostStatus?.memory.percent.toFixed(1)}%)</div>
                <div><span className="font-semibold">Disk:</span> {hostStatus?.disk.used} / {hostStatus?.disk.total} ({hostStatus?.disk.percent}%)</div>
                <div><span className="font-semibold">NTP Sync:</span> {ntpStatus?.synchronized ? 'Yes' : 'No'}</div>
                <div><span className="font-semibold">System Time:</span> {ntpStatus?.time} ({ntpStatus?.timezone})</div>
             </div>
        </div>
    );
};


export const SystemSettings: React.FC<{ selectedRouter: RouterConfigWithId | null }> = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <GeneralSettings />
            <HostStatus />
        </div>
    );
};
