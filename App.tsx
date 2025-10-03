import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { Footer } from './components/Footer.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Scripting } from './components/Scripting.tsx';
import { Updater } from './components/Updater.tsx';
import { Routers } from './components/Routers.tsx';
import { useRouters } from './hooks/useRouters.ts';

type View = 'dashboard' | 'scripting' | 'updater' | 'routers';

const VIEW_TITLES: Record<View, string> = {
  dashboard: 'Dashboard',
  scripting: 'AI Script Assistant',
  updater: 'Panel Updater',
  routers: 'Manage Routers',
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const { routers, addRouter, updateRouter, deleteRouter } = useRouters();
  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(() => {
    return localStorage.getItem('selectedRouterId');
  });

  useEffect(() => {
    if (selectedRouterId) {
      localStorage.setItem('selectedRouterId', selectedRouterId);
    } else {
      localStorage.removeItem('selectedRouterId');
    }
  }, [selectedRouterId]);

  useEffect(() => {
    // If there's no selected router, try to select the first one.
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
    // If the selected router was deleted, clear the selection.
    if (selectedRouterId && !routers.find(r => r.id === selectedRouterId)) {
      setSelectedRouterId(null);
    }
  }, [routers, selectedRouterId]);
  
  const selectedRouter = routers.find(r => r.id === selectedRouterId) || null;

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-200 font-sans">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      
      <div className="flex-grow flex flex-col ml-64"> {/* Offset for sidebar width */}
        <TopBar
            title={VIEW_TITLES[currentView]}
            routers={routers}
            selectedRouter={selectedRouter}
            onSelectRouter={setSelectedRouterId}
            setCurrentView={setCurrentView}
        />
        <main className="flex-grow container mx-auto px-8 py-8">
          {currentView === 'dashboard' && <Dashboard selectedRouter={selectedRouter} />}
          {currentView === 'scripting' && <Scripting />}
          {currentView === 'updater' && <Updater />}
          {currentView === 'routers' && (
            <Routers 
              routers={routers}
              onAddRouter={addRouter}
              onUpdateRouter={updateRouter}
              onDeleteRouter={deleteRouter}
            />
          )}
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default App;
