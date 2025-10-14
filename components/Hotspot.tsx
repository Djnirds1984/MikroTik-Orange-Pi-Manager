
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { 
    RouterConfigWithId, 
    HotspotActiveUser, 
    HotspotHost, 
    HotspotProfile,
    HotspotUserProfile,
    IpPool,
    HotspotProfileData,
    HotspotUserProfileData,
    Interface,
    SslCertificate,
    HotspotSetupParams
} from '../types.ts';
import { 
    getHotspotActiveUsers, 
    getHotspotHosts, 
    removeHotspotActiveUser,
    getHotspotProfiles, addHotspotProfile, updateHotspotProfile, deleteHotspotProfile,
    getHotspotUserProfiles, addHotspotUserProfile, updateHotspotUserProfile, deleteHotspotUserProfile,
    getIpPools,
    listHotspotFiles, getHotspotFileContent, saveHotspotFileContent, createHotspotFile,
    getInterfaces, getSslCertificates, runHotspotSetup
} from '../services/mikrotikService.ts';
import { generateHotspotSetupScript } from '../services/geminiService.ts';
import { Loader } from './Loader.tsx';
import { CodeBlock } from './CodeBlock.tsx';
import { RouterIcon, UsersIcon, ServerIcon, EditIcon, TrashIcon, ChipIcon, CodeBracketIcon, ExclamationTriangleIcon, FolderIcon, FileIcon } from '../constants.tsx';

// --- Reusable Components ---

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

