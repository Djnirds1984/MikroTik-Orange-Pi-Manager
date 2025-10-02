
import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Dashboard } from './components/Dashboard';
import { Scripting } from './components/Scripting';
import { Updater } from './components/Updater';

type View = 'dashboard' | 'scripting' | 'updater';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans">
      <Header currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-grow container mx-auto px-4 py-8">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'scripting' && <Scripting />}
        {currentView === 'updater' && <Updater />}
      </main>
      <Footer />
    </div>
  );
};

export default App;
