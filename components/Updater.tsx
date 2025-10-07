
import React, { useState, useEffect, useCallback } from 'react';
import { UpdateIcon, CloudArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon, RouterIcon, TrashIcon } from '../constants.tsx';
import { Loader } from './Loader.tsx';

type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'diverged' | 'error' | 'updating' | 'restarting' | 'rollingback';
type StatusInfo = {
    status: UpdateStatus;
    message: string;
    local?: string;
    remote?: string;
};
type VersionInfo = {
    title: string;
    description: string;
    hash?: string;
};
type NewVersionInfo = {
    title: string;
    description: string;
    changelog: string;
};


const LogViewer: React.FC<{ logs: string[] }> = ({ logs }) => {
    const logContainerRef = React.useRef<HTMLDivElement>(null);
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

const VersionInfoDisplay: React.FC<{ title: string; info: VersionInfo }> = ({ title, info }) => (
    <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
        <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
            <p className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">{info.title} <span className="text-xs font-mono text-slate-500 ml-2">{info.hash}</span></p>
            {info.description && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{info.description}</p>}
        </div>
    </div>
);

const ChangelogDisplay: React.FC<{ info: NewVersionInfo }> = ({ info }) => (
    <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">New Version Available: <span className="text-cyan-500 dark:text-cyan-400">{info.title}</span></h3>
        <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg space-y-4">
            {info.description && <p className="text-sm text-slate-600 dark:text-slate-300 italic">{info.description}</p>}
            <div>
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Changelog:</h4>
                <pre className="text-xs font-mono bg-slate-200 dark:bg-slate-800 p-3 rounded-md text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{info.changelog}</pre>
            </div>
        </div>
    </div>
);


export const Updater: React.FC = () => {
    const [statusInfo, setStatusInfo] = useState<StatusInfo>({ status: 'idle', message: 'Check for the latest version of the panel.' });
    const [backups, setBackups] = useState<string[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentVersionInfo, setCurrentVersionInfo] = useState<VersionInfo | null>(null);
    const [newVersionInfo, setNewVersionInfo] = useState<NewVersionInfo | null>(null);
    const [isLoadingCurrentVersion, setIsLoadingCurrentVersion] = useState(true);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);


    const fetchBackups = useCallback(async () => {
        try {
            const res = await fetch('/api/list-backups');
            if (!res.ok) throw new Error('Failed to fetch backups');
            const data: string[] = await res.json();
            setBackups(data.filter(file => file.endsWith('.tar.gz')));
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        const fetchCurrentVersion = async () => {
            setIsLoadingCurrentVersion(true);
            try {
                const res = await fetch('/api/current-version');
                if (!res.ok) throw new Error('Failed to fetch current version');
                const data = await res.json();
                setCurrentVersionInfo(data);
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoadingCurrentVersion(false);
            }
        };

        fetchCurrentVersion();
        fetchBackups();
    }, [fetchBackups]);

    const handleCheckForUpdates = () => {
        setLogs([]);
        setNewVersionInfo(null);
        setStatusInfo({ status: 'checking', message: 'Connecting to repository...' });

        const eventSource = new EventSource('/api/update-status');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.status === 'finished') {
                eventSource.close();
                // If we're still checking, it's an error. Otherwise, we've already set a final state like 'available'.
                setStatusInfo(prev => {
                    if (prev.status === 'checking') {
                        return { status: 'error', message: 'Failed to get a clear update status from the server.' };
                    }
                    return prev;
                });
                return;
            }

            if (data.log) {
                setLogs(prev => [...prev, data.log.trim()]);
            }
            
            if (data.newVersionInfo) {
                setNewVersionInfo(data.newVersionInfo);
            }

            // This ensures that we don't accidentally overwrite a final status with an intermittent one.
            setStatusInfo(prev => ({...prev, ...data}));
        };

        eventSource.onerror = () => {
            setStatusInfo(prev => {
                if (prev.status === 'uptodate' || prev.status === 'available') {
                    return prev;
                }
                return { status: 'error', message: 'Connection to server failed. Could not check for updates.' };
            });
            eventSource.close();
        };
    };
    
    const handleUpdate = () => {
        setStatusInfo(prev => ({ ...prev, status: 'updating' }));
        setLogs([]);
        const eventSource = new EventSource('/api/update-app');
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.log) {
                setLogs(prev => [...prev, data.log]);
            }
            if (data.status === 'restarting') {
                setStatusInfo({ status: 'restarting', message: 'Update complete! The server is restarting. This page will reload in a few seconds...' });
                setTimeout(() => window.location.reload(), 8000);
                eventSource.close();
            }
             if (data.status === 'error') {
                setStatusInfo({ status: 'error', message: data.message });
                 eventSource.close();
            }
        };

        eventSource.onerror = () => {
            setStatusInfo({ status: 'error', message: 'Lost connection to the server during the update process.' });
            eventSource.close();
        };
    };
    
    const handleRollback = (backupFile: string) => {
        if (!window.confirm(`Are you sure you want to restore the backup "${backupFile}"? This will overwrite the current application files.`)) return;

        setStatusInfo({ status: 'rollingback', message: `Restoring from ${backupFile}...` });
        setLogs([]);
        
        const eventSource = new EventSource(`/api/rollback-app?backupFile=${encodeURIComponent(backupFile)}`);
        
         eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if(data.log) {
                setLogs(prev => [...prev, data.log]);
            }
            if(data.status === 'restarting') {
                setStatusInfo({ status: 'restarting', message: 'Rollback complete! Server is restarting...' });
                setTimeout(() => window.location.reload(), 8000);
                eventSource.close();
            }
             if(data.status === 'error') {
                 setStatusInfo({ status: 'error', message: data.message });
                 eventSource.close();
             }
         };

         eventSource.onerror = () => {
             setStatusInfo({ status: 'error', message: 'Lost connection during rollback.' });
             eventSource.close();
         };
    };

    const handleDeleteBackup = async (backupFile: string) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the backup "${backupFile}"? This cannot be undone.`)) return;

        setIsDeleting(backupFile);
        try {
            const res = await fetch('/api/delete-backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ backupFile }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to delete backup.');
            }
            await fetchBackups(); // Refresh the list
        } catch (error) {
            alert(`Error: ${(error as Error).message}`);
        } finally {
            setIsDeleting(null);
        }
    };


    const renderStatusInfo = () => {
        const { status, message } = statusInfo;
        switch (status) {
            case 'checking': return <div className="flex items-center gap-3"><Loader /><p>{message}</p></div>;
            case 'uptodate': return <div className="flex items-center gap-3 text-green-600 dark:text-green-400"><CheckCircleIcon className="w-8 h-8" /><p>{message}</p></div>;
            case 'available': return <div className="flex items-center gap-3 text-cyan-600 dark:text-cyan-400"><CloudArrowUpIcon className="w-8 h-8" /><p>{message}</p></div>;
            case 'error': return <div className="flex items-center gap-3 text-red-600 dark:text-red-400"><ExclamationTriangleIcon className="w-8 h-8" /><p>{message}</p></div>;
            case 'restarting': return <div className="flex items-center gap-3 text-[--color-primary-500] dark:text-[--color-primary-400]"><Loader /><p>{message}</p></div>
            default: return <div className="flex items-center gap-3 text-slate-500"><UpdateIcon className="w-8 h-8" /><p>{message}</p></div>;
        }
    };
    
    const isWorking = statusInfo.status === 'checking' || statusInfo.status === 'updating' || statusInfo.status === 'restarting' || statusInfo.status === 'rollingback' || !!isDeleting;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Panel Updater</h2>
                <div className="bg-slate-100 dark:bg-slate-900/50 p-6 rounded-lg min-h-[100px] flex items-center justify-center text-slate-700 dark:text-slate-200">
                    {renderStatusInfo()}
                </div>
                 <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={handleCheckForUpdates} disabled={isWorking} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-lg font-semibold disabled:opacity-50">
                        Check for Updates
                    </button>
                    {statusInfo.status === 'available' && (
                        <button onClick={handleUpdate} disabled={isWorking} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white rounded-lg font-semibold disabled:opacity-50">
                            Install Update
                        </button>
                    )}
                </div>
            </div>

            { (isLoadingCurrentVersion && statusInfo.status === 'idle') && <div className="flex justify-center"><Loader /></div> }

            { !isWorking && newVersionInfo && (
                <ChangelogDisplay info={newVersionInfo} />
            )}

            { !isWorking && !newVersionInfo && currentVersionInfo && (
                <VersionInfoDisplay title="Current Version" info={currentVersionInfo} />
            )}


            {(statusInfo.status === 'checking' || statusInfo.status === 'updating' || statusInfo.status === 'rollingback') && logs.length > 0 && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8">
                     <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 capitalize">{statusInfo.status} Log</h3>
                     <LogViewer logs={logs} />
                </div>
            )}
            
             <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Application Backups</h3>
                 {backups.length > 0 ? (
                    <ul className="space-y-2">
                        {backups.map(backup => (
                            <li key={backup} className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-md flex justify-between items-center">
                                <span className="font-mono text-sm text-slate-800 dark:text-slate-300">{backup}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleRollback(backup)} disabled={isWorking} className="px-3 py-1 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md font-semibold disabled:opacity-50">
                                        Restore
                                    </button>
                                    <button onClick={() => handleDeleteBackup(backup)} disabled={isWorking} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-md disabled:opacity-50" title="Delete Backup">
                                        {isDeleting === backup ? <Loader /> : <TrashIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                 ) : (
                    <p className="text-slate-500 dark:text-slate-500 text-center py-4">No application backups found. A backup is automatically created before an update.</p>
                 )}
            </div>
        </div>
    );
};
