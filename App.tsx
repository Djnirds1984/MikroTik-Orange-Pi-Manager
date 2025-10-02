
import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Dashboard } from './components/Dashboard';
import { Scripting } from './components/Scripting';

type View = 'dashboard' | 'scripting';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col font-sans">
      <Header currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-grow container mx-auto px-4 py-8">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'scripting' && <Scripting />}
      </main>
      <Footer />
    </div>
  );
};

export default App;
