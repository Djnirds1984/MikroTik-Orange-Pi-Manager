import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useRouters } from './hooks/useRouters';
import { useSalesData } from './hooks/useSalesData';
import { useInventoryData } from './hooks/useInventoryData';
import { useExpensesData } from './hooks/useExpensesData';
import { useCompanySettings } from './hooks/useCompanySettings';
import { Dashboard } from './components/Dashboard';
import { Scripting } from './components/Scripting';
import { Routers } from './components/Routers';
import { Network } from './components/Network';
import { Terminal } from './components/Terminal';
import { Pppoe } from './components/Pppoe';
import { Billing } from './components/Billing';
import { SalesReport } from './components/SalesReport';
import { Inventory } from './components/Inventory';
import { Hotspot } from './components/Hotspot';
import { PanelHotspot } from './components/VoucherHotspot';
import { ZeroTier } from './components/ZeroTier';
import { Company } from './components/Company';
import { SystemSettings } from './components/SystemSettings';
import { Updater } from './components/Updater';
import { SuperRouter } from './components/SuperRouter';
import { Logs } from './components/Logs';
import { PanelRoles } from './components/PanelRoles';
import { MikrotikFiles } from './components/MikrotikFiles';
import { License } from './components/License';
import { SuperAdmin } from './components/SuperAdmin';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { ForgotPassword } from './components/ForgotPassword';
import { AuthLayout } from './components/AuthLayout';
import { Loader } from './components/Loader';
import { ThemeProvider } from './contexts/ThemeContext';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext';
import { Help } from './components/Help';
import type { View } from './types';

// The main content of the app, rendered after authentication and localization are ready.
const AppContent: React.FC = () => {
    const { user, isLoading, hasUsers } = useAuth();
    const { isLoading: isLocalizationLoading } = useLocalization();
    const [authScreen, setAuthScreen] = useState<'login' | 'register' | 'forgot'>('login');

    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [selectedRouterId, setSelectedRouterId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile

    const { routers, addRouter, updateRouter, deleteRouter, isLoading: isLoadingRouters } = useRouters();
    const { sales, addSale, deleteSale, clearSales } = useSalesData(selectedRouterId);
    const { items, addItem, updateItem, deleteItem } = useInventoryData();
    const { expenses, addExpense, updateExpense, deleteExpense } = useExpensesData();
    const { settings: companySettings, updateSettings: updateCompanySettings, isLoading: isLoadingCompany } = useCompanySettings();

    const selectedRouter = useMemo(() => routers.find(r => r.id === selectedRouterId) || null, [routers, selectedRouterId]);

    // Effect to set the first router as selected by default
    useEffect(() => {
        if (!isLoadingRouters && routers.length > 0 && !selectedRouterId) {
            const savedRouterId = localStorage.getItem('selectedRouterId');
            if (savedRouterId && routers.some(r => r.id === savedRouterId)) {
                setSelectedRouterId(savedRouterId);
            } else {
                setSelectedRouterId(routers[0].id);
            }
        }
        if (!isLoadingRouters && routers.length === 0) {
            setSelectedRouterId(null);
        }
    }, [isLoadingRouters, routers, selectedRouterId]);
    
    // Save selected router to local storage
    useEffect(() => {
        if (selectedRouterId) {
            localStorage.setItem('selectedRouterId', selectedRouterId);
        } else {
            localStorage.removeItem('selectedRouterId');
        }
    }, [selectedRouterId]);
    
     useEffect(() => {
        if (!isLoading) {
            setAuthScreen(hasUsers ? 'login' : 'register');
        }
    }, [isLoading, hasUsers]);

    const isAppLoading = isLoading || isLocalizationLoading || isLoadingRouters || isLoadingCompany;
    
    if (isAppLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
                <Loader />
            </div>
        );
    }
    
    if (!user) {
        return (
            <AuthLayout>
                {authScreen === 'login' && <Login onSwitchToForgotPassword={() => setAuthScreen('forgot')} />}
                {authScreen === 'register' && <Register />}
                {authScreen === 'forgot' && <ForgotPassword onSwitchToLogin={() => setAuthScreen('login')} />}
            </AuthLayout>
        );
    }

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <Dashboard selectedRouter={selectedRouter} />;
            case 'scripting': return <Scripting />;
            case 'routers': return <Routers routers={routers} onAddRouter={addRouter} onUpdateRouter={updateRouter} onDeleteRouter={deleteRouter} />;
            case 'network': return <Network selectedRouter={selectedRouter} />;
            case 'terminal': return <Terminal selectedRouter={selectedRouter} />;
            case 'pppoe': return <Pppoe selectedRouter={selectedRouter} addSale={addSale} />;
            case 'billing': return <Billing selectedRouter={selectedRouter} />;
            case 'sales': return <SalesReport salesData={sales} deleteSale={deleteSale} clearSales={clearSales} companySettings={companySettings} />;
            case 'inventory': return <Inventory items={items} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} expenses={expenses} addExpense={addExpense} updateExpense={updateExpense} deleteExpense={deleteExpense}/>;
            case 'hotspot': return <Hotspot selectedRouter={selectedRouter} />;
            case 'panel_hotspot': return <PanelHotspot selectedRouter={selectedRouter} />;
            case 'zerotier': return <ZeroTier />;
            case 'mikrotik_files': return <MikrotikFiles selectedRouter={selectedRouter} />;
            case 'company': return <Company settings={companySettings} onSave={updateCompanySettings} />;
            case 'system': return <SystemSettings selectedRouter={selectedRouter} />;
            case 'updater': return <Updater />;
            case 'super_router': return <SuperRouter />;
            case 'logs': return <Logs selectedRouter={selectedRouter} />;
            case 'panel_roles': return <PanelRoles />;
            case 'license': return <License />;
            case 'super_admin': return <SuperAdmin />;
            case 'help': return <Help currentView={currentView} selectedRouter={selectedRouter} />;
            default: return <Dashboard selectedRouter={selectedRouter} />;
        }
    };
    
    const { t } = useLocalization();

    return (
        <div className="flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
            <Sidebar currentView={currentView} setCurrentView={setCurrentView} companySettings={companySettings} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />}
            <main className="flex-1 flex flex-col min-w-0">
                <TopBar
                    title={t(`titles.${currentView}`, { routerName: selectedRouter?.name || '' })}
                    routers={routers}
                    selectedRouter={selectedRouter}
                    onSelectRouter={setSelectedRouterId}
                    setCurrentView={setCurrentView}
                    onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                />
                <div className="p-4 sm:p-8 overflow-auto h-full flex flex-col">
                    <div className="flex-grow">
                        {renderView()}
                    </div>
                </div>
            </main>
            <Help currentView={currentView} selectedRouter={selectedRouter} />
        </div>
    );
};

// Top-level component that provides all contexts.
export default function App() {
    return (
        <ThemeProvider>
            <LocalizationProvider>
                <AppContent />
            </LocalizationProvider>
        </ThemeProvider>
    );
}
