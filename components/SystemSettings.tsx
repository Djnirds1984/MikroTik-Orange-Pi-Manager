
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, NtpSettings, PanelSettings } from '../types.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { initializeAiClient } from '../services/geminiService.ts';
import { getRouterNtp, setRouterNtp, rebootRouter } from '../services/mikrotikService.ts';
import { getPanelSettings, savePanelSettings } from '../services/databaseService.ts';
import { createDatabaseBackup, listDatabaseBackups, deleteDatabaseBackup } from '../services/panelService.ts';
import { Loader } from './Loader.tsx';
import { KeyIcon, CogIcon, PowerIcon, RouterIcon, CircleStackIcon, ArrowPathIcon, TrashIcon } from '../constants.tsx';

// A generic settings card component
const SettingsCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; }> = ({ title, icon, children }) => (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            {icon}
            <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">{title}</h3>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

// --- Sub-components for System Settings ---
const NtpManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [ntpSettings, setNtpSettings] = useState<NtpSettings>({ enabled: false, primaryNtp: '', secondaryNtp: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        getRouterNtp(selectedRouter)
            .then(setNtpSettings)
            .catch(err => {
                console.error("Failed to fetch NTP settings:", err);
                setError(`Could not fetch NTP settings. Error: ${(err as Error).message}`);
            })
            .finally(() => setIsLoading(false));
    }, [selectedRouter]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setRouterNtp(selectedRouter, ntpSettings);
            alert('NTP settings saved successfully!');
        } catch (err) {
            alert(`Failed to save NTP settings: ${(err as Error).message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex justify-center"><Loader /></div>;
    if (error) return <p className="text-red-500">{error}</p>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label htmlFor="ntp-enabled" className="font-medium text-slate-700 dark:text-slate-300">Enable NTP Client</label>
                <input
                    type="checkbox"
                    id="ntp-enabled"
                    checked={ntpSettings.enabled}
                    onChange={e => setNtpSettings(s => ({ ...s, enabled: e.target.checked }))}
                    className="h-6 w-6 rounded border-gray-300 text-[--color-primary-600] focus:ring-[--color-primary-500]"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="primaryNtp" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Primary NTP Server</label>
                    <input type="text" name="primaryNtp" id="primaryNtp" value={ntpSettings.primaryNtp} onChange={e => setNtpSettings(s => ({ ...s, primaryNtp: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                </div>
                <div>
                    <label htmlFor="secondaryNtp" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Secondary NTP Server</label>
                    <input type="text" name="secondaryNtp" id="secondaryNtp" value={ntpSettings.secondaryNtp} onChange={e => setNtpSettings(s => ({ ...s, secondaryNtp: e.target.value }))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                </div>
            </div>
            <div className="flex justify-end">
                <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-semibold rounded-lg disabled:opacity-50">
                    {isSaving ? 'Saving...' : 'Save NTP Settings'}
                </button>
            </div>
        </div>
    );
};

const DatabaseManager: React.FC = () => {
    const [backups, setBackups] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActioning, setIsActioning] = useState<string | null>(null); // 'create', 'delete-filename', 'restore-filename'
    const [restoreLogs, setRestoreLogs] = useState<string[]>([]);

    const fetchBackups = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await listDatabaseBackups();
            setBackups(data.filter(f => f.endsWith('.sqlite')));
        } catch (error) {
            console.error("Failed to list backups:", error);
            alert(`Error: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBackups();
    }, [fetchBackups]);

    const handleCreateBackup = async () => {
        setIsActioning('create');
        try {
            const result = await createDatabaseBackup();
            alert(result.message);
            await fetchBackups();
        } catch (error) {
            alert(`Failed to create backup: ${(error as Error).message}`);
        } finally {
            setIsActioning(null);
        }
    };

    const handleDeleteBackup = async (filename: string) => {
        if (!window.confirm(`Are you sure you want to permanently delete backup "${filename}"?`)) return;
        setIsActioning(`delete-${filename}`);
        try {
            await deleteDatabaseBackup(filename);
            await fetchBackups();
        } catch (error) {
            alert(`Failed to delete backup: ${(error as Error).message}`);
        } finally {
            setIsActioning(null);
        }
    };

    const handleRestore = (filename: string) => {
        if (!window.confirm(`Are you sure you want to restore from "${filename}"? This will overwrite all current panel data.`)) return;
        
        setIsActioning(`restore-${filename}`);
        setRestoreLogs([]);

        const eventSource = new EventSource(`/api/restore-backup?backupFile=${encodeURIComponent(filename)}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.log) setRestoreLogs(prev => [...prev, data.log]);
            if (data.status === 'restarting') {
                alert('Restore successful! The panel is restarting. The page will reload in a few seconds.');
                setTimeout(() => window.location.reload(), 8000);
                eventSource.close();
            }
            if (data.status === 'error') {
                alert(`Restore failed: ${data.message}`);
                setIsActioning(null);
                eventSource.close();
            }
        };

        eventSource.onerror = () => {
            alert('Connection lost during restore process.');
            setIsActioning(null);
            eventSource.close();
        };
    };

    const handleDownload = (filename: string) => {
        const a = document.createElement('a');
        a.href = `/download-backup/${filename}`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="space-y-4">
            <button onClick={handleCreateBackup} disabled={!!isActioning} className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {isActioning === 'create' ? <Loader /> : <CircleStackIcon className="w-5 h-5" />}
                {isActioning === 'create' ? 'Backing up...' : 'Create New Backup'}
            </button>
            <div className="pt-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Available Backups</h4>
                {isLoading ? <div className="flex justify-center"><Loader/></div> :
                 backups.length > 0 ? (
                    <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                        {backups.map(backup => (
                            <li key={backup} className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-md flex justify-between items-center">
                                <span className="font-mono text-sm text-slate-800 dark:text-slate-300 truncate mr-4">{backup}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button onClick={() => handleRestore(backup)} disabled={!!isActioning} className="p-2 text-slate-500 hover:text-sky-500 disabled:opacity-50" title="Restore"><ArrowPathIcon className="h-5 w-5"/></button>
                                    <button onClick={() => handleDownload(backup)} className="p-2 text-slate-500 hover:text-green-500" title="Download"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></button>
                                    <button onClick={() => handleDeleteBackup(backup)} disabled={!!isActioning} className="p-2 text-slate-500 hover:text-red-500 disabled:opacity-50" title="Delete">
                                        {isActioning === `delete-${backup}` ? <Loader/> : <TrashIcon className="h-5 w-5"/>}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                 ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">No database backups found.</p>
                 )
                }
            </div>
            {isActioning?.startsWith('restore-') && (
                <div className="mt-4">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Restoring...</h4>
                    <div className="bg-slate-900 text-slate-300 font-mono text-xs p-4 rounded-md h-48 overflow-y-auto">
                        {restoreLogs.map((log, i) => <pre key={i} className="whitespace-pre-wrap">{log}</pre>)}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- Main Component ---
export const SystemSettings: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const { language, currency, setLanguage, setCurrency } = useLocalization();
    const [apiKey, setApiKey] = useState('');
    const [isKeySaving, setIsKeySaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await getPanelSettings() as any;
                if (settings?.geminiApiKey) {
                    setApiKey(settings.geminiApiKey);
                }
            } catch (error) {
                console.error("Could not load API key:", error);
            }
        };
        loadSettings();
    }, []);

    const handleSaveApiKey = async () => {
        setIsKeySaving(true);
        try {
            const currentSettings = await getPanelSettings() as PanelSettings;
            const newSettings: any = { ...currentSettings, geminiApiKey: apiKey };
            await savePanelSettings(newSettings);
            initializeAiClient(apiKey);
            alert('Gemini API Key saved successfully!');
        } catch (error) {
            alert(`Failed to save API Key: ${(error as Error).message}`);
        } finally {
            setIsKeySaving(false);
        }
    };

    const handleReboot = async () => {
        if (!selectedRouter) return;
        if (window.confirm(`Are you sure you want to reboot the router "${selectedRouter.name}"?`)) {
            try {
                const res = await rebootRouter(selectedRouter);
                alert(res.message);
            } catch (err) {
                alert(`Failed to send reboot command: ${(err as Error).message}`);
            }
        }
    };
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsCard title="Panel Settings" icon={<CogIcon className="w-6 h-6" />}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="language" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Language</label>
                            <select id="language" value={language} onChange={e => setLanguage(e.target.value as 'en' | 'fil')} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                <option value="en">English</option>
                                <option value="fil">Filipino</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="currency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Currency</label>
                            <select id="currency" value={currency} onChange={e => setCurrency(e.target.value as 'USD' | 'PHP')} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                <option value="USD">USD ($)</option>
                                <option value="PHP">PHP (₱)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard title="Database Management" icon={<CircleStackIcon className="w-6 h-6" />}>
                <DatabaseManager />
            </SettingsCard>
            
            <SettingsCard title="AI Settings" icon={<KeyIcon className="w-6 h-6" />}>
                <div className="space-y-2">
                    <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Google Gemini API Key</label>
                    <input type="password" name="apiKey" id="apiKey" value={apiKey} onChange={e => setApiKey(e.target.value)} className="block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white" />
                    <p className="text-xs text-slate-500">Your key is stored locally in the panel's database and is not shared.</p>
                </div>
                <div className="flex justify-end mt-4">
                    <button onClick={handleSaveApiKey} disabled={isKeySaving} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-semibold rounded-lg disabled:opacity-50">
                        {isKeySaving ? 'Saving...' : 'Save API Key'}
                    </button>
                </div>
            </SettingsCard>

            {selectedRouter ? (
                 <SettingsCard title={`Router Management (${selectedRouter.name})`} icon={<RouterIcon className="w-6 h-6" />}>
                     <div className="space-y-6">
                        <div>
                            <h4 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-2">NTP Client</h4>
                            <NtpManager selectedRouter={selectedRouter} />
                        </div>
                        <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                             <h4 className="font-semibold text-lg text-slate-800 dark:text-slate-200 mb-2">Power Actions</h4>
                            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
                                <div>
                                    <p className="font-semibold text-red-800 dark:text-red-300">Reboot Router</p>
                                    <p className="text-sm text-red-600 dark:text-red-400">This will immediately restart the selected router.</p>
                                </div>
                                <button onClick={handleReboot} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center gap-2">
                                    <PowerIcon className="w-5 h-5" />
                                    Reboot
                                </button>
                            </div>
                        </div>
                     </div>
                 </SettingsCard>
            ) : (
                <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-500 dark:text-slate-400">Select a router to manage its system settings.</p>
                </div>
            )}
        </div>
    );
};
