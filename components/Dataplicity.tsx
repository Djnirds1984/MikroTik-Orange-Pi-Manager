import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDataplicityStatus, streamInstallDataplicity, streamUninstallDataplicity } from '../services/dataplicityService.ts';
import type { DataplicityStatus } from '../types.ts';
import { Loader } from './Loader.tsx';
import { DataplicityIcon, ExclamationTriangleIcon, CheckCircleIcon, TrashIcon } from '../constants.tsx';

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
    const [logs, setLogs] = useState<string[]>([]);
    const [errorMessage, setErrorMessage] = useState('');

    const fetchData = useCallback(async () => {
        setStatus('loading');
        setLogs([]);
        try {
            const result = await getDataplicityStatus();
            setData(result);
            setStatus(result.installed ? 'installed' : 'not_installed');
        } catch (err) {
            setStatus('error');
            setErrorMessage((err as Error).message);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleStream = (streamFn: (callbacks: any) => void, initialStatus: 'installing' | 'uninstalling', successStatus: 'installed' | 'not_installed') => {
        setStatus(initialStatus);
        setLogs([]);
        
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
                    setTimeout(fetchData, 1000); // Give a moment for service to settle
                }
            },
            onError: (err: Error) => {
                setStatus('error');
                setErrorMessage(`Connection to server failed: ${err.message}`);
            }
        });
    };
    
    const handleInstall = () => handleStream(streamInstallDataplicity, 'installing', 'installed');
    const handleUninstall = () => {
        if (window.confirm("Are you sure you want to uninstall Dataplicity? This will remove remote access.")) {
            handleStream(streamUninstallDataplicity, 'uninstalling', 'not_installed');
        }
    };

    const renderContent = () => {
        switch (status) {
            case 'loading':
                return <div className="flex justify-center p-8"><Loader /></div>;
            case 'error':
                return <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">{errorMessage}</div>;
            case 'installing':
            case 'uninstalling':
                return (
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2 capitalize">{status}...</h3>
                        <LogViewer logs={logs} />
                    </div>
                );
            case 'installed':
                return (
                    <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 text-center">
                            <CheckCircleIcon className="w-12 h-12 text-green-500 dark:text-green-400 mx-auto mb-2" />
                            <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">Dataplicity is Active</h3>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg">
                            <p className="text-sm text-slate-600 dark:text-slate-400">Your remote access URL is:</p>
                            <a href={data?.url || '#'} target="_blank" rel="noopener noreferrer" className="font-mono text-lg text-[--color-primary-600] dark:text-[--color-primary-400] hover:underline break-all">{data?.url}</a>
                        </div>
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                             <button onClick={handleUninstall} className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2">
                                <TrashIcon className="w-5 h-5"/>
                                Uninstall Dataplicity
                            </button>
                        </div>
                    </div>
                );
            case 'not_installed':
                return (
                    <div className="text-center space-y-4">
                        <p className="text-slate-500 dark:text-slate-400">Dataplicity agent is not installed on this panel host.</p>
                        <button onClick={handleInstall} className="px-5 py-2.5 bg-[--color-primary-600] hover:bg-[--color-primary-500] rounded-lg font-semibold text-white">
                           Install Dataplicity
                        </button>
                         <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Note: This requires passwordless `sudo` permissions for the panel's user.</p>
                    </div>
                );
            default:
                return null;
        }
    };
    
    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8">
                <div className="text-center mb-6">
                    <DataplicityIcon className="w-16 h-16 text-[--color-primary-500] mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dataplicity Remote Access</h2>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">Manage remote access to this panel's host machine via Dataplicity.</p>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};