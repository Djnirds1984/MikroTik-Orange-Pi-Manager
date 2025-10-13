import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId } from '../types.ts';
import { listHotspotFiles, getHotspotFileContent, saveHotspotFileContent, createHotspotFile } from '../services/mikrotikService.ts';
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
    const [path, setPath] = useState<string[]>(['hotspot']);
    const [files, setFiles] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<any | null>(null);
    const [content, setContent] = useState('');
    // FIX: Split 'saving' status into 'saving-edit' and 'saving-upload' to distinguish contexts and resolve type errors.
    const [status, setStatus] = useState<'browsing' | 'loading_list' | 'loading_content' | 'editing' | 'saving-edit' | 'saving-upload' | 'error'>('loading_list');
    const [error, setError] = useState<string | null>(null);
    
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

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
            const { content } = await getHotspotFileContent(selectedRouter, file.name);
            setContent(content);
            setStatus('editing');
        } catch (err) {
             setError(`Failed to load content for '${file.name}': ${(err as Error).message}`);
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
        setStatus('saving-edit');
        setError(null);
        try {
            await saveHotspotFileContent(selectedRouter, selectedFile.id, content);
            alert('File saved successfully!');
            setStatus('editing');
        } catch (err) {
             setError(`Failed to save '${selectedFile.name}': ${(err as Error).message}`);
             setStatus('error');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFileToUpload(e.target.files[0]);
        } else {
            setFileToUpload(null);
        }
    };

    const handleUpload = async () => {
        if (!fileToUpload) {
            alert("Please select a file to upload.");
            return;
        }

        const fullPath = `${currentPath}/${fileToUpload.name}`;
        const existingFile = files.find(f => f.name === fullPath);

        if (existingFile && !window.confirm(`File "${fileToUpload.name}" already exists. Overwrite it?`)) {
            return;
        }
        
        setStatus('saving-upload');
        setError(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const textContent = event.target?.result as string;
                if (existingFile) {
                    await saveHotspotFileContent(selectedRouter, existingFile.id, textContent);
                } else {
                    await createHotspotFile(selectedRouter, fullPath, textContent);
                }

                alert('File uploaded successfully!');
                await fetchFiles(currentPath);
                
                setFileToUpload(null);
                if (uploadInputRef.current) {
                    uploadInputRef.current.value = "";
                }
                setStatus('browsing');
            } catch (err) {
                setError(`Upload failed: ${(err as Error).message}`);
                setStatus('error');
            }
        };
        reader.onerror = () => {
            setError("Failed to read the selected file.");
            setStatus('error');
        };

        reader.readAsText(fileToUpload);
    };
    
    // FIX: Change status check to 'saving-edit' for this UI block.
    if (status === 'editing' || status === 'saving-edit') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Editing File</h3>
                        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{selectedFile?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedFile(null); setStatus('browsing'); }} disabled={status === 'saving-edit'} className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded-lg font-semibold disabled:opacity-50">Back to Files</button>
                        {/* FIX: Change status check and text to 'saving-edit'. */}
                        <button onClick={handleSave} disabled={status === 'saving-edit'} className="px-4 py-2 text-sm bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white rounded-lg font-semibold disabled:opacity-50">
                            {status === 'saving-edit' ? 'Saving...' : 'Save File'}
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
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                <div className="text-sm text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md overflow-x-auto whitespace-nowrap">
                    {path.map((p, i) => (
                        <span key={i}>
                            <button onClick={() => handleBreadcrumbClick(i)} className="hover:underline">{p}</button>
                            {i < path.length - 1 && ' / '}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <input 
                        ref={uploadInputRef}
                        type="file" 
                        onChange={handleFileSelect}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-200 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-300 dark:hover:file:bg-slate-500"
                    />
                    <button 
                        onClick={handleUpload} 
                        // FIX: Change status check to 'saving-upload'.
                        disabled={!fileToUpload || status === 'saving-upload'}
                        className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold disabled:opacity-50"
                    >
                        {/* FIX: Change status check and text to 'saving-upload'. */}
                        {status === 'saving-upload' ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>

            {/* FIX: Add 'saving-upload' to loader condition. */}
            {(status === 'loading_list' || status === 'loading_content' || status === 'saving-upload') && <div className="flex justify-center p-8"><Loader /></div>}
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