import React, { useState, useEffect, useCallback } from 'react';
import { 
    getCurrentVersion, listBackups, deleteBackup, downloadBackup,
    streamUpdateStatus, streamUpdateApp, streamRollbackApp 
} from '../services/updaterService.ts';
import type { VersionInfo, NewVersionInfo } from '../types.ts';
import { 
    UpdateIcon, CloudArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon, 
    TrashIcon, ArchiveBoxIcon, ArrowPathIcon, CodeBracketIcon 
} from '../constants.tsx';
import { Loader } from './Loader.tsx';

type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'diverged' | 'ahead' | 'error' | 'updating' | 'restarting' | 'rollingback';
type StatusInfo = {
    status: UpdateStatus;
    message: string;
};
type LogEntry = {
    text: string;
    isError?: boolean;
};

// --- Sub-components for better structure ---

const SettingsCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, icon, children, className }) => (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md ${className}`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            {icon}
            <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">{title}</h3>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

const LogViewer: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
    const logContainerRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div ref={logContainerRef} className="bg-slate-100 dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-300 p-4 rounded-md h-64 overflow-y-auto border border-slate-200 dark:border-slate-600">
            {logs.map((log, index) => (
                <pre key={index} className={`whitespace-pre-wrap break-words ${log.isError ? 'text-red-500' : ''}`}>{log.text}</pre>
            ))}
        </div>
    );
};

const VersionInfoDisplay: React.FC<{ title: string; info: VersionInfo }> = ({ title, info }) => (
    <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg">
        <p className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">{info.title} <span className="text-xs font-mono text-slate-500 ml-2">{info.hash}</span></p>
        {info.description && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{info.description}</p>}
    </div>
);

const ChangelogDisplay: React.FC<{ info: NewVersionInfo, onUpdate: () => void, isWorking: boolean }> = ({ info, onUpdate, isWorking }) => (
    <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 italic">{info.description}</p>
        <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Changelog:</h4>
            <pre className="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-slate-700 dark:text-slate-300 whitespace-pre-wrap h-40 overflow-y-auto">{info.changelog}</pre>
        </div>
         <div className="flex justify-end">
            <button onClick={onUpdate} disabled={isWorking} className="px-4 py-2 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2">
                <UpdateIcon className="w-5 h-5"/> Install Update
            </button>
        </div>
    </div>
);

// --- Main Updater Component ---

export const Updater: React.FC = () => {
    const [statusInfo, setStatusInfo] = useState<StatusInfo>({ status: 'idle', message: 'Check for the latest version of the panel.' });
    const [backups, setBackups] = useState<string[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [currentVersionInfo, setCurrentVersionInfo] = useState<VersionInfo | null>(null);
    const [newVersionInfo, setNewVersionInfo] = useState<NewVersionInfo | null>(null);
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isActioning, setIsActioning] = useState<string | null>(null); // 'check', 'update', 'rollback-filename', 'delete-filename', 'download-filename'

    const fetchBackups = useCallback(async () => {
        try {
            const data = await listBackups();
            setBackups(data.filter(file => file.endsWith('.tar.gz')));
        } catch (error) {
            console.error(error);
             setStatusInfo({ status: 'error', message: `Failed to fetch backups: ${(error as Error).message}` });
        }
    }, []);

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoadingInitial(true);
            try {
                const data = await getCurrentVersion();
                setCurrentVersionInfo(data);
            } catch (error) {
                console.error(error);
                setStatusInfo({ status: 'error', message: (error as Error).message });
            } finally {
                setIsLoadingInitial(false);
            }
        };
        fetchInitialData();
        fetchBackups();
    }, [fetchBackups]);

    const handleCheckForUpdates = () => {
        setIsActioning('check');
        setLogs([]);
        setNewVersionInfo(null);
        setStatusInfo({ status: 'checking', message: 'Connecting to repository...' });
        streamUpdateStatus({ /* ... stream handlers ... */
            onMessage: (data) => {
                if (data.log) setLogs(prev => [...prev, { text: data.log.trim(), isError: data.isError }]);
                if (data.newVersionInfo) setNewVersionInfo(data.newVersionInfo);
                if (data.status && data.status !== 'finished') setStatusInfo(prev => ({...prev, ...data}));
            },
            onClose: () => {
                setIsActioning(null);
                setStatusInfo(prev => {
                    if (prev.status === 'checking') return { status: 'error', message: 'Failed to determine update status. Check logs for details.' };
                    return prev;
                });
            },
            onError: (err) => {
                setStatusInfo({ status: 'error', message: `Connection to server failed: ${err.message}` });
                setIsActioning(null);
            }
        });
    };
    
    const handleUpdate = () => {
        setIsActioning('update');
        setStatusInfo(prev => ({ ...prev, status: 'updating', message: 'Starting update process...' }));
        setLogs([]);
        streamUpdateApp({ /* ... stream handlers ... */
             onMessage: (data) => {
                if (data.log) setLogs(prev => [...prev, { text: data.log.trim(), isError: data.isError }]);
                if (data.status === 'restarting') {
                    setStatusInfo({ status: 'restarting', message: 'Update complete! Server restarting...' });
                    setTimeout(() => window.location.reload(), 8000);
                }
                 if (data.status === 'error') {
                    setStatusInfo({ status: 'error', message: data.message });
                    setIsActioning(null);
                }
            },
            onError: (err) => {
                 setStatusInfo({ status: 'error', message: `Lost connection to the server. ${err.message}` });
                 setIsActioning(null);
            }
        });
    };
    
    const handleRollback = (backupFile: string) => {
        if (!window.confirm(`Are you sure you want to restore from "${backupFile}"? This will overwrite the current application files.`)) return;
        setIsActioning(`rollback-${backupFile}`);
        setStatusInfo({ status: 'rollingback', message: `Restoring from ${backupFile}...` });
        setLogs([]);
        streamRollbackApp(backupFile, { /* ... stream handlers ... */
             onMessage: (data) => {
                if(data.log) setLogs(prev => [...prev, { text: data.log.trim(), isError: data.isError }]);
                if(data.status === 'restarting') {
                    setStatusInfo({ status: 'restarting', message: 'Rollback complete! Server is restarting...' });
                    setTimeout(() => window.location.reload(), 8000);
                }
                 if(data.status === 'error') {
                     setStatusInfo({ status: 'error', message: data.message });
                     setIsActioning(null);
                 }
             },
             onError: (err) => {
                 setStatusInfo({ status: 'error', message: `Lost connection during rollback. ${err.message}` });
                 setIsActioning(null);
             }
        });
    };

    const handleDeleteBackup = async (backupFile: string) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete the backup "${backupFile}"?`)) return;
        setIsActioning(`delete-${backupFile}`);
        try {
            await deleteBackup(backupFile);
            await fetchBackups();
        } catch (error) {
            alert(`Error: ${(error as Error).message}`);
        } finally {
            setIsActioning(null);
        }
    };

    const handleDownloadBackup = async (backupFile: string) => {
        setIsActioning(`download-${backupFile}`);
        try {
            await downloadBackup(backupFile);
        } catch (error) {
            alert(`Error downloading backup: ${(error as Error).message}`);
        } finally {
            setIsActioning(null);
        }
    };

    const renderStatusInfo = () => {
        const { status, message } = statusInfo;
        const iconMap = {
            checking: <Loader />,
            uptodate: <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-400" />,
            available: <CloudArrowUpIcon className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />,
            error: <ExclamationTriangleIcon className="w-8 h-8 text-red-600 dark:text-red-400 flex-shrink-0" />,
            restarting: <Loader />,
            ahead: <CloudArrowUpIcon className="w-8 h-8 text-blue-600 dark:text-blue-400 rotate-180" />,
            diverged: <ExclamationTriangleIcon className="w-8 h-8 text-orange-600 dark:text-orange-400 flex-shrink-0" />,
            idle: <UpdateIcon className="w-8 h-8 text-slate-500" />,
        };
        const colorMap = {
            error: 'text-red-600 dark:text-red-400 items-start',
            uptodate: 'text-green-600 dark:text-green-400',
            available: 'text-cyan-600 dark:text-cyan-400',
            ahead: 'text-blue-600 dark:text-blue-400',
            diverged: 'text-orange-600 dark:text-orange-400 items-start',
            restarting: 'text-[--color-primary-500] dark:text-[--color-primary-400]',
            default: 'text-slate-700 dark:text-slate-200'
        };
        const color = colorMap[status] || colorMap.default;
        return (
            <div className={`flex items-center gap-3 ${color}`}>
                {iconMap[status] || iconMap.idle}
                <p className="text-left">{message}</p>
            </div>
        );
    };

    const isWorking = !!isActioning;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsCard title="Version & Status" icon={<UpdateIcon className="w-6 h-6" />}>
                <div className="space-y-4">
                    {isLoadingInitial
                        ? <div className="flex justify-center"><Loader /></div>
                        : currentVersionInfo
                            ? <VersionInfoDisplay title="Current Version" info={currentVersionInfo} />
                            : <p className="text-sm text-red-500">Could not load version information.</p>
                    }
                    <div className="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg min-h-[60px] flex items-center justify-center">
                        {renderStatusInfo()}
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleCheckForUpdates} disabled={isWorking} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-lg font-semibold disabled:opacity-50">
                            Check for Updates
                        </button>
                    </div>
                </div>
            </SettingsCard>

            {newVersionInfo && statusInfo.status === 'available' && !isWorking && (
                <SettingsCard title="Update Available" icon={<CloudArrowUpIcon className="w-6 h-6" />}>
                    <ChangelogDisplay info={newVersionInfo} onUpdate={handleUpdate} isWorking={isWorking} />
                </SettingsCard>
            )}

            {(isWorking && logs.length > 0) && (
                 <SettingsCard title={`${statusInfo.status.charAt(0).toUpperCase() + statusInfo.status.slice(1)} Log`} icon={<CodeBracketIcon className="w-6 h-6" />}>
                     <LogViewer logs={logs} />
                </SettingsCard>
            )}

            <SettingsCard title="Application Backups" icon={<ArchiveBoxIcon className="w-6 h-6" />}>
                {backups.length > 0 ? (
                    <ul className="space-y-2">
                        {backups.map(backup => (
                            <li key={backup} className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-md flex justify-between items-center">
                                <span className="font-mono text-sm text-slate-800 dark:text-slate-300 truncate mr-4">{backup}</span>
                                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                                    <button onClick={() => handleRollback(backup)} disabled={isWorking} className="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 disabled:opacity-50" title="Restore">
                                        {isActioning === `rollback-${backup}` ? <Loader /> : <ArrowPathIcon className="h-5 w-5" />}
                                    </button>
                                    <button onClick={() => handleDownloadBackup(backup)} disabled={isWorking} className="p-2 text-slate-500 dark:text-slate-400 hover:text-green-500 dark:hover:text-green-400 disabled:opacity-50" title="Download">
                                        {isActioning === `download-${backup}` ? <Loader /> : <UpdateIcon className="h-5 w-5" />}
                                    </button>
                                    <button onClick={() => handleDeleteBackup(backup)} disabled={isWorking} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50" title="Delete">
                                        {isActioning === `delete-${backup}` ? <Loader /> : <TrashIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                 ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">No application backups found. A backup is automatically created before an update.</p>
                 )}
            </SettingsCard>
        </div>
    );
};