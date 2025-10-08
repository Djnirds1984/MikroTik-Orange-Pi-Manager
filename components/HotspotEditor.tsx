import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId } from '../types.ts';
import { getHotspotLoginPage, saveHotspotLoginPage } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { ExclamationTriangleIcon } from '../constants.tsx';

export const HotspotEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [htmlContent, setHtmlContent] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'editing' | 'saving' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string>('hotspot');

    const fetchContent = useCallback(async (path: string) => {
        setStatus('loading');
        setError(null);
        try {
            const { content } = await getHotspotLoginPage(selectedRouter, path);
            setHtmlContent(content);
            setStatus('editing');
        } catch (err) {
            setError((err as Error).message);
            setStatus('error');
        }
    }, [selectedRouter]);
    
    const handleFetch = () => {
        if (!selectedPath) {
            alert("Please select a file location.");
            return;
        }
        fetchContent(selectedPath);
    };


    const handleSave = async () => {
        setStatus('saving');
        setError(null);
        try {
            await saveHotspotLoginPage(selectedRouter, htmlContent, selectedPath);
            alert('Hotspot login page saved successfully!');
            setStatus('editing');
        } catch (err) {
            setError((err as Error).message);
            setStatus('error');
            alert(`Failed to save: ${(err as Error).message}`);
        }
    };

    const handleResetAndChangePath = () => {
        setStatus('idle');
        setHtmlContent('');
        setError(null);
    };
    
    if (status === 'idle' || (status === 'loading' && htmlContent === '')) {
        return (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-8 max-w-lg mx-auto text-center">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Select Login Page Location</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">Different RouterOS versions store the `login.html` file in different locations. Please select the correct path for your router model.</p>
                <div className="space-y-4">
                     <div>
                        <label htmlFor="filePath" className="block text-sm font-medium text-slate-700 dark:text-slate-300">File Path</label>
                        <select
                            id="filePath"
                            value={selectedPath}
                            onChange={(e) => setSelectedPath(e.target.value)}
                            className="mt-1 block w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-2 px-3 text-slate-900 dark:text-white font-mono"
                        >
                            <option value="hotspot">hotspot/login.html</option>
                            <option value="flash/hotspot">flash/hotspot/login.html</option>
                        </select>
                    </div>
                    {status === 'loading' ? (
                        <div className="flex justify-center items-center h-10"><Loader/></div>
                    ) : (
                        <button onClick={handleFetch} className="w-full bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-2 px-4 rounded-lg">
                            Fetch File
                        </button>
                    )}
                </div>
            </div>
        );
    }


    if (status === 'error') {
        return (
            <div className="p-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
                <h3 className="font-bold flex items-center gap-2"><ExclamationTriangleIcon className="w-5 h-5" /> Error</h3>
                <p>{error}</p>
                 <div className="mt-4 flex gap-2">
                    <button onClick={() => fetchContent(selectedPath)} className="px-3 py-1 bg-red-100 dark:bg-red-800/50 rounded-md font-semibold">Try Again</button>
                    <button onClick={handleResetAndChangePath} className="px-3 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md font-semibold">Change Path</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Hotspot Login Page Editor</h3>
                    <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{selectedPath}/login.html</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleResetAndChangePath} disabled={status === 'saving'} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-lg font-semibold disabled:opacity-50">Change Path</button>
                    <button onClick={handleSave} disabled={status === 'saving'} className="px-4 py-2 text-sm bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white rounded-lg font-semibold disabled:opacity-50">
                        {status === 'saving' ? 'Saving...' : 'Save to Router'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[60vh] min-h-[500px]">
                {/* Editor */}
                <div className="flex flex-col h-full">
                    <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">HTML Editor</label>
                    <textarea
                        value={htmlContent}
                        onChange={(e) => setHtmlContent(e.target.value)}
                        className="w-full h-full p-2 font-mono text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-[--color-primary-500] focus:outline-none resize-none text-slate-900 dark:text-slate-200"
                        spellCheck="false"
                    />
                </div>
                {/* Preview */}
                <div className="flex flex-col h-full">
                     <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Live Preview</label>
                    <iframe
                        srcDoc={htmlContent}
                        title="Hotspot Login Preview"
                        className="w-full h-full bg-white border border-slate-300 dark:border-slate-700 rounded-md"
                        sandbox="allow-forms allow-scripts allow-same-origin"
                    />
                </div>
            </div>
        </div>
    );
};