
import React, { useState, useEffect, useCallback } from 'react';
import { Loader } from './Loader.tsx';
import { CloudArrowUpIcon, UpdateIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../constants.tsx';

const GITHUB_REPO_API = "https://api.github.com/repos/Djnirds1984/MikroTik-Orange-Pi-Manager";
const GITHUB_BRANCH = "main"; // Or 'master', depending on the repo's default branch

type Status = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error' | 'updating' | 'rolling-back';

interface LatestCommitInfo {
    sha: string;
    message: string;
    author: string;
    date: string;
}

const StatusDisplay: React.FC<{ status: Status, errorMessage?: string | null, latestCommitInfo?: LatestCommitInfo | null }> = ({ status, errorMessage, latestCommitInfo }) => {
    switch (status) {
        case 'checking':
            return <div className="flex items-center text-orange-400"><Loader /><span className="ml-3">Checking for updates...</span></div>;
        case 'up-to-date':
            return <div className="flex items-center text-green-400"><CheckCircleIcon className="w-6 h-6" /><span className="ml-3 font-semibold">You are on the latest version.</span></div>;
        case 'update-available':
            return <div className="flex items-center text-cyan-400"><UpdateIcon className="w-6 h-6" /><span className="ml-3 font-semibold">A new version is available!</span></div>;
        case 'error':
             return <div className="flex items-center text-red-400"><ExclamationTriangleIcon className="w-6 h-6" /><span className="ml-3 font-semibold">Error: {errorMessage || "Could not fetch update information."}</span></div>;
        case 'idle': default:
            return <p className="text-slate-500">Check for the latest version of the management panel.</p>;
    }
}

export const Updater: React.FC = () => {
    const [status, setStatus] = useState<Status>('idle');
    const [currentVersion, setCurrentVersion] = useState<string>('?.?.?');
    const [currentCommit, setCurrentCommit] = useState<string>('...');
    const [latestCommitInfo, setLatestCommitInfo] = useState<LatestCommitInfo | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [processLog, setProcessLog] = useState<string[]>([]);
    const [backups, setBackups] = useState<string[]>([]);
    
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch current version info
                const versionResponse = await fetch('/api/version-info');
                if (!versionResponse.ok) throw new Error('Failed to fetch version info');
                const versionData = await versionResponse.json();
                setCurrentVersion(versionData.version);
                setCurrentCommit(versionData.commit);

                // Fetch available backups
                const backupsResponse = await fetch('/api/list-backups');
                if (!backupsResponse.ok) throw new Error('Failed to fetch backups');
                const backupsData = await backupsResponse.json();
                setBackups(backupsData);

            } catch (error) {
                console.error("Could not fetch initial data:", error);
                setStatus('error');
                setErrorMessage((error as Error).message);
            }
        };
        fetchInitialData();
    }, []);

    const handleCheckForUpdates = useCallback(async () => {
        if (currentCommit === 'N/A' || currentCommit === '...') return;
        setStatus('checking');
        setLatestCommitInfo(null);
        setErrorMessage(null);

        try {
            const response = await fetch(`${GITHUB_REPO_API}/commits/${GITHUB_BRANCH}`);
            if (!response.ok) throw new Error(`GitHub API responded with status ${response.status}`);
            const data = await response.json();
            
            setLatestCommitInfo({
                sha: data.sha,
                message: data.commit.message,
                author: data.commit.author.name,
                date: data.commit.author.date,
            });
            
            if (data.sha !== currentCommit) {
                setStatus('update-available');
            } else {
                setStatus('up-to-date');
            }
        } catch (error) {
            console.error("Failed to fetch updates:", error);
            setStatus('error');
            setErrorMessage((error as Error).message);
        }
    }, [currentCommit]);

    const handleUpgrade = useCallback(() => {
        if (!window.confirm("This will update the application and restart the server. Are you sure?")) return;
        setStatus('updating');
        setProcessLog(['Connecting to update server...']);

        const eventSource = new EventSource('/api/update-app');
        eventSource.onmessage = (event) => {
            setProcessLog(prev => [...prev, event.data]);
            if (event.data.startsWith('UPDATE_COMPLETE')) eventSource.close();
        };
        eventSource.onerror = () => {
            setProcessLog(prev => [...prev, "\nConnection lost. This is expected on restart. Please refresh."]);
            eventSource.close();
        };
    }, []);

    const handleRollback = useCallback((filename: string) => {
        if (!window.confirm(`This will restore the backup "${filename}" and restart the server. Are you sure?`)) return;
        setStatus('rolling-back');
        setProcessLog([`Connecting to server to restore ${filename}...`]);

        fetch('/api/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename }),
        }).then(response => {
             const reader = response.body?.getReader();
             const decoder = new TextDecoder();
             const read = () => {
                reader?.read().then(({done, value}) => {
                    if (done) return;
                    // SSE messages are `data: message\n\n`. We need to parse that.
                    const chunk = decoder.decode(value, {stream: true});
                    const messages = chunk.split('\n\n').filter(Boolean);
                    for (const message of messages) {
                        const data = message.replace(/^data: /, '');
                        setProcessLog(prev => [...prev, data]);
                        if (data.startsWith('UPDATE_COMPLETE')) return;
                    }
                    read();
                });
             };
             read();
        }).catch(err => {
            setProcessLog(prev => [...prev, `\nError initiating rollback: ${err.message}`]);
        });
    }, []);

    const isBusy = status === 'checking' || status === 'updating' || status === 'rolling-back';
    
    return (
        <div className="max-w-4xl mx-auto flex flex-col space-y-8">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                 <h2 className="text-2xl font-bold text-slate-100 mb-2">Panel Updater</h2>
                 <p className="text-slate-400 mb-6">Keep your management panel up-to-date with the latest features and security fixes.</p>
                 
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/50 p-4 rounded-md border border-slate-700">
                    <div className="mb-4 sm:mb-0">
                        <p className="text-sm text-slate-400">
                            Current Version: <span className="font-mono bg-slate-700 px-2 py-1 rounded">{currentVersion}</span>
                            <span className="font-mono ml-2 text-xs">({currentCommit.substring(0, 7)})</span>
                        </p>
                        <div className="mt-4 h-6">
                            <StatusDisplay status={status} errorMessage={errorMessage} latestCommitInfo={latestCommitInfo} />
                        </div>
                    </div>
                    {status === 'update-available' ? (
                        <button onClick={handleUpgrade} disabled={isBusy} className="w-full sm:w-auto flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg">
                            <UpdateIcon className="w-5 h-5 mr-2" /> Upgrade Now
                        </button>
                    ) : (
                        <button onClick={handleCheckForUpdates} disabled={isBusy} className="w-full sm:w-auto flex items-center justify-center bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg">
                            <CloudArrowUpIcon className="w-5 h-5 mr-2" /> Check for Updates
                        </button>
                    )}
                 </div>
            </div>

            {(status === 'updating' || status === 'rolling-back') && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-orange-400 mb-4">{status === 'updating' ? 'Upgrade' : 'Rollback'} in Progress...</h3>
                    <pre className="w-full overflow-auto text-sm bg-slate-900 p-4 rounded-md text-slate-300 font-mono whitespace-pre-wrap h-64">
                       {processLog.join('\n')}
                    </pre>
                </div>
            )}
            
            {(latestCommitInfo && (status === 'update-available' || status === 'up-to-date')) && (
                 <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                     <h3 className="text-lg font-semibold text-orange-400 mb-4">Latest Version Information</h3>
                     <div className="border-b border-slate-700 pb-3 mb-3">
                        <p className="text-slate-300 font-bold text-lg whitespace-pre-wrap">{latestCommitInfo.message.split('\n')[0]}</p>
                        <p className="text-slate-500 text-sm">by {latestCommitInfo.author} on {new Date(latestCommitInfo.date).toLocaleDateString()}</p>
                     </div>
                     <pre className="w-full overflow-auto text-sm text-slate-400 font-sans whitespace-pre-wrap max-h-48">
                        {latestCommitInfo.message}
                     </pre>
                </div>
            )}

             <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-bold text-slate-100 mb-4">Available Backups</h2>
                {backups.length > 0 ? (
                    <ul className="divide-y divide-slate-700">
                        {backups.map(backupFile => (
                            <li key={backupFile} className="py-3 flex items-center justify-between">
                                <span className="font-mono text-sm text-slate-300">{backupFile}</span>
                                <button
                                    onClick={() => handleRollback(backupFile)}
                                    disabled={isBusy}
                                    className="px-3 py-1 text-sm font-semibold bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-md transition-colors"
                                >
                                    Restore
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-slate-500 text-center py-4">No backups found. A backup is automatically created before an update.</p>
                )}
             </div>
        </div>
    );
}
