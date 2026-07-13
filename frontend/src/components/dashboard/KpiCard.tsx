import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle: string;
  icon?: React.ReactNode;
  accent?: string; // tailwind text/bg classes for the icon chip, e.g. "bg-amber-50 text-amber-600"
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  accent = 'bg-brand-50 text-brand-600',
}) => {
  return (
    <div className="group rounded-2xl bg-white shadow-card ring-1 ring-line p-5 transition-shadow duration-200 hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${accent}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 font-display text-[26px] leading-none font-semibold text-slate-900 tnum truncate">
        {value}
      </div>
      <p className="mt-2 text-2xs text-slate-400 font-medium truncate">{subtitle}</p>
    </div>
  );
};
