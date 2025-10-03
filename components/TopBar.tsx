import React, { useState, useEffect, useRef } from 'react';
import type { RouterConfigWithId } from '../types.ts';

interface TopBarProps {
  title: string;
  routers: RouterConfigWithId[];
  selectedRouter: RouterConfigWithId | null;
  onSelectRouter: (id: string | null) => void;
  setCurrentView: (view: 'dashboard' | 'scripting' | 'updater' | 'routers') => void;
}

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

export const TopBar: React.FC<TopBarProps> = ({ title, routers, selectedRouter, onSelectRouter, setCurrentView }) => {
  return (
    <header className="bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20 border-b border-slate-700">
      <div className="flex items-center justify-between h-16 px-8">
        <h1 className="text-xl font-bold text-slate-100">{title}</h1>
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
