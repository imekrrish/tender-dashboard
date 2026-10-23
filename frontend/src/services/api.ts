import { createApiClient } from './httpClient';
import type {
  PriceIndexFilters,
  PriceIndexMeta,
  PriceIndexQueryResult,
} from '../types/priceIndex';

// Same-origin /api on Railway; Vite proxies /api locally.
// VITE_API_URL is an optional override for a separately hosted backend.
const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const origin = (rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl : '')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const API_BASE_URL = `${origin}/api`;

export const api = createApiClient(API_BASE_URL);

export interface ColumnMetadata {
  key: string;
  originalName: string;
  type: string;
  isFilterable: boolean;
  isMetric: boolean;
  isDate: boolean;
}

export interface ExcelMetadata {
  fileName: string;
  lastUploadedTime: string;
  sheets: string[];
  activeSheet: string;
  totalRows: number;
  totalColumns: number;
  columns: ColumnMetadata[];
}

export const getExcelMetadata = async (): Promise<ExcelMetadata> => {
  const response = await api.get<ExcelMetadata>('/excel/metadata');
  return response.data;
};

export const uploadExcelFile = async (file: File): Promise<{
  success: boolean;
  fileName: string;
  totalRows: number;
  totalColumns: number;
  columns: ColumnMetadata[];
  sheets: string[];
}> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/excel/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const queryTenders = async (
  filters: any,
  chart: any
): Promise<{
  data: any[];
  summary: any;
  chartData: any[];
}> => {
  const response = await api.post('/tenders/query', { filters, chart });
  return response.data;
};

export const getNews = async (): Promise<any[]> => {
  const response = await api.get<any[]>('/news');
  return response.data;
};

export const exportXlsx = async (payload: {
  filters: any;
  visibleColumns: string[];
  sort: { field: string; order: 'asc' | 'desc' | null };
  search: string;
}): Promise<void> => {
  const response = await api.post('/export/xlsx', payload, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `auction-tracker-filtered-${dateStr}.xlsx`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const exportCsv = async (payload: {
  filters: any;
  visibleColumns: string[];
  sort: { field: string; order: 'asc' | 'desc' | null };
  search: string;
}): Promise<void> => {
  const response = await api.post('/export/csv', payload, { responseType: 'blob' });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `auction-tracker-filtered-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// TaiyangNews PV Price Index
// ---------------------------------------------------------------------------

export const getPriceIndexMeta = async (): Promise<PriceIndexMeta> => {
  const response = await api.get<PriceIndexMeta>('/price-index/meta');
  return response.data;
};

export const queryPriceIndex = async (
  filters: Partial<PriceIndexFilters>
): Promise<PriceIndexQueryResult> => {
  const response = await api.post<PriceIndexQueryResult>('/price-index/query', filters);
  return response.data;
};

export const uploadPriceIndexFile = async (
  file: File
): Promise<{
  success: boolean;
  fileName: string;
  latestDate: string;
  totalWeeks: number;
  seriesCount: number;
}> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/price-index/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
