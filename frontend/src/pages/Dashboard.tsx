import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Header } from '../components/layout/Header';
import { FilterPanel } from '../components/filters/FilterPanel';
import { FileStatusCard } from '../components/dashboard/FileStatusCard';
import { KpiGrid } from '../components/dashboard/KpiGrid';
import { ChartCard } from '../components/dashboard/ChartCard';
import {
  getExcelMetadata,
  uploadExcelFile,
  queryTenders,
} from '../services/api';
import type { ExcelMetadata } from '../services/api';
import { Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const Dashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Dynamic spreadsheet metadata
  const [metadata, setMetadata] = useState<ExcelMetadata | null>(null);
  const [filterOptions, setFilterOptions] = useState<Record<string, string[] | number[]>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  // State Management
  const [filters, setFilters] = useState<any>({
    tariffCurrency: 'INR'
  });
  
  const [chartConfig, setChartConfig] = useState<any>(() => {
    const saved = localStorage.getItem('chartConfig');
    return saved ? JSON.parse(saved) : {
      chartType: 'stackedColumn',
      xAxis: 'country',
      yAxis: 'pvCapacityMW',
      groupBy: 'technology',
      aggregation: 'sum',
      sort: 'desc',
      limit: 'all'
    };
  });

  // Results State
  const [tenders, setTenders] = useState<any[]>([]);
  const [kpiSummary, setKpiSummary] = useState<any>({
    totalProjects: 0,
    totalCapacityMW: 0,
    totalCapacityGW: 0,
    avgTariffINR: 0,
    avgTariffUSD: 0,
    countriesCount: 0,
    developersCount: 0,
    completedCount: 0,
    planningCount: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);

  // Toast Notification Dispatcher
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Persist configurations
  useEffect(() => {
    localStorage.setItem('chartConfig', JSON.stringify(chartConfig));
  }, [chartConfig]);

  // Load Metadata & Initial Filters Options
  const loadDashboardSchema = async (showNotification = false) => {
    try {
      const metaRes = await getExcelMetadata();
      setMetadata(metaRes);
      
      // Auto-align default filter key values
      const initialFilters: any = {
        tariffCurrency: filters.tariffCurrency || 'INR',
        activeDateKey: metaRes.columns.find(c => c.type === 'date')?.key || ''
      };
      
      metaRes.columns.forEach(col => {
        if (col.type === 'text') {
          initialFilters[col.key] = [];
        } else if (col.type === 'number') {
          initialFilters[col.key] = { min: '', max: '' };
        } else if (col.type === 'date') {
          initialFilters[col.key] = { min: '', max: '' };
          initialFilters[`${col.key}Year`] = [];
        }
      });
      setFilters(initialFilters);

      // Fetch dynamic filters unique options values lists from backend
      const queryParams = await queryTenders(initialFilters, chartConfig);
      setTenders(queryParams.data);
      setKpiSummary(queryParams.summary);
      setChartData(queryParams.chartData);

      // Re-fetch clean list of unique values
      // In this setup, we extract unique values directly from the tenders list dynamically!
      // This is fast and matches the filtered scope or general scope.
      // Let's compute them dynamically or fetch filters.
      const uniqueOpts: Record<string, any[]> = { years: [] };
      metaRes.columns.forEach(col => {
        if (col.isFilterable) {
          const values = queryParams.data
            .map(row => row[col.key])
            .filter(v => v !== null && v !== undefined && v !== '');
          uniqueOpts[col.key] = Array.from(new Set(values)).sort();
        }
        if (col.type === 'date') {
          const years = queryParams.data
            .map(row => row[`${col.key}Year`])
            .filter(v => v !== null && v !== undefined && !isNaN(v));
          years.forEach(y => uniqueOpts.years.push(Number(y)));
        }
      });
      uniqueOpts.years = Array.from(new Set(uniqueOpts.years)).sort((a, b) => a - b);
      setFilterOptions(uniqueOpts);

      if (showNotification) {
        showToast('Dashboard details loaded successfully', 'success');
      }
    } catch (e) {
      console.error('Error initializing dashboard schema:', e);
      showToast('Failed to load database details', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardSchema();
  }, []);

  // Dispatch filter/chart queries with brief debounce
  useEffect(() => {
    if (isLoading || !metadata) return;

    const delayTimer = setTimeout(async () => {
      setIsQuerying(true);
      try {
        const queryRes = await queryTenders(filters, chartConfig);
        setTenders(queryRes.data);
        setKpiSummary(queryRes.summary);
        setChartData(queryRes.chartData);
        // NOTE: filter option lists are intentionally NOT recomputed here.
        // They are derived once from the full, unfiltered dataset in
        // loadDashboardSchema so that picking a value never removes the other
        // choices from its own dropdown.
      } catch (e) {
        console.error('Query dispatch error:', e);
      } finally {
        setIsQuerying(false);
      }
    }, 200);

    return () => clearTimeout(delayTimer);
  }, [filters, chartConfig, isLoading, metadata]);

  // Handle Excel Uploads
  const handleExcelUpload = async (file: File) => {
    setIsUploading(true);
    showToast('Uploading Excel spreadsheet...', 'info');
    try {
      const uploadRes = await uploadExcelFile(file);
      if (uploadRes.success) {
        showToast('Excel uploaded and parsed successfully!', 'success');
        // Force full refresh
        await loadDashboardSchema();
      } else {
        showToast('Failed to parse uploaded Excel workbook', 'error');
      }
    } catch (error: any) {
      console.error('Excel upload crash:', error);
      showToast(error.response?.data?.error || 'Invalid file format or Excel upload error', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = () => {
    if (!metadata) return;
    const cleared: any = {
      tariffCurrency: filters.tariffCurrency || 'INR',
      activeDateKey: filters.activeDateKey
    };
    metadata.columns.forEach(col => {
      if (col.type === 'text') {
        cleared[col.key] = [];
      } else if (col.type === 'number') {
        cleared[col.key] = { min: '', max: '' };
      } else if (col.type === 'date') {
        cleared[col.key] = { min: '', max: '' };
        cleared[`${col.key}Year`] = [];
      }
    });
    setFilters(cleared);
    showToast('Filters cleared', 'info');
  };

  if (isLoading || !metadata) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5">
        <div className="grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <p className="font-display text-base font-semibold text-slate-800">Preparing your workspace</p>
          <p className="text-2xs text-slate-400 font-medium mt-1 animate-pulse">
            Analyzing the Excel schema and building the dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout
      header={
        <Header
          onUpload={handleExcelUpload}
          isUploading={isUploading}
          uploadedFileName={metadata.fileName}
          onRefresh={() => loadDashboardSchema(true)}
          isRefreshing={isQuerying}
        />
      }
      sidebar={
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          filterOptions={filterOptions}
          metadata={metadata}
          onClearAll={handleClearAll}
        />
      }
    >
      {/* Central Content */}
      <div className="flex flex-col gap-5 sm:gap-6">

        {/* File status metrics */}
        <FileStatusCard
          fileName={metadata.fileName}
          lastUploadedTime={metadata.lastUploadedTime}
          totalRows={metadata.totalRows}
          totalColumns={metadata.totalColumns}
          activeSheet={metadata.activeSheet}
        />

        {/* Dynamic KPI summary grid */}
        <KpiGrid summary={kpiSummary} />

        {/* Dynamic Chart card */}
        <ChartCard
          chartData={chartData}
          config={chartConfig}
          onChangeConfig={setChartConfig}
          metadata={metadata}
          recordsCount={tenders.length}
        />
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-xl shadow-pop ring-1 text-sm font-medium pointer-events-auto animate-toast ${
              toast.type === 'success'
                ? 'bg-white ring-emerald-100 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-white ring-red-100 text-red-800'
                : 'bg-white ring-brand-100 text-brand-800'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4.5 h-4.5 text-brand-500 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};
