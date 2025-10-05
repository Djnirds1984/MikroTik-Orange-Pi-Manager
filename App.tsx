



import React, { useState, useMemo, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { Scripting } from './components/Scripting.tsx';
import { Routers } from './components/Routers.tsx';
import { Updater } from './components/Updater.tsx';
import { Pppoe } from './components/Pppoe.tsx';
import { Users } from './components/Users.tsx';
import { Billing } from './components/Billing.tsx';
import { ZeroTier } from './components/ZeroTier.tsx';
import { Hotspot } from './components/Hotspot.tsx';
import { Help } from './components/Help.tsx';
import { SystemSettings } from './components/SystemSettings.tsx';
import { SalesReport } from './components/SalesReport.tsx';
import { Network } from './components/Network.tsx';
import { useRouters } from './hooks/useRouters.ts';
import { useSalesData } from './hooks/useSalesData.ts';
import type { View } from './types.ts';

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
  const { sales, addSale, deleteSale, clearSales } = useSalesData();

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
      case 'network':
          return <Network selectedRouter={selectedRouter} />;
      case 'pppoe':
          return <Pppoe selectedRouter={selectedRouter} />;
      case 'users':
          return <Users selectedRouter={selectedRouter} addSale={addSale} />;
      case 'billing':
          return <Billing selectedRouter={selectedRouter} />;
      case 'sales':
          return <SalesReport salesData={sales} deleteSale={deleteSale} clearSales={clearSales} />;
      case 'hotspot':
          return <Hotspot selectedRouter={selectedRouter} />;
      case 'zerotier':
          return <ZeroTier />;
      case 'system':
          return <SystemSettings selectedRouter={selectedRouter} />;
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
    network: 'Network Management',
    pppoe: 'PPPoE Profiles',
    users: 'PPPoE Users',
    billing: 'Billing Plans',
    sales: 'Sales Report',
    hotspot: 'Hotspot Management',
    zerotier: 'ZeroTier Management',
    system: 'System Settings',
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
      <Help currentView={currentView} selectedRouter={selectedRouter} />
    </div>
  );
};

export default App;
