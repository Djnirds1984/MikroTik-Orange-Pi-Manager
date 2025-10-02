import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Dashboard } from './components/Dashboard';
import { Scripting } from './components/Scripting';
import { Updater } from './components/Updater';
import { Routers } from './components/Routers';
import { useRouters } from './hooks/useRouters';

type View = 'dashboard' | 'scripting' | 'updater' | 'routers';

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
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans">
      <Header 
        currentView={currentView} 
        setCurrentView={setCurrentView}
        routers={routers}
        selectedRouter={selectedRouter}
        onSelectRouter={setSelectedRouterId}
      />
      <main className="flex-grow container mx-auto px-4 py-8">
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
  );
};

export default App;
