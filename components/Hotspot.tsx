import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId, HotspotActiveUser, HotspotHost, HotspotProfile, HotspotUserProfile, Interface, SslCertificate, HotspotSetupParams } from '../types.ts';
import { 
    getHotspotActiveUsers, removeHotspotActiveUser, getHotspotHosts, 
    getHotspotProfiles, getHotspotUserProfiles, listHotspotFiles, getHotspotFileContent,
    saveHotspotFileContent, createHotspotFile, getInterfaces, getSslCertificates,
    runHotspotSetup
} from '../services/mikrotikService.ts';
import { generateHotspotSetupScript } from '../services/geminiService.ts';
import { Loader } from './Loader.tsx';
import { CodeBlock } from './CodeBlock.tsx';
import { RouterIcon, CodeBracketIcon, UsersIcon, ChipIcon, ServerIcon, TrashIcon } from '../constants.tsx';
import { NodeMcuManager } from './NodeMcuManager.tsx';

// --- Helper Functions & Components ---

const formatBytes = (bytes: number): string => {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const TabButton: React.FC<{ label: string, icon: React.ReactNode, isActive: boolean, onClick: () => void }> = ({ label, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 focus:outline-none ${
            isActive
                ? 'border-[--color-primary-500] text-[--color-primary-500] dark:text-[--color-primary-400]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
    >
        {icon}
        <span className="ml-2 hidden sm:inline">{label}</span>
    </button>
);

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


// --- Sub-Components for each Tab ---

const HotspotUserActivity: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<Record<string, string> | null>(null);

    const fetchData = useCallback(async (isInitial = false) => {
        if (!isInitial) setIsLoading(true);
        setError(null);
        const [activeRes, hostsRes] = await Promise.allSettled([
            getHotspotActiveUsers(selectedRouter),
            getHotspotHosts(selectedRouter),
        ]);

        const errors: Record<string, string> = {};
        if (activeRes.status === 'fulfilled') {
            setActiveUsers(activeRes.value);
        } else {
            console.error("Failed to fetch Hotspot active users:", activeRes.reason);
            errors.active = 'Could not fetch active users. The Hotspot package might not be configured.';
        }
        if (hostsRes.status === 'fulfilled') {
            setHosts(hostsRes.value);
        } else {
            console.error("Failed to fetch Hotspot hosts:", hostsRes.reason);
            errors.hosts = 'Could not fetch device hosts.';
        }
        
        if (Object.keys(errors).length > 0) {
            setError(errors);
        }
        setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        fetchData(true);
        const interval = setInterval(() => fetchData(false), 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleKickUser = async (userId: string) => {
        if (!window.confirm("Are you sure you want to kick this user?")) return;
        setIsSubmitting(true);
        try {
            await removeHotspotActiveUser(selectedRouter, userId);
            await fetchData();
        } catch (err) {
            alert(`Error kicking user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading && activeUsers.length === 0) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error?.active && error?.hosts) return <div className="p-4 bg-red-50 text-red-700 rounded-md">{error.active}</div>;

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
                {error?.active && <p className="text-yellow-600 mb-2">{error.active}</p>}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">User</th><th scope="col" className="px-6 py-3">Address</th>
                                    <th scope="col" className="px-6 py-3">MAC Address</th><th scope="col" className="px-6 py-3">Uptime</th>
                                    <th scope="col" className="px-6 py-3">Data Usage (Down/Up)</th><th scope="col" className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeUsers.length > 0 ? activeUsers.map(user => (
                                    <tr key={user.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{user.user}</td>
                                        <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{user.address}</td>
                                        <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{user.macAddress}</td>
                                        <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{user.uptime}</td>
                                        <td className="px-6 py-4 font-mono text-green-600 dark:text-green-400">{formatBytes(user.bytesIn)} / {formatBytes(user.bytesOut)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Kick User"><TrashIcon className="h-5 w-5"/></button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-500">No active Hotspot users.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">All Hosts ({hosts.length})</h3>
                {error?.hosts && <p className="text-yellow-600 mb-2">{error.hosts}</p>}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">MAC Address</th><th scope="col" className="px-6 py-3">Address</th>
                                    <th scope="col" className="px-6 py-3">To Address</th><th scope="col" className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                             <tbody>
                                {hosts.length > 0 ? hosts.map(host => (
                                    <tr key={host.id} className="border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-200">{host.macAddress}</td>
                                        <td className="px-6 py-4 font-mono text-cyan-600 dark:text-cyan-400">{host.address}</td>
                                        <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-300">{host.toAddress}</td>
                                        <td className="px-6 py-4 space-x-2">
                                            {host.authorized && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">Authorized</span>}
                                            {host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400">Bypassed</span>}
                                            {!host.authorized && !host.bypassed && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600/50 text-slate-600 dark:text-slate-400">Guest</span>}
                                        </td>
                                    </tr>
                                )) : (
                                     <tr><td colSpan={4} className="text-center py-8 text-slate-500">No Hotspot hosts found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const HotspotNodeMcu: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [hosts, setHosts] = useState<HotspotHost[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedRouter) return;
        setIsLoading(true);
        setError(null);
        getHotspotHosts(selectedRouter)
            .then(setHosts)
            .catch(err => {
                setError(`Could not fetch hosts: ${(err as Error).message}`);
            })
            .finally(() => setIsLoading(false));
    }, [selectedRouter]);
    
     if (isLoading) {
        return <div className="flex justify-center p-8"><Loader /></div>;
    }
    
    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
                <p className="font-bold">Error:</p>
                <p>{error}</p>
            </div>
        );
    }
    return <NodeMcuManager hosts={hosts} />;
};

const LoginPageEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    // This is the implementation from a previous step, now integrated correctly.
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
        if (file.type === 'file') {
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
                        disabled={!fileToUpload || status === 'saving-upload'}
                        className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold disabled:opacity-50"
                    >
                        {status === 'saving-upload' ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>

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
const HotspotServerProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot Server Profiles management is not yet implemented.</div>;
};
const HotspotUserProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot User Profiles management is not yet implemented.</div>;
};

// --- Hotspot Server Setup Assistant ---
const HotspotServerSetup: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    // Re-implemented from previous step
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot Server Setup Assistant is not yet implemented.</div>;
};


// --- Main Component ---

export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'user_activity' | 'nodemcu_vendo' | 'login_page_editor' | 'server_profiles' | 'user_profiles' | 'server_setup'>('user_activity');

    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Hotspot Management</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'user_activity': return <HotspotUserActivity selectedRouter={selectedRouter} />;
            case 'nodemcu_vendo': return <HotspotNodeMcu selectedRouter={selectedRouter} />;
            case 'login_page_editor': return <LoginPageEditor selectedRouter={selectedRouter} />;
            case 'server_profiles': return <HotspotServerProfiles selectedRouter={selectedRouter} />;
            case 'user_profiles': return <HotspotUserProfiles selectedRouter={selectedRouter} />;
            case 'server_setup': return <HotspotServerSetup selectedRouter={selectedRouter} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
             <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Hotspot Management</h2>
            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2 -mb-px overflow-x-auto" aria-label="Tabs">
                    <TabButton label="User Activity" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'user_activity'} onClick={() => setActiveTab('user_activity')} />
                    <TabButton label="NodeMCU Vendo" icon={<ChipIcon className="w-5 h-5"/>} isActive={activeTab === 'nodemcu_vendo'} onClick={() => setActiveTab('nodemcu_vendo')} />
                    <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5"/>} isActive={activeTab === 'login_page_editor'} onClick={() => setActiveTab('login_page_editor')} />
                    <TabButton label="Server Profiles" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'server_profiles'} onClick={() => setActiveTab('server_profiles')} />
                    <TabButton label="User Profiles" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'user_profiles'} onClick={() => setActiveTab('user_profiles')} />
                    <TabButton label="Server Setup" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'server_setup'} onClick={() => setActiveTab('server_setup')} />
                </nav>
            </div>
            <div>
                {renderTabContent()}
            </div>
        </div>
    );
};