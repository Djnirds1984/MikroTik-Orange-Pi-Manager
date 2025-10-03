import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { Scripting } from './components/Scripting';
import { Routers } from './components/Routers';
import { Updater } from './components/Updater';
import { Pppoe } from './components/Pppoe';
import { Billing } from './components/Billing';
import { useRouters } from './hooks/useRouters';
import type { View } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(() => {
    // Initialize selected router from localStorage if available
    try {
      const storedRouters = JSON.parse(localStorage.getItem('mikrotikRouters') || '[]');
      return storedRouters.length > 0 ? storedRouters[0].id : null;
    } catch {
      return null;
    }
  });
  const { routers, addRouter, updateRouter, deleteRouter } = useRouters();

  useEffect(() => {
    // If there's no selected router but there are routers available, select the first one.
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
    // If the selected router is deleted, clear the selection and pick the first available.
    if (selectedRouterId && !routers.find(r => r.id === selectedRouterId)) {
        setSelectedRouterId(routers.length > 0 ? routers[0].id : null);
    }
  }, [routers, selectedRouterId]);

  const selectedRouter = useMemo(
    () => routers.find(r => r.id === selectedRouterId) || null,
    [routers, selectedRouterId]
  );

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard selectedRouter={selectedRouter} />;
      case 'scripting':
        return <Scripting />;
      case 'routers':
        return <Routers routers={routers} onAddRouter={addRouter} onUpdateRouter={updateRouter} onDeleteRouter={deleteRouter} />;
      case 'pppoe':
          return <Pppoe selectedRouter={selectedRouter} />;
      case 'billing':
          return <Billing />;
      case 'updater':
        return <Updater />;
      default:
        return <Dashboard selectedRouter={selectedRouter} />;
    }
  };

  const titles: Record<View, string> = {
    dashboard: 'Dashboard',
    scripting: 'AI Script Generator',
    routers: 'Router Management',
    pppoe: 'PPPoE Server',
    billing: 'Billing Plans',
    updater: 'Panel Updater',
  };

  return (
    <div className="flex bg-slate-950 text-slate-100 min-h-screen">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-1 flex flex-col">
        <TopBar
          title={titles[currentView]}
          routers={routers}
          selectedRouter={selectedRouter}
          onSelectRouter={setSelectedRouterId}
          setCurrentView={setCurrentView}
        />
        <div className="p-8 overflow-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
