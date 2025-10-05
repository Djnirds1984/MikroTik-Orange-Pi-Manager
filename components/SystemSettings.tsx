import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId, NtpSettings } from '../types.ts';
// Fix: Rename imported functions to avoid collision with useState setters.
import { getRouterNtp, rebootRouter, setRouterNtp as setRouterNtpService } from '../services/mikrotikService.ts';
import { getPanelNtp, rebootPanel, setPanelNtp as setPanelNtpService } from '../services/panelService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, ServerIcon, PowerIcon, ExclamationTriangleIcon, CogIcon, CircleStackIcon, ArrowPathIcon } from '../constants.tsx';

const SettingsCard: React.FC<{ title: string; children: React.ReactNode; icon: React.ReactNode }> = ({ title, children, icon }) => (
  <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md">
    <div className="p-4 border-b border-slate-700 flex items-center gap-3">
      {icon}
      <h3 className="text-lg font-semibold text-orange-400">{title}</h3>
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
        <div ref={logContainerRef} className="bg-slate-900 text-xs font-mono text-slate-300 p-4 rounded-md h-64 overflow-y-auto border border-slate-600">
            {logs.map((log, index) => (
                <pre key={index} className="whitespace-pre-wrap break-words">{log}</pre>
            ))}
        </div>
    );
};

const NtpInfo: React.FC<{ title: string; settings: NtpSettings | null; error: string | null }> = ({ title, settings, error }) => (
    <div>
        <h4 className="text-md font-semibold text-slate-200 mb-2">{title}</h4>
        {error ? (
            <p className="text-sm text-red-400">{error}</p>
        ) : !settings ? (
            <p className="text-sm text-slate-500">Loading...</p>
        ) : (
            <div className="text-sm space-y-1 font-mono text-slate-300">
                <p>Status: <span className={settings.enabled ? 'text-green-400' : 'text-red-400'}>{settings.enabled ? 'Enabled' : 'Disabled'}</span></p>
                <p>Primary: <span className="text-cyan-300">{settings.primaryNtp || 'Not Set'}</span></p>
                <p>Secondary: <span className="text-cyan-300">{settings.secondaryNtp || 'Not Set'}</span></p>
            </div>
        )}
    </div>
);


