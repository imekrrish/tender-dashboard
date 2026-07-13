import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

interface DashboardLayoutProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  sidebar,
  header,
  children,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col font-sans text-ink">
      {/* Top Header */}
      {header}

      {/* Workspace Grid Layout */}
      <div className="flex-1 flex relative w-full">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-[300px] shrink-0 bg-white/55 backdrop-blur-sm border-r border-white/60 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto">
          <div className="p-5">{sidebar}</div>
        </aside>

        {/* Mobile drawer overlay */}
        {isMobileSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <aside
          className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[300px] bg-surface shadow-pop transform transition-transform duration-300 ease-out overflow-y-auto ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-5 flex items-center justify-between border-b border-line">
            <span className="text-sm font-semibold text-slate-800">Filters</span>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="p-5">{sidebar}</div>
        </aside>

        {/* Floating mobile trigger */}
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 z-30 flex items-center gap-2 pl-3.5 pr-4 py-3 bg-brand-600 text-white rounded-full shadow-pop cursor-pointer hover:bg-brand-700 transition active:scale-95"
          title="Open Filters"
        >
          <SlidersHorizontal className="w-4.5 h-4.5" />
          <span className="text-sm font-semibold">Filters</span>
        </button>

        {/* Central content */}
        <main className="flex-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-[1360px]">{children}</div>
        </main>
      </div>
    </div>
  );
};
