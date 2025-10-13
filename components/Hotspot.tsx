import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { 
    RouterConfigWithId, 
    HotspotActiveUser, 
    HotspotHost, 
    HotspotProfile, 
    HotspotUserProfile, 
    IpPool, 
    Interface, 
    SslCertificate, 
    HotspotSetupParams,
    HotspotProfileData,
    HotspotUserProfileData
} from '../types.ts';
import { 
    getHotspotActiveUsers, removeHotspotActiveUser, getHotspotHosts, 
    getHotspotProfiles, addHotspotProfile, updateHotspotProfile, deleteHotspotProfile,
    getHotspotUserProfiles, addHotspotUserProfile, updateHotspotUserProfile, deleteHotspotUserProfile,
    getIpPools, listHotspotFiles, getHotspotFileContent, saveHotspotFileContent, createHotspotFile,
    getInterfaces, getSslCertificates, runHotspotSetup
} from '../services/mikrotikService.ts';
import { generateHotspotSetupScript } from '../services/geminiService.ts';
import { Loader } from './Loader.tsx';
import { RouterIcon, CodeBracketIcon, UsersIcon, ChipIcon, ServerIcon, TrashIcon, EditIcon, ExclamationTriangleIcon } from '../constants.tsx';
import { CodeBlock } from './CodeBlock.tsx';

// --- Helper Components & Functions ---

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