export const SystemSettings: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [panelNtp, setPanelNtp] = useState<NtpSettings | null>(null);
    const [routerNtp, setRouterNtp] = useState<NtpSettings | null>(null);
    const [formNtp, setFormNtp] = useState({ primaryNtp: '', secondaryNtp: '' });

    const [isLoading, setIsLoading] = useState({ panel: true, router: true });
    const [isSubmitting, setIsSubmitting] = useState<'panel' | 'router' | 'both' | null>(null);
    const [errors, setErrors] = useState<{ panel: string | null, router: string | null }>({ panel: null, router: null });
    
    const [activeOperation, setActiveOperation] = useState<'install' | 'restart' | null>(null);
    const [maintenanceLogs, setMaintenanceLogs] = useState<string[]>([]);
    const [operationStatus, setOperationStatus] = useState<'running' | 'success' | 'error' | null>(null);


    const fetchData = useCallback(async () => {
        setIsLoading({ panel: true, router: true });
        setErrors({ panel: null, router: null });

        // Fetch Panel NTP
        getPanelNtp()
            .then(data => {
                setPanelNtp(data);
                setFormNtp(prev => ({ ...prev, primaryNtp: data.primaryNtp, secondaryNtp: data.secondaryNtp }));
            })
            .catch(err => setErrors(prev => ({ ...prev, panel: err.message })))
            .finally(() => setIsLoading(prev => ({ ...prev, panel: false })));

        // Fetch Router NTP
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
            enabled: true, // Always enable when setting
        };
        
        try {
            if (target === 'panel' || target === 'both') {
                // Fix: Call the renamed service function instead of the state setter.
                await setPanelNtpService(settingsToApply);
            }
            if ((target === 'router' || target === 'both') && selectedRouter) {
                // Fix: Call the renamed service function with correct arguments.
                await setRouterNtpService(selectedRouter, settingsToApply);
            }
            alert('NTP settings applied successfully!');
            await fetchData(); // Refresh data
        } catch (err) {
            alert(`Failed to apply NTP settings: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(null);
        }
    };
    
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
            // This is expected for restart, as the server goes down.
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormNtp(prev => ({ ...prev, [name]: value }));
    };

    const isWorking = !!activeOperation || !!isSubmitting;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Panel Management */}
                <SettingsCard title="Panel Host" icon={<ServerIcon className="w-6 h-6 text-orange-400" />}>
                    <p className="text-sm text-slate-400 mb-4">Manage the Orange Pi or server running this web panel.</p>
                    <button onClick={handleRebootPanel} disabled={isWorking} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-800 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <PowerIcon className="w-5 h-5" />
                        Reboot Panel Server
                    </button>
                     <p className="text-xs text-slate-500 mt-2 text-center">Requires passwordless `sudo` permissions.</p>
                </SettingsCard>

                {/* Router Management */}
                <SettingsCard title="MikroTik Router" icon={<RouterIcon className="w-6 h-6 text-orange-400" />}>
                    <p className="text-sm text-slate-400 mb-4">Manage the currently selected MikroTik router.</p>
                    <button onClick={handleRebootRouter} disabled={!selectedRouter || isWorking} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-800 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:bg-slate-700 disabled:cursor-not-allowed">
                        <PowerIcon className="w-5 h-5" />
                        Reboot Router
                    </button>
                    {!selectedRouter && <p className="text-xs text-slate-500 mt-2 text-center">Select a router to enable this action.</p>}
                </SettingsCard>
            </div>

            {/* NTP Synchronization */}
            <SettingsCard title="NTP Time Synchronization" icon={<span className="text-2xl">🕒</span>}>
                 <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-400 flex items-start gap-3 mb-6">
                     <ExclamationTriangleIcon className="w-8 h-8 text-yellow-400 flex-shrink-0" />
                     <div>
                        <h4 className="font-bold text-slate-200">Synchronization is Key</h4>
                        <p>Keeping time synchronized between your router and the panel is crucial for scheduled tasks, like PPPoE user expiration scripts, to function correctly.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <NtpInfo title="Panel Host NTP Status" settings={panelNtp} error={errors.panel} />
                    <NtpInfo title="Router NTP Status" settings={routerNtp} error={errors.router} />
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="primaryNtp" className="block text-sm font-medium text-slate-300">Primary NTP Server</label>
                            <input type="text" name="primaryNtp" id="primaryNtp" value={formNtp.primaryNtp} onChange={handleInputChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., time.google.com" />
                        </div>
                        <div>
                            <label htmlFor="secondaryNtp" className="block text-sm font-medium text-slate-300">Secondary NTP Server</label>
                            <input type="text" name="secondaryNtp" id="secondaryNtp" value={formNtp.secondaryNtp} onChange={handleInputChange} className="mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-orange-500" placeholder="e.g., pool.ntp.org" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-4">
                        <button onClick={() => handleApplyNtp('panel')} disabled={isWorking} className="px-4 py-2 text-sm font-semibold bg-sky-700 hover:bg-sky-600 rounded-lg w-full sm:w-auto disabled:opacity-50">
                            {isSubmitting === 'panel' ? <Loader /> : 'Apply to Panel'}
                        </button>
                        <button onClick={() => handleApplyNtp('router')} disabled={!selectedRouter || isWorking} className="px-4 py-2 text-sm font-semibold bg-sky-700 hover:bg-sky-600 rounded-lg w-full sm:w-auto disabled:opacity-50">
                             {isSubmitting === 'router' ? <Loader /> : 'Apply to Router'}
                        </button>
                        <button onClick={() => handleApplyNtp('both')} disabled={!selectedRouter || isWorking} className="px-4 py-2 text-sm font-semibold bg-orange-600 hover:bg-orange-500 rounded-lg w-full sm:w-auto disabled:opacity-50">
                             {isSubmitting === 'both' ? <Loader /> : 'Apply to Both'}
                        </button>
                    </div>
                </div>

            </SettingsCard>

            {/* Panel Maintenance */}
            <SettingsCard title="Panel Maintenance" icon={<CogIcon className="w-6 h-6 text-orange-400" />}>
                <p className="text-sm text-slate-400 mb-6">
                    Use these actions for troubleshooting or after manually updating files via Git. These actions require `npm` and `pm2` to be installed globally on the panel server.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <button
                        onClick={() => handleMaintenanceAction('install')}
                        disabled={isWorking}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-800 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <CircleStackIcon className="w-5 h-5" />
                        Re-install Dependencies
                    </button>
                    <button
                        onClick={() => handleMaintenanceAction('restart')}
                        disabled={isWorking}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-800 hover:bg-sky-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowPathIcon className="w-5 h-5" />
                        Restart Panel Services
                    </button>
                </div>

                {activeOperation && (
                    <div className="mt-6">
                         <h4 className="text-md font-semibold text-slate-200 mb-2 capitalize">{activeOperation} Log</h4>
                         <LogViewer logs={maintenanceLogs} />
                         <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => setActiveOperation(null)}
                                className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 rounded-lg font-semibold"
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
