
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
import { Company } from './components/Company.tsx';
import { Loader } from './components/Loader.tsx';
import { useRouters } from './hooks/useRouters.ts';
import { useSalesData } from './hooks/useSalesData.ts';
import { useInventoryData } from './hooks/useInventoryData.ts';
import { useCompanySettings } from './hooks/useCompanySettings.ts';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import type { View } from './types.ts';

const useMediaQuery = (query: string): boolean => {
  const getMatches = (query: string): boolean => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  };

  const [matches, setMatches] = useState<boolean>(getMatches(query));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    
    // Listen for changes
    try {
        mediaQuery.addEventListener('change', handleChange);
    } catch (e) {
        // For older browsers
        mediaQuery.addListener(handleChange);
    }

    return () => {
       try {
            mediaQuery.removeEventListener('change', handleChange);
        } catch (e) {
            // For older browsers
            mediaQuery.removeListener(handleChange);
        }
    };
  }, [query]);

  return matches;
};

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const [isSidebarOpen, setIsSidebarOpen] = useState(isLargeScreen);
  
  const { routers, addRouter, updateRouter, deleteRouter, isLoading: isLoadingRouters } = useRouters();
  const { sales, addSale, deleteSale, clearSales, isLoading: isLoadingSales } = useSalesData();
  const { items, addItem, updateItem, deleteItem, isLoading: isLoadingInventory } = useInventoryData();
  const { settings: companySettings, updateSettings: updateCompanySettings, isLoading: isLoadingCompany } = useCompanySettings();
  const { t, isLoading: isLoadingLocalization } = useLocalization();


  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(null);

  const appIsLoading = isLoadingRouters || isLoadingSales || isLoadingInventory || isLoadingCompany || isLoadingLocalization;

  // Effect to manage sidebar visibility based on screen size
  useEffect(() => {
    setIsSidebarOpen(isLargeScreen);
  }, [isLargeScreen]);

  // Close sidebar on view change on mobile
  useEffect(() => {
    if (!isLargeScreen) {
        setIsSidebarOpen(false);
    }
  }, [currentView, isLargeScreen]);

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
                <p className="mt-4 text-[--color-primary-400]">{t('app.loading_data')}</p>
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
          return <SalesReport salesData={sales} deleteSale={deleteSale} clearSales={clearSales} companySettings={companySettings} />;
      case 'inventory':
          return <Inventory items={items} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} />;
      case 'hotspot':
          return <Hotspot selectedRouter={selectedRouter} />;
      case 'zerotier':
          return <ZeroTier />;
      case 'company':
          return <Company settings={companySettings} onSave={updateCompanySettings} />;
      case 'system':
          return <SystemSettings selectedRouter={selectedRouter} />;
      case 'updater':
        return <Updater />;
      default:
        return <Dashboard selectedRouter={selectedRouter} />;
    }
  };

  return (
    <div className="flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        companySettings={companySettings}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
       {/* Mobile sidebar overlay */}
      {isSidebarOpen && !isLargeScreen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={t(`titles.${currentView}`)}
          routers={routers}
          selectedRouter={selectedRouter}
          onSelectRouter={setSelectedRouterId}
          setCurrentView={setCurrentView}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <div className="p-4 sm:p-8 overflow-auto">
          {renderView()}
        </div>
      </main>
      <Help currentView={currentView} selectedRouter={selectedRouter} />
    </div>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <LocalizationProvider>
      <AppContent />
    </LocalizationProvider>
  </ThemeProvider>
);


export default App;
