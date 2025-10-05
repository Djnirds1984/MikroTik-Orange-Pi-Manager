import React from 'react';
import { MikroTikLogoIcon, EthernetIcon, EditIcon, RouterIcon, VlanIcon, UpdateIcon, SignalIcon, UsersIcon, ZeroTierIcon, WifiIcon, CogIcon } from '../constants.tsx';
import type { View } from '../types.ts';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex items-center w-full p-3 text-base font-normal rounded-lg transition duration-75 group ${
          isActive
            ? 'bg-orange-600 text-white'
            : 'text-slate-300 hover:bg-slate-700'
        }`}
      >
        {icon}
        <span className="flex-1 ml-3 text-left whitespace-nowrap">{label}</span>
      </button>
    </li>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <EthernetIcon className="w-6 h-6" /> },
    { id: 'scripting', label: 'AI Scripting', icon: <EditIcon className="w-6 h-6" /> },
    { id: 'routers', label: 'Routers', icon: <RouterIcon className="w-6 h-6" /> },
    { id: 'pppoe', label: 'PPPoE Profiles', icon: <VlanIcon className="w-6 h-6" /> },
    { id: 'users', label: 'PPPoE Users', icon: <UsersIcon className="w-6 h-6" /> },
    { id: 'billing', label: 'Billing Plans', icon: <SignalIcon className="w-6 h-6" /> },
    { id: 'hotspot', label: 'Hotspot', icon: <WifiIcon className="w-6 h-6" /> },
    { id: 'zerotier', label: 'ZeroTier', icon: <ZeroTierIcon className="w-6 h-6" /> },
    { id: 'system', label: 'System Settings', icon: <CogIcon className="w-6 h-6" /> },
    { id: 'updater', label: 'Updater', icon: <UpdateIcon className="w-6 h-6" /> },
  ] as const;

  return (
    <aside className="w-64 h-screen sticky top-0 bg-slate-900 border-r border-slate-800" aria-label="Sidebar">
      <div className="flex items-center justify-center h-16 border-b border-slate-800">
          <MikroTikLogoIcon className="w-8 h-8 text-orange-500" />
          <span className="self-center ml-3 text-xl font-semibold whitespace-nowrap text-white">MikroTik UI</span>
      </div>
      <div className="h-full px-3 py-4 overflow-y-auto">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              label={item.label}
              icon={item.icon}
              isActive={currentView === item.id}
              onClick={() => setCurrentView(item.id)}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
};