import React from 'react';
import { KpiCard } from './KpiCard';
import type { KpiSummary } from '../../types/tender';
import { LayoutGrid, Zap, Coins, Globe2, Building2, CircleCheckBig } from 'lucide-react';

interface KpiGridProps {
  summary: KpiSummary;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ summary }) => {
  const formatTariff = () => {
    const hasInr = summary.avgTariffINR > 0;
    const hasUsd = summary.avgTariffUSD > 0;
    if (hasInr && hasUsd) {
      return `₹${summary.avgTariffINR.toFixed(2)} / $${summary.avgTariffUSD.toFixed(3)}`;
    }
    if (hasInr) return `₹${summary.avgTariffINR.toFixed(2)}`;
    if (hasUsd) return `$${summary.avgTariffUSD.toFixed(3)}`;
    return '—';
  };

  const kpis = [
    {
      label: 'Total Projects',
      value: (summary.totalProjects || 0).toLocaleString(),
      subtitle: 'Tenders & auctions in view',
      icon: <LayoutGrid className="w-4 h-4" />,
      accent: 'bg-brand-50 text-brand-600',
    },
    {
      label: 'PV Capacity',
      value: summary.totalCapacityMW > 0 ? `${summary.totalCapacityMW.toLocaleString()} MW` : '—',
      subtitle:
        summary.totalCapacityGW > 0
          ? `${summary.totalCapacityGW.toFixed(2)} GW equivalent`
          : 'Based on filtered records',
      icon: <Zap className="w-4 h-4" />,
      accent: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Average Tariff',
      value: formatTariff(),
      subtitle: 'Per kWh winning rate',
      icon: <Coins className="w-4 h-4" />,
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Countries',
      value: (summary.countriesCount || 0).toLocaleString(),
      subtitle: 'Geographic coverage',
      icon: <Globe2 className="w-4 h-4" />,
      accent: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Developers',
      value: (summary.developersCount || 0).toLocaleString(),
      subtitle: 'Unique bid winners',
      icon: <Building2 className="w-4 h-4" />,
      accent: 'bg-fuchsia-50 text-fuchsia-600',
    },
    {
      label: 'Completed',
      value: (summary.completedCount || 0).toLocaleString(),
      subtitle: `${(summary.planningCount || 0).toLocaleString()} in planning`,
      icon: <CircleCheckBig className="w-4 h-4" />,
      accent: 'bg-teal-50 text-teal-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
      {kpis.map((kpi, index) => (
        <KpiCard
          key={index}
          label={kpi.label}
          value={kpi.value}
          subtitle={kpi.subtitle}
          icon={kpi.icon}
          accent={kpi.accent}
        />
      ))}
    </div>
  );
};
