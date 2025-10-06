import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId, NtpSettings, PanelSettings } from '../types.ts';
import { getRouterNtp, rebootRouter, setRouterNtp as setRouterNtpService } from '../services/mikrotikService.ts';
import { getPanelNtp, rebootPanel, setPanelNtp as setPanelNtpService, getGeminiKey, setGeminiKey } from '../services/panelService.ts';
import { initializeAiClient } from '../services/geminiService.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { useTheme } from '../contexts/ThemeContext.tsx';
import { Loader } from './Loader.tsx';
import { RouterIcon, ServerIcon, PowerIcon, ExclamationTriangleIcon, CogIcon, CircleStackIcon, ArrowPathIcon, KeyIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';

const SettingsCard: React.FC<{ title: string; children: React.ReactNode; icon: React.ReactNode }> = ({ title, children, icon }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
      {icon}
      <h3 className="text-lg font-semibold text-orange-500 dark:text-orange-400">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const LogViewer: React.FC<{ logs: string[] }> = ({ logs }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div ref={logContainerRef} className="bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-300 p-4 rounded-md h-64 overflow-y-auto border border-slate-200 dark:border-slate-600">
            {logs.map((log, index) => (
                <pre key={index} className="whitespace-pre-wrap break-words">{log}</pre>
            ))}
        </div>
    );
};

const NtpInfo: React.FC<{ title: string; settings: NtpSettings | null; error: string | null }> = ({ title, settings, error }) => (
    <div>
        <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2">{title}</h4>
        {error ? (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        ) : !settings ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading...</p>
        ) : (
            <div className="text-sm space-y-1 font-mono text-slate-600 dark:text-slate-300">
                <p>Status: <span className={settings.enabled ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>{settings.enabled ? 'Enabled' : 'Disabled'}</span></p>
                <p>Primary: <span className="text-cyan-600 dark:text-cyan-300">{settings.primaryNtp || 'Not Set'}</span></p>
                <p>Secondary: <span className="text-cyan-600 dark:text-cyan-300">{settings.secondaryNtp || 'Not Set'}</span></p>
            </div>
        )}
    </div>
);


export const SystemSettings: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const { t, language, currency, setLanguage, setCurrency } = useLocalization();
    const { theme, setTheme } = useTheme();

    const [panelNtp, setPanelNtp] = useState<NtpSettings | null>(null);
    const [routerNtp, setRouterNtp] = useState<NtpSettings | null>(null);
    const [formNtp, setFormNtp] = useState({ primaryNtp: '', secondaryNtp: '' });
    const [apiKey, setApiKey] = useState('');
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [keyStatus, setKeyStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [localizationStatus, setLocalizationStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);


    const [isLoading, setIsLoading] = useState({ panel: true, router: true, key: true });
    const [isSubmitting, setIsSubmitting] = useState<'panel' | 'router' | 'both' | 'key' | 'localization' | null>(null);
    const [errors, setErrors] = useState<{ panel: string | null, router: string | null, key: string | null }>({ panel: null, router: null, key: null });
    
    const [activeOperation, setActiveOperation] = useState<'install' | 'restart' | null>(null);
    const [maintenanceLogs, setMaintenanceLogs] = useState<string[]>([]);
    const [operationStatus, setOperationStatus] = useState<'running' | 'success' | 'error' | null>(null);


    const fetchData = useCallback(async () => {
        setIsLoading(prev => ({ ...prev, panel: true, router: true, key: true }));
        setErrors({ panel: null, router: null, key: null });

        getGeminiKey()
            .then(data => setApiKey(data.apiKey))
            .catch(err => setErrors(prev => ({ ...prev, key: err.message })))
            .finally(() => setIsLoading(prev => ({...prev, key: false})));

        getPanelNtp()
            .then(data => {
                setPanelNtp(data);
                setFormNtp(prev => ({ ...prev, primaryNtp: data.primaryNtp, secondaryNtp: data.secondaryNtp }));
            })
            .catch(err => setErrors(prev => ({ ...prev, panel: err.message })))
            .finally(() => setIsLoading(prev => ({ ...prev, panel: false })));

        if (selectedRouter) {
            getRouterNtp(selectedRouter)
                .then(data => setRouterNtp(data))
                .catch(err => setErrors(prev => ({ ...prev, router: err.message })))
                .finally(() => setIsLoading(prev => ({ ...prev, router: false })));
        } else {
            setIsLoading(prev => ({ ...prev, router: false }));
            setRouterNtp(null);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRebootPanel = () => {
        if (window.confirm("Are you sure you want to reboot the panel server? You will be disconnected.")) {
            rebootPanel()
                .then(res => alert(res.message))
                .catch(err => alert(`Error: ${err.message}`));
        }
    };

    const handleRebootRouter = () => {
        if (!selectedRouter) return;
        if (window.confirm(`Are you sure you want to reboot the router "${selectedRouter.name}"?`)) {
            rebootRouter(selectedRouter)
                .then(res => alert(res.message))
                .catch(err => alert(`Error: ${err.message}`));
        }
    };
    
    const handleApplyNtp = async (target: 'panel' | 'router' | 'both') => {
        setIsSubmitting(target);
        const settingsToApply = {
            ...formNtp,
            enabled: true,
        };
        
        try {
            if (target === 'panel' || target === 'both') {
                await setPanelNtpService(settingsToApply);
            }
            if ((target === 'router' || target === 'both') && selectedRouter) {
                await setRouterNtpService(selectedRouter, settingsToApply);
            }
            alert('NTP settings applied successfully!');
            await fetchData();
        } catch (err) {
            alert(`Failed to apply NTP settings: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(null);
        }
    };
    
    const handleSaveKey = async () => {
        setIsSubmitting('key');
        setKeyStatus(null);
        try {
            const res = await setGeminiKey(apiKey);
            initializeAiClient(apiKey);
            setKeyStatus({ type: 'success', message: res.message });
        } catch (err) {
            setKeyStatus({ type: 'error', message: (err as Error).message });
        } finally {
            setIsSubmitting(null);
        }
    }

    const handleSaveLocalization = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting('localization');
        setLocalizationStatus(null);
        try {
            await setLanguage(language);
            await setCurrency(currency);
            setLocalizationStatus({ type: 'success', message: 'Localization settings saved!' });
        } catch (err) {
            setLocalizationStatus({ type: 'error', message: (err as Error).message });
        } finally {
            setIsSubmitting(null);
        }
    }

    const handleMaintenanceAction = (action: 'install' | 'restart') => {
        setActiveOperation(action);
        setMaintenanceLogs([]);
        setOperationStatus('running');
        
        const endpoint = action === 'install' ? '/api/panel/reinstall-deps' : '/api/panel/restart-services';
        const eventSource = new EventSource(endpoint);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.log) {
                setMaintenanceLogs(prev => [...prev, data.log.trim()]);
            }
            if (data.status === 'finished') {
                setOperationStatus('success');
                eventSource.close();
            }
             if (data.status === 'error') {
                setMaintenanceLogs(prev => [...prev, `ERROR: ${data.message}`]);
                setOperationStatus('error');
                eventSource.close();
            }
        };

        eventSource.onerror = () => {
            if (action === 'restart') {
                 setMaintenanceLogs(prev => [...prev, "\n>>> Server restart initiated. Connection closed as expected. Please wait a moment and refresh the page."]);
                 setOperationStatus('success');
            } else {
                 setMaintenanceLogs(prev => [...prev, "\n>>> Connection to server failed. The process may have been interrupted."]);
                 setOperationStatus('error');
            }
            eventSource.close();
        };
    };

    const isWorking = !!activeOperation || !!isSubmitting;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
             <SettingsCard title="Appearance" icon={<span className="text-2xl">🎨</span>}>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Choose how the application looks. 'System' will match your operating system's settings.
                </p>
                <div className="flex items-center space-x-2 rounded-lg bg-slate-200 dark:bg-slate-700 p-1">
                    {(['light', 'dark', 'system'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={`w-full rounded-md py-2 text-sm font-medium transition-colors capitalize ${
                                theme === t
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-600/50'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </SettingsCard>
            
            <SettingsCard title="AI Configuration" icon={<KeyIcon className="w-6 h-6 text-orange-400" />}>
                 <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Manage the Google Gemini API key used for all AI features like script generation and troubleshooting. You can get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-500 dark:text-sky-400 hover:underline">Google AI Studio</a>.
                </p>
                <div className="space-y-2">
                    <label htmlFor="apiKey" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Gemini API Key</label>
                    <div className="relative">
                        <input
                            id="apiKey"
                            type={isKeyVisible ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                setKeyStatus(null);
                            }}
                            disabled={isLoading.key || isWorking}
                            placeholder={isLoading.key ? 'Loading key...' : 'Enter your API key'}
                            className="block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 pl-3 pr-10 text-slate-900 dark:text-white font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setIsKeyVisible(!isKeyVisible)}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            aria-label={isKeyVisible ? 'Hide API key' : 'Show API key'}
                        >
                            {isKeyVisible ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
                 {keyStatus && (
                    <div className={`mt-3 text-sm p-2 rounded-md ${keyStatus.type === 'success' ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'}`}>
                        {keyStatus.message}
                    </div>
                )}
                <div className="flex justify-end mt-4">
                    <button onClick={handleSaveKey} disabled={isWorking || isLoading.key} className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50">
                        {isSubmitting === 'key' ? 'Saving...' : 'Save Key'}
                    </button>
                </div>
            </SettingsCard>
            
            <SettingsCard title="Localization" icon={<span className="text-2xl">🌍</span>}>
                <form onSubmit={handleSaveLocalization} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="language" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Language</label>
                            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as PanelSettings['language'])} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                <option value="en">English</option>
                                <option value="fil">Filipino</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="currency" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Currency</label>
                            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value as PanelSettings['currency'])} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white">
                                <option value="USD">USD - United States Dollar</option>
                                <option value="PHP">PHP - Philippine Peso</option>
                            </select>
                        </div>
                    </div>
                     {localizationStatus && (
                        <div className={`mt-3 text-sm p-2 rounded-md ${localizationStatus.type === 'success' ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'}`}>
                            {localizationStatus.message}
                        </div>
                    )}
                    <div className="flex justify-end pt-2">
                        <button type="submit" disabled={isWorking} className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50">
                            {isSubmitting === 'localization' ? 'Saving...' : 'Save Preferences'}
                        </button>
                    </div>
                </form>
            </SettingsCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <SettingsCard title="Panel Host" icon={<ServerIcon className="w-6 h-6 text-orange-400" />}>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Manage the Orange Pi or server running this web panel.</p>
                    <button onClick={handleRebootPanel} disabled={isWorking} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <PowerIcon className="w-5 h-5" />
                        Reboot Panel Server
                    </button>
                     <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">Requires passwordless `sudo` permissions.</p>
                </SettingsCard>
                <SettingsCard title="MikroTik Router" icon={<RouterIcon className="w-6 h-6 text-orange-400" />}>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Manage the currently selected MikroTik router.</p>
                    <button onClick={handleRebootRouter} disabled={!selectedRouter || isWorking} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:bg-slate-600 dark:disabled:bg-slate-700 disabled:cursor-not-allowed">
                        <PowerIcon className="w-5 h-5" />
                        Reboot Router
                    </button>
                    {!selectedRouter && <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">Select a router to enable this action.</p>}
                </SettingsCard>
            </div>

            <SettingsCard title="NTP Time Synchronization" icon={<span className="text-2xl">🕒</span>}>
                 <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 dark:text-slate-400 flex items-start gap-3 mb-6">
                     <ExclamationTriangleIcon className="w-8 h-8 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
                     <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-200">Synchronization is Key</h4>
                        <p>Keeping time synchronized between your router and the panel is crucial for scheduled tasks, like PPPoE user expiration scripts, to function correctly.</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <NtpInfo title="Panel Host NTP Status" settings={panelNtp} error={errors.panel} />
                    <NtpInfo title="Router NTP Status" settings={routerNtp} error={errors.router} />
                </div>
                <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="primaryNtp" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Primary NTP Server</label>
                            <input type="text" name="primaryNtp" id="primaryNtp" value={formNtp.primaryNtp} onChange={(e) => setFormNtp(p => ({...p, primaryNtp: e.target.value}))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., time.google.com" />
                        </div>
                        <div>
                            <label htmlFor="secondaryNtp" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Secondary NTP Server</label>
                            <input type="text" name="secondaryNtp" id="secondaryNtp" value={formNtp.secondaryNtp} onChange={(e) => setFormNtp(p => ({...p, secondaryNtp: e.target.value}))} className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., pool.ntp.org" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-4">
                        <button onClick={() => handleApplyNtp('panel')} disabled={isWorking} className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg w-full sm:w-auto disabled:opacity-50">
                            {isSubmitting === 'panel' ? <Loader /> : 'Apply to Panel'}
                        </button>
                        <button onClick={() => handleApplyNtp('router')} disabled={!selectedRouter || isWorking} className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg w-full sm:w-auto disabled:opacity-50">
                             {isSubmitting === 'router' ? <Loader /> : 'Apply to Router'}
                        </button>
                        <button onClick={() => handleApplyNtp('both')} disabled={!selectedRouter || isWorking} className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg w-full sm:w-auto disabled:opacity-50">
                             {isSubmitting === 'both' ? <Loader /> : 'Apply to Both'}
                        </button>
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard title="Panel Maintenance" icon={<CogIcon className="w-6 h-6 text-orange-400" />}>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    Use these actions for troubleshooting or after manually updating files via Git. These actions require `npm` and `pm2` to be installed globally on the panel server.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <button
                        onClick={() => handleMaintenanceAction('install')}
                        disabled={isWorking}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <CircleStackIcon className="w-5 h-5" />
                        Re-install Dependencies
                    </button>
                    <button
                        onClick={() => handleMaintenanceAction('restart')}
                        disabled={isWorking}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowPathIcon className="w-5 h-5" />
                        Restart Panel Services
                    </button>
                </div>

                {activeOperation && (
                    <div className="mt-6">
                         <h4 className="text-md font-semibold text-slate-800 dark:text-slate-200 mb-2 capitalize">{activeOperation} Log</h4>
                         <LogViewer logs={maintenanceLogs} />
                         <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setActiveOperation(null)}
                                className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-lg font-semibold"
                            >
                                Close Log
                            </button>
                         </div>
                    </div>
                )}
            </SettingsCard>
        </div>
    );
};