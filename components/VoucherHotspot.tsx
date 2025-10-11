import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotUserProfile, VoucherPlan, VoucherPlanWithId, HotspotUser, HotspotUserData, CompanySettings } from '../types.ts';
import { getHotspotUserProfiles, runPanelHotspotSetup, getHotspotUsers, addHotspotUser, deleteHotspotUser } from '../services/mikrotikService.ts';
import { useVoucherPlans } from '../hooks/useVoucherPlans.ts';
import { useCompanySettings } from '../hooks/useCompanySettings.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { Loader } from './Loader.tsx';
import { CodeBlock } from './CodeBlock.tsx';
import { RouterIcon, ReceiptPercentIcon, EditIcon, TrashIcon, CodeBracketIcon, CheckCircleIcon, PrinterIcon } from '../constants.tsx';
import { HotspotEditor } from './HotspotEditor.tsx';

// --- Reusable Components ---
const TabButton: React.FC<{ label: string, icon?: React.ReactNode, isActive: boolean, onClick: () => void }> = ({ label, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 focus:outline-none ${
            isActive
                ? 'border-[--color-primary-500] text-[--color-primary-500] dark:text-[--color-primary-400]'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
    >
        {icon}
        {label}
    </button>
);

// --- Printable Vouchers Component ---
const PrintableVouchers: React.FC<{ vouchers: HotspotUser[], plans: VoucherPlanWithId[], companySettings: CompanySettings }> = ({ vouchers, plans, companySettings }) => {
    const { formatCurrency } = useLocalization();

    const getPlanForVoucher = (voucher: HotspotUser) => {
        return plans.find(p => p.mikrotik_profile_name === voucher.profile);
    };

    return (
        <div className="p-4 bg-white text-black">
            <style>{`
                @media print {
                    @page { size: A4; margin: 1cm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
                .voucher-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .voucher-ticket { border: 2px dashed #999; padding: 10px; text-align: center; break-inside: avoid; display: flex; flex-direction: column; justify-content: space-between; height: 120px; }
            `}</style>
            <div className="voucher-grid">
                {vouchers.map(voucher => {
                    const plan = getPlanForVoucher(voucher);
                    return (
                        <div key={voucher.id} className="voucher-ticket">
                            <div>
                                {companySettings.logoBase64 ? <img src={companySettings.logoBase64} alt="Logo" className="max-h-8 mx-auto mb-1" /> : <h4 className="font-bold">{companySettings.companyName || 'WiFi Hotspot'}</h4>}
                                <p className="text-xs">{plan?.name || 'Voucher'}</p>
                            </div>
                            <div>
                                <p className="text-sm">Code:</p>
                                <p className="font-mono font-bold text-lg tracking-widest bg-gray-200 rounded-sm">{voucher.name}</p>
                            </div>
                            <p className="text-xs font-bold">{plan ? formatCurrency(plan.price) : ''}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


// --- Vouchers Manager ---
const VouchersManager: React.FC<{ selectedRouter: RouterConfigWithId, setVouchersToPrint: (vouchers: HotspotUser[]) => void }> = ({ selectedRouter, setVouchersToPrint }) => {
    const { plans, isLoading: isLoadingPlans } = useVoucherPlans(selectedRouter.id);
    const [vouchers, setVouchers] = useState<HotspotUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string|null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const users = await getHotspotUsers(selectedRouter);
            // Filter out default 'admin' user
            setVouchers(users.filter(u => u.name !== 'admin').sort((a,b) => (a.comment || '').localeCompare(b.comment || '')));
        } catch(err) { setError((err as Error).message); }
        finally { setIsLoading(false); }
    }, [selectedRouter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDelete = async (userId: string) => {
        if (!window.confirm("Are you sure?")) return;
        try {
            await deleteHotspotUser(selectedRouter, userId);
            await fetchData();
        } catch(err) { alert(`Failed to delete voucher: ${(err as Error).message}`); }
    };
    
    const handleGenerate = async ({ quantity, planId, comment }: { quantity: number; planId: string; comment: string }) => {
        setIsGenerating(true);
        const plan = plans.find(p => p.id === planId);
        if (!plan) {
            alert("Selected plan not found.");
            setIsGenerating(false);
            return;
        }

        const minutesToMikroTikTime = (minutes: number) => {
            if (minutes < 1) return '1s'; // prevent 0m
            const d = Math.floor(minutes / 1440);
            const h = Math.floor((minutes % 1440) / 60);
            const m = minutes % 60;
            return `${d > 0 ? `${d}d` : ''}${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}` || '0s';
        };

        try {
            const promises = [];
            for (let i = 0; i < quantity; i++) {
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                const userData: HotspotUserData = {
                    name: code,
                    password: code,
                    profile: plan.mikrotik_profile_name,
                    'limit-uptime': minutesToMikroTikTime(plan.duration_minutes),
                    comment: comment || `batch_${new Date().toISOString().split('T')[0]}`,
                    disabled: 'false'
                };
                promises.push(addHotspotUser(selectedRouter, userData));
            }
            await Promise.all(promises);
            setIsModalOpen(false);
            await fetchData();
        } catch(err) {
            alert(`Failed to generate vouchers: ${(err as Error).message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const GenerateModal = ({ isOpen, onClose, onGenerate }) => {
        const [quantity, setQuantity] = useState(10);
        const [planId, setPlanId] = useState(plans[0]?.id || '');
        const [comment, setComment] = useState('');

        if (!isOpen) return null;
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                    <div className="p-6">
                        <h3 className="text-xl font-bold mb-4">Generate Vouchers</h3>
                        <div className="space-y-4">
                            <div><label>Quantity</label><input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value))} min="1" max="100" className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700" /></div>
                            <div><label>Plan</label><select value={planId} onChange={e => setPlanId(e.target.value)} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700">{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                            <div><label>Comment / Batch Name (Optional)</label><input type="text" value={comment} onChange={e => setComment(e.target.value)} className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700" /></div>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3">
                        <button onClick={onClose} disabled={isGenerating}>Cancel</button>
                        <button onClick={() => onGenerate({ quantity, planId, comment })} disabled={isGenerating}>{isGenerating ? "Generating..." : "Generate"}</button>
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading || isLoadingPlans) return <div className="flex justify-center p-8"><Loader /></div>;
    if (error) return <div className="p-4 bg-red-100 text-red-700">{error}</div>

    return (
        <div>
            <GenerateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onGenerate={handleGenerate} />
            <div className="flex justify-end mb-4 gap-2">
                 <button onClick={() => setVouchersToPrint(vouchers)} className="bg-sky-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"><PrinterIcon className="w-5 h-5"/> Print All</button>
                <button onClick={() => setIsModalOpen(true)} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Generate Vouchers</button>
            </div>
             <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                        <tr><th className="px-6 py-3">Voucher Code</th><th className="px-6 py-3">Profile</th><th className="px-6 py-3">Uptime</th><th className="px-6 py-3">Comment</th><th className="px-6 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        {vouchers.map(v => (
                            <tr key={v.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-mono">{v.name}</td>
                                <td className="px-6 py-4">{v.profile}</td>
                                <td className="px-6 py-4">{v.uptime}</td>
                                <td className="px-6 py-4">{v.comment}</td>
                                <td className="px-6 py-4 text-right"><button onClick={() => handleDelete(v.id)}><TrashIcon className="w-5 h-5"/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Plans Manager Sub-component ---
const PlansManager: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const { plans, addPlan, updatePlan, deletePlan, isLoading: isLoadingPlans } = useVoucherPlans(selectedRouter.id);
    const { formatCurrency, currency } = useLocalization();
    const [profiles, setProfiles] = useState<HotspotUserProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<VoucherPlanWithId | null>(null);

    useEffect(() => {
        if (!selectedRouter) return;
        setIsLoadingProfiles(true);
        getHotspotUserProfiles(selectedRouter)
            .then(setProfiles)
            .catch(err => console.error("Failed to fetch hotspot user profiles", err))
            .finally(() => setIsLoadingProfiles(false));
    }, [selectedRouter]);

    const handleSave = (planData: VoucherPlan | VoucherPlanWithId) => {
        if ('id' in planData) {
            updatePlan(planData as VoucherPlanWithId);
        } else {
            addPlan(planData as VoucherPlan);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (planId: string) => {
        if (window.confirm("Are you sure you want to delete this plan?")) {
            deletePlan(planId);
        }
    };
    
    // PlanFormModal sub-component
    const PlanFormModal: React.FC<any> = ({ isOpen, onClose, onSave, initialData }) => {
        const [plan, setPlan] = useState({ name: '', duration_minutes: 60, price: 1, mikrotik_profile_name: '' });

        useEffect(() => {
            if(isOpen) {
                if (initialData) {
                    setPlan(initialData);
                } else {
                    setPlan({ name: '', duration_minutes: 60, price: 1, mikrotik_profile_name: profiles.length > 0 ? profiles[0].name : '' });
                }
            }
        }, [initialData, isOpen]);
        
        if (!isOpen) return null;

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            const planData = { ...plan, routerId: selectedRouter.id, currency };
            onSave(planData);
        };
        
        return (
             <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <div className="p-6"><h3 className="text-xl font-bold">{initialData ? 'Edit Plan' : 'Add New Plan'}</h3>
                           <div className="space-y-4 mt-4">
                                <div><label>Plan Name</label><input type="text" value={plan.name} onChange={e => setPlan(p => ({...p, name: e.target.value}))} required className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700" placeholder="e.g., 1 Hour Access"/></div>
                                <div className="grid grid-cols-2 gap-4">
                                <div><label>Duration (minutes)</label><input type="number" value={plan.duration_minutes} onChange={e => setPlan(p => ({...p, duration_minutes: parseInt(e.target.value)}))} required min="1" className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"/></div>
                                <div><label>Price</label><input type="number" value={plan.price} onChange={e => setPlan(p => ({...p, price: parseFloat(e.target.value)}))} required min="0" step="0.01" className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700"/></div>
                                </div>
                                <div><label>MikroTik Hotspot User Profile</label>
                                    <select value={plan.mikrotik_profile_name} onChange={e => setPlan(p => ({...p, mikrotik_profile_name: e.target.value}))} required className="mt-1 w-full p-2 rounded bg-slate-100 dark:bg-slate-700">
                                        {isLoadingProfiles ? <option>Loading...</option> : profiles.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">This profile on your router defines the speed limits for this plan.</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 flex justify-end gap-3"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save Plan</button></div>
                    </form>
                </div>
            </div>
        )
    };

    if (isLoadingPlans) return <div className="flex justify-center p-8"><Loader /></div>;

    return (
        <div>
            <PlanFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} initialData={editingPlan} />
             <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingPlan(null); setIsModalOpen(true); }} className="bg-[--color-primary-600] text-white font-bold py-2 px-4 rounded-lg">Add New Plan</button>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-900/50">
                        <tr><th className="px-6 py-3">Plan Name</th><th className="px-6 py-3">Duration</th><th className="px-6 py-3">Price</th><th className="px-6 py-3">MikroTik Profile</th><th className="px-6 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody>
                        {plans.map(p => (
                            <tr key={p.id} className="border-b dark:border-slate-700">
                                <td className="px-6 py-4 font-medium">{p.name}</td>
                                <td className="px-6 py-4">{p.duration_minutes} minutes</td>
                                <td className="px-6 py-4">{formatCurrency(p.price)}</td>
                                <td className="px-6 py-4 font-mono">{p.mikrotik_profile_name}</td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => { setEditingPlan(p); setIsModalOpen(true); }}><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDelete(p.id)}><TrashIcon className="w-5 h-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// --- Setup Guide Sub-component ---
const SetupGuide: React.FC<{ selectedRouter: RouterConfigWithId }> = ({ selectedRouter }) => {
    const [installerStatus, setInstallerStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [installerMessage, setInstallerMessage] = useState('');

    const panelIp = window.location.hostname;
    const walledGardenScript = `/ip hotspot walled-garden ip add action=accept dst-host=${panelIp}`;
    const loginHtmlContent = `<html>
<head>
    <title>Redirecting...</title>
    <meta http-equiv="refresh" content="0;url=http://${panelIp}:3001/hotspot-login?mac=$(mac-esc)&ip=$(ip-esc)&link-login-only=$(link-login-only-esc)&router_id=${selectedRouter.id}">
</head>
<body>
    <p>Please wait, you are being redirected to the login page...</p>
</body>
</html>`;
    const aloginHtmlContent = `<html>
<head>
    <title>Logging in...</title>
</head>
<body>
    <form name="login" action="$(link-login-only)" method="post">
        <input type="hidden" name="username" value="$(username)">
        <input type="hidden" name="password" value="$(password)">
    </form>
    <script>
        document.login.submit();
    </script>
</body>
</html>`;

    const handleRunInstaller = async () => {
        if (!window.confirm("This will automatically configure your router's Walled Garden and overwrite hotspot/login.html and hotspot/alogin.html. Are you sure you want to proceed?")) {
            return;
        }
        setInstallerStatus('running');
        setInstallerMessage('');
        try {
            const result = await runPanelHotspotSetup(selectedRouter);
            setInstallerStatus('success');
            setInstallerMessage(result.message);
        } catch (err) {
            setInstallerStatus('error');
            setInstallerMessage((err as Error).message);
        }
    };

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="p-6 bg-sky-50 dark:bg-sky-900/50 border border-sky-200 dark:border-sky-700 rounded-lg">
                <h3 className="text-xl font-bold text-sky-800 dark:text-sky-200">Panel-Managed Hotspot Setup</h3>
                <p className="mt-2 text-sky-700 dark:text-sky-300">This system allows your MikroTik Hotspot to use this panel as its login portal. Use the Smart Installer for a one-click setup, or follow the manual steps below.</p>
            </div>
            
            {/* Smart Installer Section */}
            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Smart Installer (Recommended)</h4>
                <div className="p-4 border rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300 flex-grow">Click this button to automatically configure the Walled Garden and upload the necessary `login.html` and `alogin.html` files to your router.</p>
                    <button onClick={handleRunInstaller} disabled={installerStatus === 'running'} className="px-6 py-3 bg-[--color-primary-600] hover:bg-[--color-primary-500] text-white font-bold rounded-lg disabled:opacity-50 flex items-center gap-2 w-full sm:w-auto justify-center">
                        {installerStatus === 'running' && <Loader />}
                        {installerStatus === 'running' ? 'Configuring...' : 'Run Smart Installer'}
                    </button>
                </div>
                {installerStatus === 'success' && (
                    <div className="p-4 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-md flex items-center gap-3">
                        <CheckCircleIcon className="w-6 h-6" />
                        <div>
                            <p className="font-bold">Success!</p>
                            <p>{installerMessage}</p>
                        </div>
                    </div>
                )}
                {installerStatus === 'error' && <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-md">{installerMessage}</div>}
            </div>
            
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <h4 className="text-lg font-semibold mb-4">Manual Setup Guide</h4>
                <div className="space-y-4">
                    <p><strong className="font-semibold">Step 1: Configure Hotspot Server</strong><br/>Ensure you have a working Hotspot server on your router. You can use the 'Server Setup' tab in the main Hotspot page, or WinBox's "Hotspot Setup" wizard.</p>
                    <p><strong className="font-semibold">Step 2: Configure Walled Garden</strong><br/>Run this command in your MikroTik terminal to allow users to access this panel before login.</p>
                    <CodeBlock script={walledGardenScript} />
                    <p><strong className="font-semibold">Step 3: Replace Hotspot Login Files</strong><br/>Use the "Login Page Editor" tab to create/update these two files in your router's `hotspot` directory.</p>
                    <div className="p-4 border rounded-lg">
                        <h5 className="font-semibold">A. `login.html` (The Redirect)</h5>
                        <p className="text-sm text-slate-500 mb-2">This redirects users to the panel's login page.</p>
                        <CodeBlock script={loginHtmlContent} />
                    </div>
                    <div className="p-4 border rounded-lg">
                        <h5 className="font-semibold">B. `alogin.html` (The Authenticator)</h5>
                        <p className="text-sm text-slate-500 mb-2">This helper file completes the login process.</p>
                        <CodeBlock script={aloginHtmlContent} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---
export const PanelHotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'setup' | 'plans' | 'vouchers' | 'editor'>('setup');
    const { settings: companySettings } = useCompanySettings();
    const { plans } = useVoucherPlans(selectedRouter?.id || null);

    const [vouchersToPrint, setVouchersToPrint] = useState<HotspotUser[] | null>(null);

    // Print handling logic
    useEffect(() => {
        if (vouchersToPrint) {
            const timer = setTimeout(() => window.print(), 100);
            return () => clearTimeout(timer);
        }
    }, [vouchersToPrint]);

    useEffect(() => {
        const handleAfterPrint = () => {
            setVouchersToPrint(null);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);


    if (!selectedRouter) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <RouterIcon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Panel Hotspot System</h2>
                <p className="mt-2 text-slate-500 dark:text-slate-400">Please select a router to manage its voucher system.</p>
            </div>
        );
    }
    
    return (
        <>
            <div className={vouchersToPrint ? 'printable-area' : 'hidden no-print'}>
                {vouchersToPrint && <PrintableVouchers vouchers={vouchersToPrint} plans={plans} companySettings={companySettings} />}
            </div>
            <div className={`space-y-6 ${vouchersToPrint ? 'hidden' : ''}`}>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                    <ReceiptPercentIcon className="w-8 h-8"/> Panel Hotspot
                </h2>

                <div className="border-b border-slate-200 dark:border-slate-700">
                    <nav className="flex space-x-2 overflow-x-auto">
                        <TabButton label="Setup Guide" isActive={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
                        <TabButton label="Voucher Plans" isActive={activeTab === 'plans'} onClick={() => setActiveTab('plans')} />
                        <TabButton label="Vouchers" isActive={activeTab === 'vouchers'} onClick={() => setActiveTab('vouchers')} />
                        <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5" />} isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    </nav>
                </div>

                <div>
                    {activeTab === 'plans' && <PlansManager selectedRouter={selectedRouter} />}
                    {activeTab === 'editor' && <HotspotEditor selectedRouter={selectedRouter} />}
                    {activeTab === 'setup' && <SetupGuide selectedRouter={selectedRouter} />}
                    {activeTab === 'vouchers' && <VouchersManager selectedRouter={selectedRouter} setVouchersToPrint={setVouchersToPrint} />}
                </div>
            </div>
        </>
    );
};