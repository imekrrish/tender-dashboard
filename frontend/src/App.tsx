import React, { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { PriceIndex } from './pages/PriceIndex';
import type { ModuleId } from './components/layout/ModuleSwitcher';
import './App.css';

const STORAGE_KEY = 'activeModule';

const App: React.FC = () => {
  // The terminal will grow to four modules; the switcher remembers where you were.
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'priceIndex' ? 'priceIndex' : 'tenders';
  });

  const handleModuleChange = (id: ModuleId) => {
    setActiveModule(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  if (activeModule === 'priceIndex') {
    return <PriceIndex activeModule={activeModule} onModuleChange={handleModuleChange} />;
  }

  return <Dashboard activeModule={activeModule} onModuleChange={handleModuleChange} />;
};

export default App;
