
import React, { useState, useEffect, useCallback } from 'react';
import type { GitHubRelease } from '../types.ts';
import { Loader } from './Loader.tsx';
import { CloudArrowUpIcon, UpdateIcon, CheckCircleIcon, ExclamationTriangleIcon } from '../constants.tsx';

const GITHUB_REPO = "Djnirds1984/MikroTik-Orange-Pi-Manager";

type Status = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error' | 'updating';

const StatusDisplay: React.FC<{ status: Status, errorMessage?: string | null, latestVersion?: string | null }> = ({ status, errorMessage, latestVersion }) => {
    switch (status) {
        case 'checking':
            return (
                <div className="flex items-center text-orange-400">
                    <Loader />
                    <span className="ml-3">Checking for updates on GitHub...</span>
                </div>
            );
        case 'up-to-date':
            return (
                <div className="flex items-center text-green-400">
                    <CheckCircleIcon className="w-6 h-6" />
                    <span className="ml-3 font-semibold">You are on the latest version.</span>
                </div>
            );
        case 'update-available':
            return (
                <div className="flex items-center text-cyan-400">
                    <UpdateIcon className="w-6 h-6" />
                    <span className="ml-3 font-semibold">A new version ({latestVersion}) is available!</span>
                </div>
            );
        case 'error':
             return (
                <div className="flex items-center text-red-400">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                    <span className="ml-3 font-semibold">Error: {errorMessage || "Could not fetch update information."}</span>
                </div>
            );
        case 'idle':
        default:
            return <p className="text-slate-500">Check for the latest version of the management panel.</p>;
    }
}

export const Updater: React.FC = () => {
    const [status, setStatus] = useState<Status>('idle');
    const [currentVersion, setCurrentVersion] = useState<string>('?.?.?');
    const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [updateLog, setUpdateLog] = useState<string[]>([]);
    
    useEffect(() => {
        // Fetch the current version from the backend when the component mounts
        const fetchVersion = async () => {
            try {
                const response = await fetch('/api/current-version');
                if (!response.ok) throw new Error('Failed to fetch version');
                const data = await response.json();
                setCurrentVersion(data.version);
            } catch (error) {
                console.error("Could not fetch current version:", error);
                setCurrentVersion('Error');
            }
        };
        fetchVersion();
    }, []);

    const handleCheckForUpdates = useCallback(async () => {
        if (currentVersion === 'Error' || currentVersion === '?.?.?') return;
        setStatus('checking');
        setLatestRelease(null);
        setErrorMessage(null);

        try {
            const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
            if (!response.ok) {
                throw new Error(`GitHub API responded with status ${response.status}`);
            }
            const data: GitHubRelease = await response.json();
            setLatestRelease(data);
            
            const latestVersion = data.tag_name.replace('v', '');
            if (latestVersion > currentVersion) {
                setStatus('update-available');
            } else {
                setStatus('up-to-date');
            }

        } catch (error) {
            console.error("Failed to fetch updates:", error);
            setStatus('error');
            setErrorMessage((error as Error).message);
        }
    }, [currentVersion]);

    const handleUpgrade = useCallback(() => {
        setStatus('updating');
        setUpdateLog(['Connecting to update server...']);

        const eventSource = new EventSource('/api/update-app');

        eventSource.onmessage = (event) => {
            if (event.data.startsWith('UPDATE_COMPLETE')) {
                 setUpdateLog(prev => [...prev, `\n${event.data.replace('UPDATE_COMPLETE: ', '')}`]);
                 eventSource.close();
            } else {
                setUpdateLog(prev => [...prev, event.data]);
            }
        };

        eventSource.onerror = () => {
            // This will likely trigger when the server restarts
            setUpdateLog(prev => [...prev, "\nConnection to server lost. This is expected if the update was successful."]);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);


    const isBusy = status === 'checking' || status === 'updating';
    const renderActionButton = () => {
        if (status === 'update-available') {
            return (
                <button
                    onClick={handleUpgrade}
                    disabled={isBusy}
                    className="w-full sm:w-auto flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
                >
                    <UpdateIcon className="w-5 h-5 mr-2" />
                    Upgrade Now
                </button>
            )
        }
        return (
             <button
                onClick={handleCheckForUpdates}
                disabled={isBusy}
                className="w-full sm:w-auto flex items-center justify-center bg-orange-600 hover:bg-orange-500 disabled:bg-orange-800 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
            >
                <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                Check for Updates
            </button>
        )
    }

    return (
        <div className="max-w-4xl mx-auto flex flex-col space-y-8">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                 <h2 className="text-2xl font-bold text-slate-100 mb-2">Panel Updater</h2>
                 <p className="text-slate-400 mb-6">Keep your management panel up-to-date with the latest features and security fixes directly from the official GitHub repository.</p>
                 
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/50 p-4 rounded-md border border-slate-700">
                    <div className="mb-4 sm:mb-0">
                        <p className="text-sm text-slate-400">Current Version: <span className="font-mono bg-slate-700 px-2 py-1 rounded">{currentVersion}</span></p>
                        <div className="mt-4 h-6">
                            <StatusDisplay status={status} errorMessage={errorMessage} latestVersion={latestRelease?.tag_name} />
                        </div>
                    </div>
                    {renderActionButton()}
                 </div>
            </div>
            
            {status === 'updating' && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-orange-400 mb-4">Upgrade in Progress...</h3>
                    <pre className="w-full overflow-auto text-sm bg-slate-900 p-4 rounded-md text-slate-300 font-mono whitespace-pre-wrap h-64">
                       {updateLog.join('\n')}
                    </pre>
                </div>
            )}

            {latestRelease && (status === 'update-available' || status === 'up-to-date') && (
                 <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                     <h3 className="text-lg font-semibold text-orange-400 mb-4">Latest Release Information</h3>
                     <div className="border-b border-slate-700 pb-3 mb-3">
                        <p className="text-slate-300 font-bold text-xl">{latestRelease.name}</p>
                        <p className="text-slate-500 text-sm">Published on {new Date(latestRelease.published_at).toLocaleDateString()}</p>
                     </div>
                     <h4 className="text-md font-semibold text-slate-300 mb-2">Changelog:</h4>
                     <pre className="w-full overflow-auto text-sm bg-slate-900/50 p-4 rounded-md text-slate-300 font-sans whitespace-pre-wrap max-h-96">
                        {latestRelease.body}
                     </pre>
                </div>
            )}
        </div>
    );
}