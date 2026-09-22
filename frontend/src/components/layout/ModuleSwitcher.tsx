import React from 'react';
import { Gavel, LineChart, Ship, LayoutGrid, Lock } from 'lucide-react';

export type ModuleId = 'tenders' | 'priceIndex' | 'shipping' | 'topModules';

interface ModuleDef {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  available: boolean;
}

export const MODULES: ModuleDef[] = [
  {
    id: 'tenders',
    label: 'Tenders',
    shortLabel: 'Tenders',
    icon: <Gavel className="w-4 h-4" />,
    available: true,
  },
  {
    id: 'priceIndex',
    label: 'Price Index',
    shortLabel: 'Prices',
    icon: <LineChart className="w-4 h-4" />,
    available: true,
  },
  {
    id: 'shipping',
    label: 'Shipping & Financials',
    shortLabel: 'Shipping',
    icon: <Ship className="w-4 h-4" />,
    available: false,
  },
  {
    id: 'topModules',
    label: 'Top Modules',
    shortLabel: 'Modules',
    icon: <LayoutGrid className="w-4 h-4" />,
    available: false,
  },
];

interface ModuleSwitcherProps {
  active: ModuleId;
  onChange: (id: ModuleId) => void;
}

export const ModuleSwitcher: React.FC<ModuleSwitcherProps> = ({ active, onChange }) => {
  return (
    <nav
      aria-label="Terminal modules"
      className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 ring-1 ring-line"
    >
      {MODULES.map((mod) => {
        const isActive = mod.id === active;
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => mod.available && onChange(mod.id)}
            disabled={!mod.available}
            aria-current={isActive ? 'page' : undefined}
            title={mod.available ? mod.label : `${mod.label} — coming soon`}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-2xs sm:text-xs font-semibold transition ${
              isActive
                ? 'bg-white text-brand-700 shadow-soft ring-1 ring-line'
                : mod.available
                ? 'text-slate-500 hover:text-slate-800 hover:bg-white/70 cursor-pointer'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            {mod.available ? mod.icon : <Lock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{mod.label}</span>
            <span className="sm:hidden">{mod.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
};
