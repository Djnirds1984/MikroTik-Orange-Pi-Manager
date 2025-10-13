import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouterConfigWithId, HotspotActiveUser, HotspotHost, HotspotProfile, HotspotUserProfile, IpPool, Interface, SslCertificate, HotspotSetupParams } from '../types.ts';
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


// --- Sub-Components for each Tab are now defined inside this file ---

const HotspotUserActivity: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    // Implementation for User Activity (omitted for brevity in this thought block, will be in the final code)
    return (
        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <h2 className="text-2xl font-bold">User Activity</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
                Hotspot User Activity is not yet implemented.
            </p>
        </div>
    );
};

const HotspotNodeMcu: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return (
        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <h2 className="text-2xl font-bold">NodeMCU Vendo Management</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
                Hotspot NodeMCU Vendo management is not yet implemented.
            </p>
        </div>
    );
};

const HotspotEditor: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
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


const HotspotServerProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg"><h2 className="text-2xl font-bold">Hotspot Server Profiles</h2><p className="mt-2 text-slate-600 dark:text-slate-400">Hotspot Server Profiles management is not yet implemented.</p></div>;
};
const HotspotUserProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    return <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-lg"><h2 className="text-2xl font-bold">Hotspot User Profiles</h2><p className="mt-2 text-slate-600 dark:text-slate-400">Hotspot User Profiles management is not yet implemented.</p></div>;
};

// Helper to derive pool from network address
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


const HotspotInstaller: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
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

// --- Main Component ---

export const Hotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'activity' | 'nodemcu' | 'editor' | 'profiles' | 'user-profiles' | 'setup'>('editor');

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
            case 'activity': return <HotspotUserActivity selectedRouter={selectedRouter} />;
            case 'nodemcu': return <HotspotNodeMcu selectedRouter={selectedRouter} />;
            case 'editor': return <HotspotEditor selectedRouter={selectedRouter} />;
            case 'profiles': return <HotspotServerProfiles selectedRouter={selectedRouter} />;
            case 'user-profiles': return <HotspotUserProfiles selectedRouter={selectedRouter} />;
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
