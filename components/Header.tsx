
import React from 'react';
import { MikroTikLogoIcon } from '../constants';

interface HeaderProps {
  currentView: 'dashboard' | 'scripting';
  setCurrentView: (view: 'dashboard' | 'scripting') => void;
}

const NavLink: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
      isActive
        ? 'bg-orange-600 text-white'
        : 'text-slate-300 hover:bg-slate-700'
    }`}
  >
    {label}
  </button>
);


export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView }) => {
  return (
    <header className="bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20 border-b border-slate-800">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <MikroTikLogoIcon className="h-10 w-10 text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">MikroTik Orange Pi Manager</h1>
            <p className="text-xs text-slate-400">Dashboard & AI Script Assistant</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg">
          <NavLink label="Dashboard" isActive={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
          <NavLink label="AI Script Generator" isActive={currentView === 'scripting'} onClick={() => setCurrentView('scripting')} />
        </nav>
      </div>
    </header>
  );
};
