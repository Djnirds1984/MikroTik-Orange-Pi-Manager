import React, { useState, useEffect, useRef } from 'react';
import { MikroTikLogoIcon } from '../constants';
import type { RouterConfigWithId } from '../types';

interface HeaderProps {
  currentView: 'dashboard' | 'scripting' | 'updater' | 'routers';
  setCurrentView: (view: 'dashboard' | 'scripting' | 'updater' | 'routers') => void;
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (id: string | null) => void;
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

const RouterSelector: React.FC<{
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (id: string) => void;
  setCurrentView: (view: 'dashboard' | 'scripting' | 'updater' | 'routers') => void;
}> = ({ routers, selectedRouter, onSelectRouter, setCurrentView }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (routers.length === 0) {
        return (
            <button
                onClick={() => setCurrentView('routers')}
                className="px-4 py-2 text-sm text-slate-100 bg-orange-600 hover:bg-orange-500 rounded-md transition-colors font-semibold"
                title="Go to Routers page to add a new router"
            >
                Add a Router
            </button>
        );
    }
    
    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
            >
                <span className="text-slate-300">Router:</span>
                <span className="font-semibold text-white">{selectedRouter?.name || 'Select...'}</span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-md shadow-lg z-30">
                    <ul className="py-1">
                        {routers.map(router => (
                            <li key={router.id}>
                                <button 
                                    onClick={() => {
                                        onSelectRouter(router.id);
                                        setIsOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                                >
                                    {router.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, routers, selectedRouter, onSelectRouter }) => {
  return (
    <header className="bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20 border-b border-slate-800">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <MikroTikLogoIcon className="h-10 w-10 text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">MikroTik Orange Pi Manager</h1>
            <p className="text-xs text-slate-400">Multi-Router Dashboard & AI Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            <RouterSelector 
                routers={routers} 
                selectedRouter={selectedRouter} 
                onSelectRouter={onSelectRouter} 
                setCurrentView={setCurrentView} 
            />
            <nav className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg">
                <NavLink label="Dashboard" isActive={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                <NavLink label="Routers" isActive={currentView === 'routers'} onClick={() => setCurrentView('routers')} />
                <NavLink label="AI Script" isActive={currentView === 'scripting'} onClick={() => setCurrentView('scripting')} />
                <NavLink label="Updater" isActive={currentView === 'updater'} onClick={() => setCurrentView('updater')} />
            </nav>
        </div>
      </div>
    </header>
  );
};