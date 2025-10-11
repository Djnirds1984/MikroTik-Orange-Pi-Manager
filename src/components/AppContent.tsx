import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Dashboard } from './Dashboard';
import { Scripting } from './Scripting';
import { Routers } from './Routers';
import { Network } from './Network';
import { Pppoe, Users as PppoeUsers } from './Pppoe';
import { Billing } from './Billing';
import { SalesReport } from './SalesReport';
import { Inventory } from './Inventory';
import { Hotspot } from './Hotspot';
import { VoucherHotspot } from './VoucherHotspot';
import { ZeroTier } from './ZeroTier';
import { Company } from './Company';
import { SystemSettings } from './SystemSettings';
import { Updater } from './Updater';
import { SuperRouter } from './SuperRouter';
import { Logs } from './Logs';
import { Help } from './Help';
import { Terminal } from './Terminal';
import { View } from '../types';
import { useRouters } from '../hooks/useRouters';

export const AppContent: React.FC = () => {
  const [view, setView] = useState<View>('dashboard');
  const { routers, selectedRouter, setSelectedRouter, isLoading: routersLoading } = useRouters();
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard selectedRouter={selectedRouter} />;
      case 'scripting':
        return <Scripting selectedRouter={selectedRouter} />;
      case 'routers':
        return <Routers />;
      case 'network':
          return <Network selectedRouter={selectedRouter} />;
      case 'pppoe':
          return <Pppoe selectedRouter={selectedRouter} />;
      case 'users':
          return <PppoeUsers selectedRouter={selectedRouter} />;
      case 'billing':
          return <Billing selectedRouter={selectedRouter} />;
      case 'sales':
          return <SalesReport selectedRouter={selectedRouter} />;
      case 'inventory':
          return <Inventory />;
      case 'hotspot':
          return <Hotspot selectedRouter={selectedRouter} />;
      case 'panel_hotspot':
          return <VoucherHotspot selectedRouter={selectedRouter} />;
      case 'zerotier':
          return <ZeroTier selectedRouter={selectedRouter} />;
      case 'company':
          return <Company />;
      case 'system':
          return <SystemSettings selectedRouter={selectedRouter} />;
      case 'updater':
          return <Updater />;
      case 'super_router':
          return <SuperRouter />;
      case 'logs':
          return <Logs selectedRouter={selectedRouter} />;
      case 'help':
          return <Help />;
      case 'terminal':
          return <Terminal selectedRouter={selectedRouter} />;
      default:
        return <Dashboard selectedRouter={selectedRouter} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">
      <Sidebar view={view} setView={setView} isSidebarOpen={isSidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <TopBar
          routers={routers || []}
          selectedRouter={selectedRouter}
          onSelectRouter={setSelectedRouter}
          routersLoading={routersLoading}
          toggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
};
