import React from 'react';
import { View } from '../types';
import {
  MikroTikLogoIcon, RouterIcon, ServerIcon, EthernetIcon,
  WifiIcon, UsersIcon, CurrencyDollarIcon, ReceiptPercentIcon,
  ArchiveBoxIcon, TunnelIcon, BuildingOffice2Icon, CogIcon,
  UpdateIcon, CodeBracketIcon, QuestionMarkCircleIcon, ShieldCheckIcon
} from '../constants';

interface SidebarProps {
  view: View;
  setView: (view: View) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
  icon: React.ElementType;
  label: string;
  viewName: View;
  currentView: View;
  setView: (view: View) => void;
  isSidebarOpen: boolean;
}> = ({ icon: Icon, label, viewName, currentView, setView, isSidebarOpen }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        setView(viewName);
      }}
      className={`flex items-center p-2 text-base font-normal rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 ${
        currentView === viewName ? 'bg-slate-300 dark:bg-slate-700' : ''
      }`}
    >
      <Icon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
      {isSidebarOpen && <span className="ml-3">{label}</span>}
    </a>
  </li>
);

export const Sidebar: React.FC<SidebarProps> = ({ view, setView, isSidebarOpen }) => {
  const mainNav = [
    { icon: RouterIcon, label: 'Dashboard', view: 'dashboard' },
    { icon: ServerIcon, label: 'Routers', view: 'routers' },
    { icon: EthernetIcon, label: 'Network', view: 'network' },
    { icon: UsersIcon, label: 'PPPoE', view: 'pppoe' },
    { icon: WifiIcon, label: 'Hotspot', view: 'hotspot' },
    { icon: ReceiptPercentIcon, label: 'Vouchers', view: 'panel_hotspot' },
    { icon: TunnelIcon, label: 'ZeroTier', view: 'zerotier' },
    { icon: CodeBracketIcon, label: 'Scripting', view: 'scripting' },
    { icon: ShieldCheckIcon, label: 'Logs', view: 'logs' },
  ];

  const businessNav = [
     { icon: CurrencyDollarIcon, label: 'Billing', view: 'billing' },
     { icon: ReceiptPercentIcon, label: 'Sales', view: 'sales' },
     { icon: ArchiveBoxIcon, label: 'Inventory', view: 'inventory' },
  ];

  const systemNav = [
    { icon: BuildingOffice2Icon, label: 'Company', view: 'company' },
    { icon: CogIcon, label: 'System', view: 'system' },
    { icon: UpdateIcon, label: 'Updater', view: 'updater' },
    { icon: QuestionMarkCircleIcon, label: 'Help', view: 'help' },
  ];

  return (
    <aside className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-16'}`}>
      <div className="h-full overflow-y-auto bg-white px-3 py-4 shadow-lg dark:bg-slate-800">
        <div className="mb-5 flex items-center pl-2.5">
            <MikroTikLogoIcon className="mr-3 h-8 w-8" />
            {isSidebarOpen && <span className="self-center whitespace-nowrap text-xl font-semibold dark:text-white">MikroTik UI</span>}
        </div>
        <ul className="space-y-2">
            {mainNav.map(item => <NavItem key={item.view} icon={item.icon} label={item.label} viewName={item.view as View} currentView={view} setView={setView} isSidebarOpen={isSidebarOpen} />)}
        </ul>
        {isSidebarOpen && <hr className="my-4 border-slate-200 dark:border-slate-600" />}
        <ul className="space-y-2">
            {businessNav.map(item => <NavItem key={item.view} icon={item.icon} label={item.label} viewName={item.view as View} currentView={view} setView={setView} isSidebarOpen={isSidebarOpen} />)}
        </ul>
        {isSidebarOpen && <hr className="my-4 border-slate-200 dark:border-slate-600" />}
        <ul className="space-y-2">
            {systemNav.map(item => <NavItem key={item.view} icon={item.icon} label={item.label} viewName={item.view as View} currentView={view} setView={setView} isSidebarOpen={isSidebarOpen} />)}
        </ul>
      </div>
    </aside>
  );
};
