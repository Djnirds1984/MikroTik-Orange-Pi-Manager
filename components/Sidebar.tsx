import React from 'react';
import type { View, CompanySettings } from '../types';
import {
    MikroTikLogoIcon,
    CodeBracketIcon,
    EthernetIcon,
    RouterIcon,
    ShareIcon,
    UsersIcon,
    CurrencyDollarIcon,
    ReceiptPercentIcon,
    ArchiveBoxIcon,
    WifiIcon,
    ZeroTierIcon,
    BuildingOffice2Icon,
    CogIcon,
    UpdateIcon,
    ShieldCheckIcon,
    QuestionMarkCircleIcon,
    FolderIcon,
    KeyIcon,
    LockClosedIcon
} from '../constants';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
    currentView: View;
    setCurrentView: (view: View) => void;
    companySettings: CompanySettings;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
    label: string;
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
    <li>
        <button
            onClick={onClick}
            className={`flex items-center w-full p-3 text-base font-normal rounded-lg transition duration-75 group ${
                isActive
                    ? 'bg-[--color-primary-600] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
        >
            {icon}
            <span className="flex-1 ml-3 text-left whitespace-nowrap">{label}</span>
        </button>
    </li>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const TerminalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, companySettings, isOpen, setIsOpen }) => {
    const { t } = useLocalization();
    const { hasPermission } = useAuth();

    const navItems = [
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: <EthernetIcon className="w-6 h-6" />, permission: 'dashboard:view' },
        { id: 'scripting', label: t('sidebar.ai_scripting'), icon: <CodeBracketIcon className="w-6 h-6" />, permission: 'scripting:use' },
        { id: 'terminal', label: t('sidebar.terminal'), icon: <TerminalIcon className="w-6 h-6" />, permission: 'terminal:use' },
        { id: 'routers', label: t('sidebar.routers'), icon: <RouterIcon className="w-6 h-6" />, permission: 'routers:view' },
        { id: 'network', label: t('sidebar.network'), icon: <ShareIcon className="w-6 h-6" />, permission: 'network:view' },
        { id: 'pppoe', label: t('sidebar.pppoe'), icon: <UsersIcon className="w-6 h-6" />, permission: 'pppoe:view' },
        { id: 'billing', label: t('sidebar.billing_plans'), icon: <CurrencyDollarIcon className="w-6 h-6" />, permission: 'billing:view' },
        { id: 'sales', label: t('sidebar.sales_report'), icon: <ReceiptPercentIcon className="w-6 h-6" />, permission: 'sales:view' },
        { id: 'inventory', label: t('sidebar.inventory'), icon: <ArchiveBoxIcon className="w-6 h-6" />, permission: 'inventory:view' },
        { id: 'hotspot', label: t('sidebar.hotspot'), icon: <WifiIcon className="w-6 h-6" />, permission: 'hotspot:view' },
        { id: 'panel_hotspot', label: t('sidebar.panel_hotspot'), icon: <ReceiptPercentIcon className="w-6 h-6" />, permission: 'panel_hotspot:view' },
        { id: 'zerotier', label: t('sidebar.zerotier'), icon: <ZeroTierIcon className="w-6 h-6" />, permission: 'zerotier:view' },
        { id: 'mikrotik_files', label: t('sidebar.mikrotik_files'), icon: <FolderIcon className="w-6 h-6" />, permission: 'mikrotik_files:view' },
        { id: 'company', label: t('sidebar.company'), icon: <BuildingOffice2Icon className="w-6 h-6" />, permission: 'company:view' },
        { id: 'system', label: t('sidebar.system_settings'), icon: <CogIcon className="w-6 h-6" />, permission: 'system_settings:view' },
        { id: 'updater', label: t('sidebar.updater'), icon: <UpdateIcon className="w-6 h-6" />, permission: 'updater:use' },
        { id: 'super_router', label: t('sidebar.super_router'), icon: <ShieldCheckIcon className="w-6 h-6" />, permission: 'super_router:use' },
        { id: 'logs', label: t('sidebar.logs'), icon: <CodeBracketIcon className="w-6 h-6" />, permission: 'logs:view' },
        { id: 'panel_roles', label: t('sidebar.panel_roles'), icon: <LockClosedIcon className="w-6 h-6" />, permission: 'panel_roles:view' },
        { id: 'license', label: t('sidebar.license'), icon: <KeyIcon className="w-6 h-6" />, permission: 'license:view' },
        { id: 'help', label: 'Help', icon: <QuestionMarkCircleIcon className="w-6 h-6" />, permission: 'help:view' },
        { id: 'super_admin', label: t('sidebar.super_admin'), icon: <ShieldCheckIcon className="w-6 h-6" />, permission: 'super_admin:view' }
    ];

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out lg:sticky lg:translate-x-0 ${
                isOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            aria-label="Sidebar"
        >
            <div className="flex items-center justify-between h-16 border-b border-slate-200 dark:border-slate-800 px-4">
                <div className="flex items-center min-w-0">
                    {companySettings.logoBase64 ? (
                        <img src={companySettings.logoBase64} alt="Company Logo" className="h-10 w-auto object-contain flex-shrink-0" />
                    ) : (
                        <MikroTikLogoIcon className="w-8 h-8 text-[--color-primary-500] flex-shrink-0" />
                    )}
                    <span className="self-center ml-3 text-xl font-semibold whitespace-nowrap text-slate-900 dark:text-white truncate">
                        {companySettings.companyName || 'MikroTik UI'}
                    </span>
                </div>
                 <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1" aria-label="Close sidebar">
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>
             <div className="h-[calc(100vh-4rem)] px-3 py-4 overflow-y-auto">
                <ul className="space-y-2">
                    {navItems.map(item => (
                        hasPermission(item.permission) && (
                            <NavItem
                                key={item.id}
                                label={item.label}
                                icon={item.icon}
                                isActive={currentView === item.id}
                                onClick={() => setCurrentView(item.id as View)}
                            />
                        )
                    ))}
                </ul>
            </div>
        </aside>
    );
};