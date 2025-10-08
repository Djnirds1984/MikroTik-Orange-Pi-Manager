import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId } from '../types.ts';
import { listHotspotFiles, getHotspotFileContent, saveHotspotFileContent } from '../services/mikrotikService.ts';
import { Loader } from './Loader.tsx';
import { ExclamationTriangleIcon } from '../constants.tsx';

const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
);

const FileIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);


export const HotspotEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [path, setPath] = useState<string[]>(['flash']);
    const [files, setFiles] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<{ name: string; fullName: string } | null>(null);
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<'browsing' | 'loading_list' | 'loading_content' | 'editing' | 'saving' | 'error'>('loading_list');
    const [error, setError] = useState<string | null>(null);
    
    const currentPath = path.join('/');

    const fetchFiles = useCallback(async (currentPath: string) => {
        setStatus('loading_list');
        setError(null);
        try {
            const fileList = await listHotspotFiles(selectedRouter, currentPath);
            setFiles(fileList);
            setStatus('browsing');
        } catch (err) {
            setError(`Failed to list files in '${currentPath}': ${(err as Error).message}`);
            setStatus('error');
        }
    }, [selectedRouter]);
    
    useEffect(() => {
        fetchFiles(currentPath);
    }, [currentPath, fetchFiles]);
    
    const handleFileClick = async (file: any) => {
        if (file.type !== 'file') return;
        setStatus('loading_content');
        setError(null);
        setSelectedFile(file);
        try {
            const { content } = await getHotspotFileContent(selectedRouter, file.fullName);
            setContent(content);
            setStatus('editing');
        } catch (err) {
             setError(`Failed to load content for '${file.fullName}': ${(err as Error).message}`);
             setStatus('error');
             setSelectedFile(null);
        }
    };

    const handleDirClick = (dirName: string) => {
        setPath(prev => [...prev, dirName]);
    };
    
    const handleBreadcrumbClick = (index: number) => {
        setPath(prev => prev.slice(0, index + 1));
    };

    const handleSave = async () => {
        if (!selectedFile) return;
        setStatus('saving');
        setError(null);
        try {
            await saveHotspotFileContent(selectedRouter, selectedFile.fullName, content);
            alert('File saved successfully!');
            setStatus('editing');
        } catch (err) {
             setError(`Failed to save '${selectedFile.fullName}': ${(err as Error).message}`);
             setStatus('error');
        }
    };
    
    if (status === 'editing' || status === 'saving') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Editing File</h3>
                        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{selectedFile?.fullName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedFile(null); setStatus('browsing'); }} disabled={status === 'saving'} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-lg font-semibold disabled:opacity-50">Back to Files</button>
                        <button onClick={handleSave} disabled={status === 'saving'} className="px-4 py-2 text-sm bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white rounded-lg font-semibold disabled:opacity-50">
                            {status === 'saving' ? 'Saving...' : 'Save File'}
                        </button>
                    </div>
                </div>
                {error && <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[60vh] min-h-[500px]">
                    <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full h-full p-2 font-mono text-xs bg-white dark:bg-slate-900 border rounded-md resize-none" spellCheck="false" />
                    <iframe srcDoc={content} title="Preview" className="w-full h-full bg-white border rounded-md" sandbox="allow-forms allow-scripts allow-same-origin" />
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">Hotspot File Browser</h3>
            <div className="text-sm text-slate-500 dark:text-slate-400 font-mono mb-4 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md">
                {path.map((p, i) => (
                    <span key={i}>
                        <button onClick={() => handleBreadcrumbClick(i)} className="hover:underline">{p}</button>
                        {i < path.length - 1 && ' / '}
                    </span>
                ))}
            </div>

            {status === 'loading_list' && <div className="flex justify-center p-8"><Loader /></div>}
            {status === 'error' && <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

            {status === 'browsing' && (
                <ul className="space-y-1">
                    {files.map(file => (
                        <li key={file.id}>
                            <button 
                                onClick={() => file.type === 'directory' ? handleDirClick(file.name) : handleFileClick(file)}
                                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left"
                            >
                                {file.type === 'directory' 
                                    ? <FolderIcon className="w-5 h-5 text-yellow-500" />
                                    : <FileIcon className="w-5 h-5 text-slate-500" />
                                }
                                <span className="font-medium text-slate-800 dark:text-slate-200">{file.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};