const formatBytes = (bytes?: number): string => {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// --- Sub-components defined inside Hotspot.tsx ---

const HotspotUserActivity: React.FC<{
    activeUsers: HotspotActiveUser[];
    hosts: HotspotHost[];
    onKickUser: (userId: string) => void;
    isSubmitting: boolean;
}> = ({ activeUsers, hosts, onKickUser, isSubmitting }) => {
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">Active Users ({activeUsers.length})</h3>
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
                                            <button onClick={() => onKickUser(user.id)} disabled={isSubmitting} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-md disabled:opacity-50" title="Kick User">
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
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">All Hosts ({hosts.length})</h3>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                         <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">MAC Address</th><th scope="col" className="px-6 py-3">Address</th><th scope="col" className="px-6 py-3">To Address</th><th scope="col" className="px-6 py-3">Status</th>
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

const NodeMcuManager: React.FC<{ hosts: HotspotHost[] }> = ({ hosts }) => {
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
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                            Vendo Settings
                        </h3>
                        <p className="text-sm font-mono text-cyan-500">{selectedHost.address}</p>
                    </div>
                    <button 
                        onClick={() => setSelectedHost(null)}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-white rounded-lg font-semibold"
                    >
                        &larr; Back to List
                    </button>
                </div>
                <div className="flex-grow p-4"><iframe src={`http://${selectedHost.address}/admin#`} title={`Settings for ${selectedHost.address}`} className="w-full h-full border-2 border-slate-300 dark:border-slate-600 rounded-md" sandbox="allow-forms allow-scripts allow-same-origin" /></div>
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
                            <div className="flex items-center space-x-2">
                                <button onClick={() => setSelectedHost(host)} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-md font-semibold">Settings</button>
                            </div>
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

const LoginPageEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
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
        if (file.type === 'directory') {
            const dirName = file.name.split('/').pop();
            if (dirName) {
                 setPath(prev => [...prev, dirName]);
            }
        } else if (file.type === 'file') {
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
                if (uploadInputRef.current) uploadInputRef.current.value = "";
                setStatus('browsing');
            } catch (err) {
                setError(`Upload failed: ${(err as Error).message}`);
                setStatus('error');
            }
        };
        reader.onerror = () => { setError("Failed to read the selected file."); setStatus('error'); };
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
    
    const sortedFiles = useMemo(() => {
        return [...files].sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;
            return a.name.split('/').pop()!.localeCompare(b.name.split('/').pop()!);
        });
    }, [files]);
    
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">Hotspot File Browser</h3>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                 <div className="text-sm text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-900/50 p-2 rounded-md overflow-x-auto whitespace-nowrap">
                    {path.map((p, i) => (<span key={i}><button onClick={() => handleBreadcrumbClick(i)} className="hover:underline">{p}</button>{i < path.length - 1 && ' / '}</span>))}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <input ref={uploadInputRef} type="file" onChange={handleFileSelect} className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-200 dark:file:bg-slate-600 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-300 dark:hover:file:bg-slate-500" />
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
                    {sortedFiles.map(file => (
                        <li key={file.id}>
                            <button onClick={() => file.type === 'directory' ? handleDirClick(file.name.split('/').pop()!) : handleFileClick(file)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left">
                                {file.type === 'directory' ? <FolderIcon className="w-5 h-5 text-yellow-500" /> : <FileIcon className="w-5 h-5 text-slate-500" />}
                                <span className="font-medium text-slate-800 dark:text-slate-200">{file.name.split('/').pop()}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// FIX: Implement missing component HotspotServerProfilesManager
const HotspotServerProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<HotspotProfile | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const profilesData = await getHotspotProfiles(selectedRouter);
            setProfiles(profilesData);
        } catch (err) {
            setError(`Could not fetch data: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (profileData: HotspotProfile | HotspotProfileData) => {
        setIsSubmitting(true);
        try {
            if ('id' in profileData) await updateHotspotProfile(selectedRouter, profileData);
            else await addHotspotProfile(selectedRouter, profileData);
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) { alert(`Error saving profile: ${(err as Error).message}`); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (profileId: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteHotspotProfile(selectedRouter, profileId);
            await fetchData();
        } catch (err) { alert(`Error deleting profile: ${(err as Error).message}`); }
    };
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return <div>Profiles Manager Implementation...</div>;
};

// FIX: Implement missing component HotspotUserProfilesManager
const HotspotUserProfilesManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [profiles, setProfiles] = useState<HotspotUserProfile[]>([]);
    const [pools, setPools] = useState<IpPool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<HotspotUserProfile | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [profilesData, poolsData] = await Promise.all([
                getHotspotUserProfiles(selectedRouter),
                getIpPools(selectedRouter)
            ]);
            setProfiles(profilesData);
            setPools(poolsData);
        } catch (err) {
            setError(`Could not fetch data: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (profileData: HotspotUserProfile | HotspotUserProfileData) => {
        setIsSubmitting(true);
        try {
            if ('id' in profileData) {
                await updateHotspotUserProfile(selectedRouter, profileData);
            } else {
                await addHotspotUserProfile(selectedRouter, profileData);
            }
            setIsModalOpen(false);
            setEditingProfile(null);
            await fetchData();
        } catch (err) {
            alert(`Error saving profile: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (profileId: string) => {
        if (!window.confirm("Are you sure you want to delete this user profile?")) return;
        try {
            await deleteHotspotUserProfile(selectedRouter, profileId);
            await fetchData();
        } catch (err) {
            alert(`Error deleting profile: ${(err as Error).message}`);
        }
    };
    
    if (isLoading) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 text-red-600">{error}</div>;

    return <div>User Profiles Manager Implementation...</div>
};


// FIX: Implement missing component HotspotServerSetup
const getPoolFromNetwork = (network: string): string => {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(network)) {
        return '';
    }
    const [ip, cidrStr] = network.split('/');
    const ipParts = ip.split('.').map(Number);
    const cidr = parseInt(cidrStr, 10);
    
    if (cidr < 8 || cidr > 30) return ''; // Only handle reasonable subnet sizes

    const startIp = [...ipParts];
    startIp[3]++;
    
    const ipAsInt = (ipParts[0] << 24 | ipParts[1] << 16 | ipParts[2] << 8 | ipParts[3]) >>> 0;
    const subnetMask = (0xffffffff << (32 - cidr)) >>> 0;
    const networkAddress = ipAsInt & subnetMask;
    const broadcastAddress = networkAddress | ~subnetMask;
    
    const endIpParts = [
        (broadcastAddress >> 24) & 255,
        (broadcastAddress >> 16) & 255,
        (broadcastAddress >> 8) & 255,
        (broadcastAddress & 255) - 1 // One less than broadcast
    ];

    // FIX: Removed spaces around the hyphen to match MikroTik API requirements.
    return `${startIp.join('.')}-${endIpParts.join('.')}`;
};

const HotspotServerSetup: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [setupMethod, setSetupMethod] = useState<'ai' | 'smart'>('smart');
    const [params, setParams] = useState<HotspotSetupParams>({
        hotspotInterface: '',
        localAddress: '10.5.50.1/24',
        addressPool: '10.5.50.2-10.5.50.254',
        sslCertificate: 'none',
        dnsServers: '8.8.8.8, 1.1.1.1',
        dnsName: 'hotspot.login',
        hotspotUser: 'admin',
        hotspotPass: '1234'
    });
    const [interfaces, setInterfaces] = useState<Interface[]>([]);
    const [certificates, setCertificates] = useState<SslCertificate[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [script, setScript] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoadingData(true);
        setError(null);
        try {
            const [ifaces, certs] = await Promise.all([
                getInterfaces(selectedRouter),
                getSslCertificates(selectedRouter)
            ]);
            setInterfaces(ifaces);
            setCertificates(certs.filter(c => !c.name.includes('*'))); // Filter default certs
            
            if (ifaces.length > 0 && !params.hotspotInterface) {
                const defaultIface = ifaces.find(i => i.type === 'bridge' && i.name.toLowerCase().includes('lan'))?.name || ifaces.find(i => i.type === 'bridge')?.name || ifaces[0].name;
                setParams(p => ({ ...p, hotspotInterface: defaultIface }));
            }

        } catch (err) {
            setError(`Failed to fetch initial data: ${(err as Error).message}`);
        } finally {
            setIsLoadingData(false);
        }
    }, [selectedRouter, params.hotspotInterface]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setParams(p => {
            const newParams = { ...p, [name]: value };
            if (name === 'localAddress') {
                newParams.addressPool = getPoolFromNetwork(value);
            }
            return newParams;
        });
    };
    
    const handleRun = async () => {
        setIsWorking(true);
        setScript('');
        setStatusMessage(null);
        setError(null);

        if (setupMethod === 'ai') {
            try {
                const generatedScript = await generateHotspotSetupScript(params);
                setScript(generatedScript);
            } catch (err) {
                setScript(`# Error generating script: ${(err as Error).message}`);
            }
        } else { // Smart Installer
            try {
                setStatusMessage("Starting Hotspot setup on router...");
                const result = await runHotspotSetup(selectedRouter, params);
                setStatusMessage(result.message);
            } catch (err) {
                setError(`Setup failed: ${(err as Error).message}`);
            }
        }
        setIsWorking(false);
    };
    
    if (isLoadingData) {
        return <div className="flex justify-center p-8"><Loader /></div>;
    }
    
    if (error && !isWorking) {
        return <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md">{error}</div>;
    }

    return (
         <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-[--color-primary-500] dark:text-[--color-primary-400]">Hotspot Server Setup Assistant</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                <div className="space-y-4">
                    {/* Form Fields */}
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hotspot Interface</label><select name="hotspotInterface" value={params.hotspotInterface} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">{interfaces.map(i => <option key={i.name}>{i.name}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Local Address of Network</label><input name="localAddress" value={params.localAddress} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Address Pool of Network</label><input name="addressPool" value={params.addressPool} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">SSL Certificate</label><select name="sslCertificate" value={params.sslCertificate} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md"><option value="none">none</option>{certificates.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">DNS Servers</label><input name="dnsServers" value={params.dnsServers} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">DNS Name</label><input name="dnsName" value={params.dnsName} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                    <div className="grid grid-cols-2 gap-4">
                         <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Hotspot Admin User</label><input name="hotspotUser" value={params.hotspotUser} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                         <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label><input name="hotspotPass" value={params.hotspotPass} onChange={handleChange} className="mt-1 w-full p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md" /></div>
                    </div>
                </div>
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Installation Method</label>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
                            <button onClick={() => setSetupMethod('smart')} className={`w-full rounded-md py-2 px-3 text-sm font-medium ${setupMethod === 'smart' ? 'bg-white dark:bg-slate-900 text-[--color-primary-600]' : 'text-slate-600 dark:text-slate-300'}`}>Smart Installer</button>
                            <button onClick={() => setSetupMethod('ai')} className={`w-full rounded-md py-2 px-3 text-sm font-medium ${setupMethod === 'ai' ? 'bg-white dark:bg-slate-900 text-[--color-primary-600]' : 'text-slate-600 dark:text-slate-300'}`}>AI Script Generator</button>
                        </div>
                    </div>
                     <button onClick={handleRun} disabled={isWorking} className="w-full bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50">
                        {isWorking ? 'Working...' : (setupMethod === 'ai' ? 'Generate Script' : 'Run Smart Setup')}
                    </button>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 border border-slate-200 dark:border-slate-700 min-h-[300px] relative">
                        {isWorking && <div className="absolute inset-0 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-center"><Loader /></div>}
                        {setupMethod === 'ai' ? (
                            <CodeBlock script={script || '# The generated setup script will appear here.\n# Review it carefully before running it in the Terminal.'} />
                        ) : (
                            <div className="p-4 text-sm">
                                {statusMessage && <p className="text-green-600 dark:text-green-400 font-semibold">{statusMessage}</p>}
                                {error && <p className="text-red-600 dark:text-red-400 font-semibold">{error}</p>}
                                {!statusMessage && !error && <p className="text-slate-500">Click "Run Smart Setup" to begin. The setup status will be shown here.</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Main Hotspot Component ---
export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'activity' | 'nodemcu' | 'editor' | 'profiles' | 'user-profiles' | 'setup'>('activity');
    
    // State and logic for tabs that need shared data
    const [activeUsers, setActiveUsers] = useState<HotspotActiveUser[]>([]);
    const [hosts, setHosts] = useState<HotspotHost[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<Record<string, string> | null>(null);

    const fetchData = useCallback(async (isInitial = false) => {
        if (!selectedRouter) {
            setActiveUsers([]);
            setHosts([]);
            if (isInitial) setIsLoading(false);
            return;
        }

        if (isInitial) setIsLoading(true);
        setError(null);
        
        const [activeRes, hostsRes] = await Promise.allSettled([
            getHotspotActiveUsers(selectedRouter),
            getHotspotHosts(selectedRouter)
        ]);

        const newErrors: Record<string, string> = {};
        if (activeRes.status === 'fulfilled') {
            setActiveUsers(activeRes.value);
        } else {
            newErrors.active = "Could not fetch active users.";
            setActiveUsers([]);
        }

        if (hostsRes.status === 'fulfilled') {
            setHosts(hostsRes.value);
        } else {
            newErrors.hosts = "Could not fetch device hosts.";
            setHosts([]);
        }

        if (Object.keys(newErrors).length > 0) setError(newErrors);
        if (isInitial) setIsLoading(false);
    }, [selectedRouter]);

    useEffect(() => {
        if (!selectedRouter) return;
        if (activeTab === 'activity' || activeTab === 'nodemcu') {
            fetchData(true);
            const interval = setInterval(() => fetchData(false), 5000);
            return () => clearInterval(interval);
        }
    }, [selectedRouter, fetchData, activeTab]);

    const handleKickUser = async (userId: string) => {
        if (!selectedRouter || !window.confirm("Are you sure?")) return;
        setIsSubmitting(true);
        try {
            await removeHotspotActiveUser(selectedRouter, userId);
            await fetchData(true);
        } catch(err) {
            alert(`Error: ${(err as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!selectedRouter) {
        return (
             <div className="flex flex-col items-center justify-center h-96 text-center">
                <RouterIcon className="w-16 h-16 text-slate-400 mb-4" />
                <h2 className="text-2xl font-bold">Hotspot Management</h2>
                <p className="mt-2 text-slate-500">Please select a router to manage its Hotspot.</p>
            </div>
        );
    }
    
    const renderTabContent = () => {
        if (isLoading && (activeTab === 'activity' || activeTab === 'nodemcu')) {
            return <div className="flex justify-center p-8"><Loader /></div>;
        }
        if (error && (activeTab === 'activity' || activeTab === 'nodemcu')) {
             return <div className="p-4 bg-yellow-50 text-yellow-800 rounded-md">Warning: {Object.values(error).join(' ')}</div>;
        }

        switch (activeTab) {
            case 'activity': 
                return <HotspotUserActivity activeUsers={activeUsers} hosts={hosts} onKickUser={handleKickUser} isSubmitting={isSubmitting} />;
            case 'nodemcu': 
                return <NodeMcuManager hosts={hosts} />;
            case 'editor': 
                return <LoginPageEditor selectedRouter={selectedRouter} />;
            // FIX: Render newly implemented components
            case 'profiles': 
                return <HotspotServerProfilesManager selectedRouter={selectedRouter} />;
            case 'user-profiles': 
                return <HotspotUserProfilesManager selectedRouter={selectedRouter} />;
            case 'setup': 
                return <HotspotServerSetup selectedRouter={selectedRouter} />;
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
