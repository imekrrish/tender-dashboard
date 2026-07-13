import React from 'react';
import { SearchX } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data available',
  message = 'No data matches your active filter selection.',
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="grid place-items-center w-14 h-14 rounded-2xl bg-slate-50 ring-1 ring-line mb-4">
        <SearchX className="w-6 h-6 text-slate-300" />
      </div>
      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
      <p className="text-2xs text-slate-400 mt-1.5 max-w-[280px] leading-relaxed">{message}</p>
    </div>
  );
};
