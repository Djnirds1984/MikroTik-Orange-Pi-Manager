import React, { useState, useEffect, useCallback } from 'react';
import type { RouterConfigWithId, HotspotUserProfile, VoucherPlan, VoucherPlanWithId } from '../types.ts';
import { getHotspotUserProfiles } from '../services/mikrotikService.ts';
import { useVoucherPlans } from '../hooks/useVoucherPlans.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';
import { Loader } from './Loader.tsx';
import { CodeBlock } from './CodeBlock.tsx';
import { RouterIcon, ReceiptPercentIcon, EditIcon, TrashIcon, CodeBracketIcon } from '../constants.tsx';
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
const SetupGuide: React.FC = () => {
    const panelIp = window.location.hostname;
    const walledGardenScript = `/ip hotspot walled-garden ip add action=accept dst-host=${panelIp}`;
    const loginHtmlContent = `<html>
<head>
    <title>Redirecting...</title>
    <meta http-equiv="refresh" content="0;url=http://${panelIp}:3001/hotspot-login?mac=$(mac-esc)&ip=$(ip-esc)&link-login-only=$(link-login-only-esc)&router_id=<YOUR_ROUTER_ID>">
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

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="p-6 bg-sky-50 dark:bg-sky-900/50 border border-sky-200 dark:border-sky-700 rounded-lg">
                <h3 className="text-xl font-bold text-sky-800 dark:text-sky-200">Panel-Managed Hotspot Setup</h3>
                <p className="mt-2 text-sky-700 dark:text-sky-300">This system allows your MikroTik Hotspot to use this panel as its login portal. Follow these steps carefully.</p>
            </div>
            
            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Step 1: Configure Hotspot Server</h4>
                <p>Ensure you have a working Hotspot server on your router. You can use the 'Server Setup' tab in the main Hotspot page, or WinBox's "Hotspot Setup" wizard. This process should create a server, IP pool, and user profile.</p>
            </div>
            
            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Step 2: Configure Walled Garden</h4>
                <p>You must allow users to access this panel *before* they log in. Run the following command in your MikroTik terminal. This command automatically uses your panel's current IP address.</p>
                <CodeBlock script={walledGardenScript} />
            </div>

            <div className="space-y-4">
                <h4 className="text-lg font-semibold">Step 3: Replace Hotspot Login Files</h4>
                <p>You need to replace two files in your router's `hotspot` directory. You can do this using the "Login Page Editor" tab, WinBox's File list (drag and drop), or FTP.</p>
                
                <div className="p-4 border rounded-lg">
                    <h5 className="font-semibold">A. `login.html` (The Redirect)</h5>
                    <p className="text-sm text-slate-500 mb-2">Create a file named `login.html` with the content below. This will redirect users to the panel's login page. <strong className="text-red-500">IMPORTANT: You must replace `&lt;YOUR_ROUTER_ID&gt;` with your router's ID from the URL or "Routers" page.</strong></p>
                    <CodeBlock script={loginHtmlContent} />
                </div>
                
                <div className="p-4 border rounded-lg">
                    <h5 className="font-semibold">B. `alogin.html` (The Authenticator)</h5>
                    <p className="text-sm text-slate-500 mb-2">Create a file named `alogin.html` with this content. This is a helper file that the router uses in the background to complete the login process.</p>
                    <CodeBlock script={aloginHtmlContent} />
                </div>
            </div>
            
            <div className="p-6 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 rounded-lg">
                <h4 className="text-lg font-semibold text-green-800 dark:text-green-200">Setup Complete!</h4>
                <p className="mt-2 text-green-700 dark:text-green-300">Once these steps are done, your hotspot is ready. You can now create Voucher Plans and generate vouchers for your users.</p>
            </div>
        </div>
    );
};

// --- Main Component ---
export const PanelHotspot: React.FC<{ selectedRouter: RouterConfigWithId | null }> = ({ selectedRouter }) => {
    const [activeTab, setActiveTab] = useState<'setup' | 'plans' | 'editor' | 'vouchers' | 'dashboard'>('setup');

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
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                <ReceiptPercentIcon className="w-8 h-8"/> Panel Hotspot
            </h2>

            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="flex space-x-2 overflow-x-auto">
                    <TabButton label="Setup Guide" isActive={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
                    <TabButton label="Plans" isActive={activeTab === 'plans'} onClick={() => setActiveTab('plans')} />
                    <TabButton label="Login Page Editor" icon={<CodeBracketIcon className="w-5 h-5" />} isActive={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    <TabButton label="Vouchers" isActive={activeTab === 'vouchers'} onClick={() => setActiveTab('vouchers')} />
                    <TabButton label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                </nav>
            </div>

            <div>
                {activeTab === 'dashboard' && <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Dashboard coming soon.</div>}
                {activeTab === 'vouchers' && <div className="text-center p-8 bg-slate-50 dark:bg-slate-800 rounded-lg">Voucher generation and management coming soon.</div>}
                {activeTab === 'plans' && <PlansManager selectedRouter={selectedRouter} />}
                {activeTab === 'editor' && <HotspotEditor selectedRouter={selectedRouter} />}
                {activeTab === 'setup' && <SetupGuide />}
            </div>
        </div>
    );
};