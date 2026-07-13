export interface Tender {
  id: number;
  region: string;
  country: string;
  projectName: string;
  location: string;
  state: string;
  pvCapacityMW: number | null;
  installationType: string;
  technology: string;
  nonPriceCriteria: string;
  developmentStatus: string;
  bessCapacity: string;
  issuingAuthority: string;
  rfpDate: string | null;
  rfpYear: number | null;
  resultAnnouncementDate: string | null;
  resultAnnouncementYear: number | null;
  programName: string;
  developer: string;
  winningTariffINR: number | null;
  winningTariffUSD: number | null;
  ppaTenureYears: number | null;
  epc: string;
  bessSupplier: string;
  moduleSupplier: string;
  floaterSupplier: string;
  inverterSupplier: string;
  inverterType: string;
  trackerSupplier: string;
  trackerType: string;
  expectedCompletion: string | null;
  expectedCompletionYear: number | null;
  actualCompletion: string | null;
  actualCompletionYear: number | null;
  entryDate: string | null;
  entryYear: number | null;
  lastUpdated: string | null;
  remarks: string;
  link: string;
}

export interface News {
  id: number;
  date: string | null;
  country: string;
  news: string;
  acquirer: string;
  acquiree: string;
  stake: string | number;
  investmentUSD: string;
  marketImpact: string;
}

export interface KpiSummary {
  totalProjects: number;
  totalCapacityMW: number;
  totalCapacityGW: number;
  avgTariffINR: number;
  avgTariffUSD: number;
  countriesCount: number;
  developersCount: number;
  completedCount: number;
  planningCount: number;
}

export interface FilterOptions {
  regions: string[];
  countries: string[];
  technologies: string[];
  installationTypes: string[];
  developmentStatuses: string[];
  issuingAuthorities: string[];
  developers: string[];
  programNames: string[];
  years: number[];
}

export interface FilterState {
  tariffCurrency?: 'INR' | 'USD';
  activeDateKey?: string;
  [key: string]: any;
}

export interface ChartConfig {
  chartType: string;
  xAxis: string;
  yAxis: string;
  groupBy: string | null;
  aggregation: string;
  sort: string;
  limit: string;
}

