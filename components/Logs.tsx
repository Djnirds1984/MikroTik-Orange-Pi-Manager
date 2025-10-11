
import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, LogEntry } from '../types.ts';
import { getLogs } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, CodeBracketIcon } from '../constants.tsx';

export const Logs: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await getLogs(selectedRouter);
            setLogs(data.reverse()); // Show most recent logs first
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000); // Refresh logs every 15 seconds
        return () => clearInterval(interval);
    }, [fetchData]);
    
    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">Router Logs</h2>
                <p className="mt-2 text-slate-500">Please select a router to view its logs.</p>
            </div>
        );
    }

    if (isLoading && logs.length === 0) {
        return <div className="flex justify-center p-8"><Loader /></div>;
    }

    if (error) {
        return <div className="p-4 bg-red-100 text-red-700">{error}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold flex items-center gap-3"><CodeBracketIcon className="w-8 h-8"/> Logs</h2>
                <button onClick={fetchData} disabled={isLoading} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg font-semibold disabled:opacity-50">
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>
            <div className="bg-slate-900 text-slate-300 font-mono text-xs rounded-lg p-4 h-[70vh] overflow-auto">
                {logs.map((log, index) => (
                    <div key={index} className="flex gap-4">
                        <span className="text-slate-500 flex-shrink-0">{log.time}</span>
                        <span className="text-cyan-400 flex-shrink-0 w-24 truncate">{log.topics}</span>
                        <span className="whitespace-pre-wrap break-all">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
