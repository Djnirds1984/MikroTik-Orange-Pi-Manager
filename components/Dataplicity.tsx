import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDataplicityStatus, streamInstallDataplicity, streamUninstallDataplicity } from '../services/dataplicityService.ts';
import type { DataplicityStatus } from '../types.ts';
import { Loader } from './Loader.tsx';
import { DataplicityIcon, CheckCircleIcon, TrashIcon, EyeIcon, EyeSlashIcon } from '../constants.tsx';
import { SudoInstructionBox } from './SudoInstructionBox.tsx';

const LogViewer: React.FC<{ logs: string[] }> = ({ logs }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div ref={logContainerRef} className="bg-slate-100 dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-300 p-4 rounded-md h-64 overflow-y-auto border border-slate-200 dark:border-slate-600">
            {logs.map((log, index) => (
                <pre key={index} className="whitespace-pre-wrap break-words">{log}</pre>
            ))}
        </div>
    );
};

export const Dataplicity: React.FC = () => {
    const [status, setStatus] = useState<'loading' | 'not_installed' | 'installed' | 'installing' | 'uninstalling' | 'error'>('loading');
    const [data, setData] = useState<DataplicityStatus | null>(null);
    const [isEnabled, setIsEnabled] = useState(false);
    const [credentials, setCredentials] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [errorMessage, setErrorMessage] = useState('');

    const fetchData = useCallback(async () => {
        setStatus('loading');
        setLogs([]);
        setErrorMessage('');
        try {
            const result = await getDataplicityStatus();
            setData(result);
            setStatus(result.installed ? 'installed' : 'not_installed');
            if (result.installed) {
                setIsEnabled(true);
            }
        } catch (err) {
            setStatus('error');
            setErrorMessage((err as Error).message);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleStream = (streamFn: (callbacks: any) => void, initialStatus: 'installing' | 'uninstalling') => {
        setStatus(initialStatus);
        setLogs([]);
        setErrorMessage('');
        
        streamFn({
            onMessage: (data: any) => {
                if (data.log) setLogs(prev => [...prev, data.log.trim()]);
                if (data.status === 'error') {
                    setStatus('error');
                    setErrorMessage(data.message || 'An unknown error occurred during the process.');
                }
            },
            onClose: () => {
                // If we finish without an error, refresh the status
                if (status !== 'error') {
                    setTimeout(fetchData, 1000); 
                }
            },
            onError: (err: Error) => {
                setStatus('error');
                setErrorMessage(`Connection to server failed: ${err.message}`);
            }
        });
    };
    
    const handleInstall = () => {
        if (!credentials.email || !credentials.password) {
            alert("Please enter both email and password.");
            return;
        }
        handleStream((callbacks) => streamInstallDataplicity(credentials.email, credentials.password, callbacks), 'installing');
    };

    const handleUninstall = () => {
        if (window.confirm("Are you sure you want to uninstall Dataplicity? This will remove remote access.")) {
            handleStream(streamUninstallDataplicity, 'uninstalling');
        }
    };

    const isWorking = status === 'loading' || status === 'installing' || status === 'uninstalling';

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                        <DataplicityIcon className="w-8 h-8 text-[--color-primary-500]" />
                        Dataplicity
                    </h2>
                </div>

                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={isEnabled} onChange={() => setIsEnabled(!isEnabled)} disabled={status === 'installed'} className="h-5 w-5 rounded text-[--color-primary-600] focus:ring-[--color-primary-500] disabled:opacity-70" />
                        <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">Enable Dataplicity</span>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Allows you to access the shell of your machine and monitor your machine's admin.</p>
                        </div>
                    </label>

                    {isWorking && (
                         <div className="flex flex-col items-center justify-center p-8">
                             <Loader />
                             <p className="mt-4 capitalize">{status}...</p>
                         </div>
                    )}
                    
                    {errorMessage && <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">{errorMessage}</div>}

                    {(status === 'installing' || status === 'uninstalling') && logs.length > 0 && <LogViewer logs={logs} />}

                    {status === 'installed' && data && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 text-center">
                                <CheckCircleIcon className="w-12 h-12 text-green-500 dark:text-green-400 mx-auto mb-2" />
                                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Dataplicity is Active</h3>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">Click <a href={data.url || 'https://app.dataplicity.com/'} target="_blank" rel="noopener noreferrer" className="text-[--color-primary-600] font-semibold hover:underline">here</a> and login using this email <strong className="text-slate-800 dark:text-slate-200">{data.email}</strong> to view and monitor your machine online.</p>
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                                <button onClick={handleUninstall} className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2">
                                    <TrashIcon className="w-5 h-5"/>
                                    Uninstall Dataplicity
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {isEnabled && status === 'not_installed' && (
                        <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                             <p className="text-sm text-slate-500 dark:text-slate-400">Input your dataplicity account to add this device/machine.</p>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                                <input type="email" value={credentials.email} onChange={e => setCredentials(c => ({...c, email: e.target.value}))} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" required />
                             </div>
                             <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                                <input type={showPassword ? 'text' : 'password'} value={credentials.password} onChange={e => setCredentials(c => ({...c, password: e.target.value}))} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" required />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-slate-500 dark:text-slate-400">
                                    {showPassword ? <EyeSlashIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}
                                </button>
                             </div>
                             <div className="text-sm">
                                <p className="text-slate-600 dark:text-slate-400">No account yet? <a href="https://www.dataplicity.com/" target="_blank" rel="noopener noreferrer" className="font-medium text-[--color-primary-600] hover:text-[--color-primary-500]">Register</a></p>
                             </div>
                             <div className="flex justify-end">
                                <button onClick={handleInstall} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold rounded-lg">Install</button>
                             </div>
                             <div className="pt-4">
                                <SudoInstructionBox />
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};