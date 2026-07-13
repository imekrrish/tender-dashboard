// Single source of truth for concise, human-readable column labels.
// Excel headers are often verbose (e.g. "Technology Specification (PV, PV-Storage,
// FPV, Storage)"); everywhere in the UI we show these short forms instead.
export const COLUMN_LABELS: Record<string, string> = {
  region: 'Region',
  country: 'Country',
  projectName: 'Project / Tender',
  location: 'Location',
  state: 'State',
  pvCapacityMW: 'Capacity (MW)',
  installationType: 'Installation',
  technology: 'Technology',
  nonPriceCriteria: 'Non-Price Criteria',
  developmentStatus: 'Status',
  bessCapacity: 'BESS Capacity',
  issuingAuthority: 'Issuing Authority',
  rfpDate: 'RfP Date',
  resultAnnouncementDate: 'Result Date',
  programName: 'Program',
  developer: 'Developer',
  winningTariffINR: 'Tariff (₹/kWh)',
  winningTariffUSD: 'Tariff ($/kWh)',
  ppaTenureYears: 'PPA (yrs)',
  epc: 'EPC',
  bessSupplier: 'BESS Supplier',
  moduleSupplier: 'Module Supplier',
  floaterSupplier: 'Floater Supplier',
  inverterSupplier: 'Inverter Supplier',
  inverterType: 'Inverter Type',
  trackerSupplier: 'Tracker Supplier',
  trackerType: 'Tracker Type',
  expectedCompletion: 'Expected Completion',
  actualCompletion: 'Actual Completion',
  entryDate: 'Entry Date',
  lastUpdated: 'Last Updated',
  remarks: 'Remarks',
  link: 'Source',
};

export const prettyColumn = (col: { key: string; originalName: string }): string =>
  COLUMN_LABELS[col.key] || col.originalName;

export const prettyKey = (key: string, fallback?: string): string =>
  COLUMN_LABELS[key] || fallback || key;
