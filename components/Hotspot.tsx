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
// FIX: Import NodeMcuManager to resolve reference error and implement data fetching.
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
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot User Activity management is not yet implemented.</div>;
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
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Login Page Editor management is not yet implemented.</div>;
};
const HotspotServerProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = () => {
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot Server Profiles management is not yet implemented.</div>;
};
const HotspotUserProfiles: React.FC<{ selectedRouter: RouterConfigWithId }> = () => {
    return <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Hotspot User Profiles management is not yet implemented.</div>;
};

// --- Hotspot Server Setup Assistant ---
const getPoolFromNetwork = (network: string): string => {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(network)) {
        return '';
    }
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
    
    const endIpParts = [
        (broadcastAddress >> 24) & 255,
        (broadcastAddress >> 16) & 255,
        (broadcastAddress >> 8) & 255,
        (broadcastAddress & 255) - 1
    ];
    
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
            setCertificates(certs.filter(c => !c.name.includes('*'))); 
            
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
        } else {
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
    const [activeTab, setActiveTab] = useState<'user_activity' | 'nodemcu_vendo' | 'login_page_editor' | 'server_profiles' | 'user_profiles' | 'server_setup'>('server_setup');

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