import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterSectionProps {
  title: string;
  sectionKey: string;
  children: React.ReactNode;
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  sectionKey,
  children,
}) => {
  const localStorageKey = `filter-section-collapsed-${sectionKey}`;

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(localStorageKey);
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(localStorageKey, String(isOpen));
  }, [isOpen, localStorageKey]);

  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-3 text-2xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition cursor-pointer select-none text-left"
      >
        <span>{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? '' : '-rotate-90'
          }`}
        />
      </button>

      {isOpen && (
        <div className="pb-4 flex flex-col gap-3.5 animate-pop">{children}</div>
      )}
    </div>
  );
};
