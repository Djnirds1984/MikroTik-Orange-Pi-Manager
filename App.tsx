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
import { Inventory } from './components/Inventory.tsx';
import { Loader } from './components/Loader.tsx';
import { useRouters } from './hooks/useRouters.ts';
import { useSalesData } from './hooks/useSalesData.ts';
import { useInventoryData } from './hooks/useInventoryData.ts';
import type { View } from './types.ts';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  
  const { routers, addRouter, updateRouter, deleteRouter, isLoading: isLoadingRouters } = useRouters();
  const { sales, addSale, deleteSale, clearSales, isLoading: isLoadingSales } = useSalesData();
  const { items, addItem, updateItem, deleteItem, isLoading: isLoadingInventory } = useInventoryData();

  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(null);

  const appIsLoading = isLoadingRouters || isLoadingSales || isLoadingInventory;

  useEffect(() => {
    // This effect runs once after the initial data has loaded
    if (!appIsLoading && routers.length > 0 && !selectedRouterId) {
        setSelectedRouterId(routers[0].id);
    }
  }, [appIsLoading, routers, selectedRouterId]);

  useEffect(() => {
    // This effect ensures a router is always selected if possible
    if (!selectedRouterId && routers.length > 0) {
      setSelectedRouterId(routers[0].id);
    }
    if (selectedRouterId && !routers.find(r => r.id === selectedRouterId)) {
        setSelectedRouterId(routers.length > 0 ? routers[0].id : null);
    }
  }, [routers, selectedRouterId]);

  const selectedRouter = useMemo(
    () => routers.find(r => r.id === selectedRouterId) || null,
    [routers, selectedRouterId]
  );

  const renderView = () => {
    if (appIsLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <Loader />
                <p className="mt-4 text-orange-400">Loading application data...</p>
            </div>
        );
    }

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
      case 'inventory':
          return <Inventory items={items} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} />;
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
    inventory: 'Stock & Inventory',
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