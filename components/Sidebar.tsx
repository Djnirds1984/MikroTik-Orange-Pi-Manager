import React from 'react';
import { MikroTikLogoIcon } from '../constants.tsx';

type View = 'dashboard' | 'pppoe' | 'scripting' | 'updater' | 'routers';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

const NavLink: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-3 ${
      isActive
        ? 'bg-orange-600 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`}
  >
    {label}
  </button>
);


export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  return (
    <aside className="fixed top-0 left-0 h-full w-64 bg-slate-800 border-r border-slate-700 flex flex-col p-4 z-30">
        <div className="flex items-center gap-3 px-2 pb-6 border-b border-slate-700">
          <MikroTikLogoIcon className="h-10 w-10 text-orange-500" />
          <div>
            <h1 className="text-lg font-bold text-slate-100">MikroTik Manager</h1>
            <p className="text-xs text-slate-400">for Orange Pi</p>
          </div>
        </div>
      
        <nav className="flex flex-col gap-2 mt-6">
            <NavLink label="Dashboard" isActive={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
            <NavLink label="PPPoE" isActive={currentView === 'pppoe'} onClick={() => setCurrentView('pppoe')} />
            <NavLink label="Routers" isActive={currentView === 'routers'} onClick={() => setCurrentView('routers')} />
            <NavLink label="AI Script" isActive={currentView === 'scripting'} onClick={() => setCurrentView('scripting')} />
            <NavLink label="Updater" isActive={currentView === 'updater'} onClick={() => setCurrentView('updater')} />
        </nav>
    </aside>
  );
};