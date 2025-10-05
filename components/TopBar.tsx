import React, { useState, useEffect, useRef } from 'react';
import type { RouterConfigWithId, View } from '../types.ts';
import { useLocalization } from '../contexts/LocalizationContext.tsx';


interface TopBarProps {
  title: string;
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (id: string | null) => void;
  setCurrentView: (view: View) => void;
  onToggleSidebar: () => void;
}

const MenuIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);

const RouterSelector: React.FC<{
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (id: string) => void;
  setCurrentView: (view: View) => void;
}> = ({ routers, selectedRouter, onSelectRouter, setCurrentView }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { t } = useLocalization();

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
                title={t('topbar.add_router_title')}
            >
                {t('topbar.add_a_router')}
            </button>
        );
    }
    
    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"
            >
                <span className="text-slate-300 hidden sm:inline">{t('topbar.router')}:</span>
                <span className="font-semibold text-white max-w-[120px] sm:max-w-xs truncate">{selectedRouter?.name || t('topbar.select')}</span>
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

export const TopBar: React.FC<TopBarProps> = ({ title, routers, selectedRouter, onSelectRouter, setCurrentView, onToggleSidebar }) => {
  return (
    <header className="bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20 border-b border-slate-700">
      <div className="flex items-center justify-between h-16 px-4 sm:px-8">
        <div className="flex items-center gap-4">
            <button onClick={onToggleSidebar} className="lg:hidden text-slate-400 hover:text-white" aria-label="Open sidebar">
                <MenuIcon className="w-6 h-6" />
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-slate-100 truncate">{title}</h1>
        </div>
        <RouterSelector 
            routers={routers} 
            selectedRouter={selectedRouter} 
            onSelectRouter={onSelectRouter} 
            setCurrentView={setCurrentView} 
        />
      </div>
    </header>
  );
};