// --- Sub-Component: User Activity ---
const HotspotUserActivity: React.FC<{ 
    selectedRouter: RouterConfigWithId; 
    hosts: HotspotHost[] | null;
    isLoadingHosts: boolean;
    hostsError: string | null;
}> = ({ selectedRouter, hosts, isLoadingHosts, hostsError }) => {
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async (isInitialLoad = false) => {
        if (isInitialLoad) setIsLoading(true);
        setError(null);
        try {
            const users = await getHotspotActiveUsers(selectedRouter);
            setActiveUsers(users);
        } catch (err) {
            setError(`Failed to fetch active users: ${(err as Error).message}`);
        } finally {
            if (isInitialLoad) setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        fetchData(true);
        const interval = setInterval(() => fetchData(false), 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleKickUser = async (userId: string) => {
        if (!window.confirm("Are you sure you want to kick this user?")) return;
        setIsSubmitting(true);
        try {
            await removeHotspotActiveUser(selectedRouter, userId);
            await fetchData(true);
        } catch (err) {
            alert(`Error kicking user: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading || isLoadingHosts) {
        return <div className="flex justify-center p-8"><Loader /></div>;
    }
    
    return (
        <div className="space-y-8">
            {error && <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}
            {hostsError && <div className="p-4 bg-red-50 text-red-700 rounded-md">{hostsError}</div>}
            
            <div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-3">User</th>
                                    <th className="px-6 py-3">Address</th>
                                    <th className="px-6 py-3">MAC Address</th>
                                    <th className="px-6 py-3">Uptime</th>
                                    <th className="px-6 py-3">Data Usage (Down/Up)</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
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
                                            <button onClick={() => handleKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Kick User">
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
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
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">All Hosts ({hosts?.length || 0})</h3>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                           <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-3">MAC Address</th><th className="px-6 py-3">Address</th><th className="px-6 py-3">To Address</th><th className="px-6 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hosts && hosts.length > 0 ? hosts.map(host => (
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


// --- Sub-Component: NodeMCU Vendo ---
const HotspotNodeMcu: React.FC<{ hosts: HotspotHost[] | null }> = ({ hosts }) => {
    const [selectedHost, setSelectedHost] = useState<HotspotHost | null>(null);

    const nodeMcuHosts = useMemo(() => {
        if (!hosts) return [];
        const keywords = ['vendo', 'vendo1', 'pisowifi'];
        return hosts.filter(host => {
            if (!host.comment) return false;
            const lowerCaseComment = host.comment.toLowerCase();
            return keywords.some(keyword => lowerCaseComment.includes(keyword));
        });
    }, [hosts]);

    if (selectedHost) {
        return (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md flex flex-col h-[75vh] min-h-[600px]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Vendo Settings</h3>
                        <p className="text-sm font-mono text-cyan-500">{selectedHost.address}</p>
                    </div>
                    <button onClick={() => setSelectedHost(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-lg font-semibold">&larr; Back to List</button>
                </div>
                <div className="flex-grow p-4">
                    <iframe src={`http://${selectedHost.address}/admin#`} title={`Settings for ${selectedHost.address}`} className="w-full h-full border-2 border-slate-300 dark:border-slate-600 rounded-md" sandbox="allow-forms allow-scripts allow-same-origin" />
                </div>
                 <div className="p-2 border-t border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                    You are viewing the device's web panel directly. All actions inside this frame are performed on the device.
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold flex items-center gap-2"><ChipIcon className="w-6 h-6 text-[--color-primary-500]"/> Detected NodeMCU Vendo Machines</h3>
                <p className="text-sm text-slate-500 mt-1">This list is filtered from Hotspot hosts to show devices with a comment containing 'vendo', 'vendo1', or 'pisowifi'.</p>
            </div>
            <ul role="list" className="divide-y divide-slate-200 dark:divide-slate-700">
                {nodeMcuHosts.length > 0 ? (
                    nodeMcuHosts.map(host => (
                         <li key={host.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <ChipIcon className="h-8 w-8 text-[--color-primary-500] dark:text-[--color-primary-400]" />
                                <div>
                                    <p className="font-semibold text-slate-900 dark:text-slate-100 font-mono">{host.address}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{host.macAddress}</p>
                                    {host.comment && <p className="text-xs text-slate-400 italic mt-1">Comment: {host.comment}</p>}
                                </div>
                            </div>
                            <button onClick={() => setSelectedHost(host)} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md font-semibold">Settings</button>
                        </li>
                    ))
                ) : (
                    <li className="p-6 text-center text-slate-500">
                        No Vendo machines detected among the active Hotspot hosts with a matching comment.
                    </li>
                )}
            </ul>
        </div>
    );
};

// --- Sub-Component: Hotspot Editor ---
const HotspotEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [path, setPath] = useState<string[]>(['hotspot']);
    const [files, setFiles] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<any | null>(null);
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<'browsing' | 'loading_list' | 'loading_content' | 'editing' | 'saving-edit' | 'saving-upload' | 'error'>('loading_list');
    const [error, setError] = useState<string | null>(null);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const currentPath = path.join('/');

    const fetchFiles = useCallback(async (p: string) => {
        setStatus('loading_list');
        setError(null);
        try {
            const fileList = await listHotspotFiles(selectedRouter, p);
            setFiles(fileList);
            setStatus('browsing');
        } catch (err) {
            setError(`Failed to list files in '${p}': ${(err as Error).message}`);
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
            const { content: fileContent } = await getHotspotFileContent(selectedRouter, file.name);
            setContent(fileContent);
            setStatus('editing');
        } catch (err) {
            setError(`Failed to load content for '${file.name}': ${(err as Error).message}`);
            setStatus('error');
            setSelectedFile(null);
        }
    };

    const handleDirClick = (dirName: string) => setPath(prev => [...prev, dirName]);
    const handleBreadcrumbClick = (index: number) => setPath(prev => prev.slice(0, index + 1));

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
        setFileToUpload(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null);
    };

    const handleUpload = async () => {
        if (!fileToUpload) { alert("Please select a file to upload."); return; }
        const fullPath = `${currentPath}/${fileToUpload.name}`;
        const existingFile = files.find(f => f.name === fullPath);
        if (existingFile && !window.confirm(`File "${fileToUpload.name}" already exists. Overwrite it?`)) return;
        
        setStatus('saving-upload');
        setError(null);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const textContent = event.target?.result as string;
                if (existingFile) await saveHotspotFileContent(selectedRouter, existingFile.id, textContent);
                else await createHotspotFile(selectedRouter, fullPath, textContent);
                alert('File uploaded successfully!');
                await fetchFiles(currentPath);
                setFileToUpload(null);
                if (uploadInputRef.current) uploadInputRef.current.value = "";
                setStatus('browsing');
            } catch (err) { setError(`Upload failed: ${(err as Error).message}`); setStatus('error'); }
        };
        reader.onerror = () => { setError("Failed to read the selected file."); setStatus('error'); };
        reader.readAsText(fileToUpload);
    };

    if (status === 'editing' || status === 'saving-edit') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-semibold">Editing File</h3>
                        <p className="text-sm font-mono text-slate-500">{selectedFile?.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => { setSelectedFile(null); setStatus('browsing'); }} disabled={status === 'saving-edit'} className="px-4 py-2 text-sm bg-slate-200 rounded-lg font-semibold disabled:opacity-50">Back</button>
                        <button onClick={handleSave} disabled={status === 'saving-edit'} className="px-4 py-2 text-sm bg-[--color-primary-600] text-white rounded-lg font-semibold disabled:opacity-50">{status === 'saving-edit' ? 'Saving...' : 'Save'}</button>
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
                    {path.map((p, i) => (<span key={i}><button onClick={() => handleBreadcrumbClick(i)} className="hover:underline">{p}</button>{i < path.length - 1 && ' / '}</span>))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <input ref={uploadInputRef} type="file" onChange={handleFileSelect} className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-200 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-300 dark:hover:file:bg-slate-500" />
                    <button onClick={handleUpload} disabled={!fileToUpload || status === 'saving-upload'} className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold disabled:opacity-50">{status === 'saving-upload' ? 'Uploading...' : 'Upload'}</button>
                </div>
            </div>
            {(status === 'loading_list' || status === 'loading_content' || status === 'saving-upload') && <div className="flex justify-center p-8"><Loader /></div>}
            {status === 'error' && <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}
            {status === 'browsing' && (
                <ul className="space-y-1">
                    {files.map(file => (<li key={file.id}><button onClick={() => file.type === 'directory' ? handleDirClick(file.name) : handleFileClick(file)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left">{file.type === 'directory' ? <FolderIcon className="w-5 h-5 text-yellow-500" /> : <FileIcon className="w-5 h-5 text-slate-500" />}<span className="font-medium text-slate-800 dark:text-slate-200">{file.name}</span></button></li>))}
                </ul>
            )}
        </div>
    );
};

// --- Sub-Component: Server Profiles ---
const HotspotServerProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg"><h2 className="text-2xl font-bold">Server Profiles</h2><p className="mt-2 text-slate-600 dark:text-slate-400">Hotspot Server Profiles management is not yet implemented.</p></div>;
};

// --- Sub-Component: User Profiles ---
const HotspotUserProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg"><h2 className="text-2xl font-bold">User Profiles</h2><p className="mt-2 text-slate-600 dark:text-slate-400">Hotspot User Profiles management is not yet implemented.</p></div>;
};

// --- Sub-Component: Installer ---
const getPoolFromNetwork = (network: string): string => {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(network)) return '';
    const [ip, cidrStr] = network.split('/');
    const ipParts = ip.split('.').map(Number);
    const cidr = parseInt(cidrStr, 10);
    if (cidr < 8 || cidr > 30) return '';
    const startIp = [...ipParts];
    startIp[3]++;
    const ipAsInt = (ipParts[0] << 24 | ipParts[1] << 16 | ipParts[2] << 8 | ipParts[3]) >>> 0;
    const subnetMask = (0xffffffff << (32 - cidr)) >>> 0;
    const networkAddress = ipAsInt & subnetMask;
    const broadcastAddress = networkAddress | ~subnetMask;
    const endIpParts = [(broadcastAddress >> 24) & 255, (broadcastAddress >> 16) & 255, (broadcastAddress >> 8) & 255, (broadcastAddress & 255) - 1];
    return `${startIp.join('.')}-${endIpParts.join('.')}`;
};

const HotspotInstaller: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [setupMethod, setSetupMethod] = useState<'ai' | 'smart'>('smart');
    const [params, setParams] = useState<HotspotSetupParams>({ hotspotInterface: '', localAddress: '10.5.50.1/24', addressPool: '10.5.50.2-10.5.50.254', sslCertificate: 'none', dnsServers: '8.8.8.8, 1.1.1.1', dnsName: 'hotspot.login', hotspotUser: 'admin', hotspotPass: '1234' });
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [certificates, setCertificates] = useState<SslCertificate[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [script, setScript] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoadingData(true); setError(null);
        try {
            const [ifaces, certs] = await Promise.all([getInterfaces(selectedRouter), getSslCertificates(selectedRouter)]);
            setInterfaces(ifaces);
            setCertificates(certs.filter(c => !c.name.includes('*')));
            if (ifaces.length > 0 && !params.hotspotInterface) {
                const defaultIface = ifaces.find(i => i.type === 'bridge' && i.name.toLowerCase().includes('lan'))?.name || ifaces.find(i => i.type === 'bridge')?.name || ifaces[0].name;
                setParams(p => ({ ...p, hotspotInterface: defaultIface }));
            }
        } catch (err) { setError(`Failed to fetch initial data: ${(err as Error).message}`); }
        finally { setIsLoadingData(false); }
    }, [selectedRouter, params.hotspotInterface]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setParams(p => {
            const newParams = { ...p, [name]: value };
            if (name === 'localAddress') newParams.addressPool = getPoolFromNetwork(value);
            return newParams;
        });
    };

    const handleRun = async () => {
        setIsWorking(true); setScript(''); setStatusMessage(null); setError(null);
        if (setupMethod === 'ai') {
            try { setScript(await generateHotspotSetupScript(params)); }
            catch (err) { setScript(`# Error generating script: ${(err as Error).message}`); }
        } else {
            try { setStatusMessage("Starting Hotspot setup on router..."); const result = await runHotspotSetup(selectedRouter, params); setStatusMessage(result.message); }
            catch (err) { setError(`Setup failed: ${(err as Error).message}`); }
        }
        setIsWorking(false);
    };

    if (isLoadingData) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error && !isWorking) return <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md">{error}</div>;

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
            <div className="p-4 border-b"><h3 className="text-lg font-semibold text-[--color-primary-500]">Hotspot Server Setup Assistant</h3></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                <div className="space-y-4">
                    <div><label>Hotspot Interface</label><select name="hotspotInterface" value={params.hotspotInterface} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md">{interfaces.map(i => <option key={i.name}>{i.name}</option>)}</select></div>
                    <div><label>Local Address</label><input name="localAddress" value={params.localAddress} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                    <div><label>Address Pool</label><input name="addressPool" value={params.addressPool} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                    <div><label>SSL Certificate</label><select name="sslCertificate" value={params.sslCertificate} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md"><option value="none">none</option>{certificates.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                    <div><label>DNS Servers</label><input name="dnsServers" value={params.dnsServers} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                    <div><label>DNS Name</label><input name="dnsName" value={params.dnsName} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label>Admin User</label><input name="hotspotUser" value={params.hotspotUser} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                        <div><label>Password</label><input name="hotspotPass" value={params.hotspotPass} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 rounded-md" /></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Method</label>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-1"><button onClick={() => setSetupMethod('smart')} className={`w-full rounded-md py-2 px-3 text-sm font-medium ${setupMethod === 'smart' ? 'bg-white text-[--color-primary-600]' : 'text-slate-600'}`}>Smart Installer</button><button onClick={() => setSetupMethod('ai')} className={`w-full rounded-md py-2 px-3 text-sm font-medium ${setupMethod === 'ai' ? 'bg-white text-[--color-primary-600]' : 'text-slate-600'}`}>AI Script</button></div>
                    </div>
                    <button onClick={handleRun} disabled={isWorking} className="w-full bg-[--color-primary-600] text-white font-bold py-3 rounded-lg disabled:opacity-50">{isWorking ? 'Working...' : (setupMethod === 'ai' ? 'Generate Script' : 'Run Setup')}</button>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 border min-h-[300px] relative">
                        {isWorking && <div className="absolute inset-0 bg-slate-50/80 flex items-center justify-center"><Loader /></div>}
                        {setupMethod === 'ai' ? (<CodeBlock script={script || '# Script will appear here.'} />) : (<div className="p-4 text-sm">{statusMessage && <p className="text-green-600">{statusMessage}</p>}{error && <p className="text-red-600">{error}</p>}{!statusMessage && !error && <p className="text-slate-500">Click "Run Smart Setup" to begin.</p>}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---

export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'activity' | 'nodemcu' | 'editor' | 'profiles' | 'user-profiles' | 'setup'>('activity');
    const [hosts, setHosts] = useState<HotspotHost[] | null>(null);
    const [isLoadingHosts, setIsLoadingHosts] = useState(false);
    const [hostsError, setHostsError] = useState<string | null>(null);

    const fetchHosts = useCallback(async () => {
        if (!selectedRouter) return;
        setIsLoadingHosts(true);
        setHostsError(null);
        try {
            const hostsData = await getHotspotHosts(selectedRouter);
            setHosts(hostsData);
        } catch (err) {
            setHostsError(`Could not fetch device hosts: ${(err as Error).message}`);
        } finally {
            setIsLoadingHosts(false);
        }
    }, [selectedRouter]);

    useEffect(() => {
        if (selectedRouter && (activeTab === 'activity' || activeTab === 'nodemcu')) {
            fetchHosts();
        }
    }, [selectedRouter, activeTab, fetchHosts]);

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
            case 'activity': return <HotspotUserActivity selectedRouter={selectedRouter} hosts={hosts} isLoadingHosts={isLoadingHosts} hostsError={hostsError} />;
            case 'nodemcu': return <HotspotNodeMcu hosts={hosts} />;
            case 'editor': return <HotspotEditor selectedRouter={selectedRouter} />;
            case 'profiles': return <HotspotServerProfilesManager selectedRouter={selectedRouter} />;
            case 'user-profiles': return <HotspotUserProfilesManager selectedRouter={selectedRouter} />;
            case 'setup': return <HotspotInstaller selectedRouter={selectedRouter} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
             <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2 -mb-px overflow-x-auto" aria-label="Tabs">
                    <TabButton label="User Activity" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
                    <TabButton label="NodeMCU Vendo" icon={<ChipIcon className="w-5 h-5"/>} isActive={activeTab === 'nodemcu'} onClick={() => setActiveTab('nodemcu')} />
                    <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5"/>} isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    <TabButton label="Server Profiles" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'profiles'} onClick={() => setActiveTab('profiles')} />
                    <TabButton label="User Profiles" icon={<UsersIcon className="w-5 h-5"/>} isActive={activeTab === 'user-profiles'} onClick={() => setActiveTab('user-profiles')} />
                    <TabButton label="Server Setup" icon={<ServerIcon className="w-5 h-5"/>} isActive={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
                </nav>
            </div>
            <div>
                {renderTabContent()}
            </div>
        </div>
    );
};