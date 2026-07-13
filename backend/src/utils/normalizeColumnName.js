/**
 * Normalizes an Excel column header into a standard camelCase key.
 * Uses fuzzy mapping for known columns and converts others to standard camelCase.
 */
export function normalizeColumnName(headerName) {
  const name = String(headerName || '').trim().toLowerCase();
  if (!name) return 'unknownColumn';

  // Exact or fuzzy matches for known fields
  if (name.includes('region')) return 'region';
  if (name.includes('country')) return 'country';
  if (name.includes('project/tender name') || name.includes('project name') || name.includes('tender name') || name.includes('project/tender')) return 'projectName';
  if (name.includes('location')) return 'location';
  if (name.includes('state')) return 'state';
  
  if (name.includes('pv capacity') || name.includes('capacity mw') || name.includes('capacity (mw)')) {
    return 'pvCapacityMW';
  }
  
  if (name.includes('installation type') || name.includes('installation')) return 'installationType';
  if (name.includes('technology specification') || name.includes('technology') || name.includes('tech spec') || name.includes('specifications')) return 'technology';
  if (name.includes('non-price criteria') || name.includes('non-price')) return 'nonPriceCriteria';
  if (name.includes('development status') || name.includes('status')) return 'developmentStatus';
  if (name.includes('bess capacity') || name.includes('bess')) return 'bessCapacity';
  if (name.includes('issuing authority') || name.includes('authority') || name.includes('issuer')) return 'issuingAuthority';
  
  if (name.includes('rfp date') || name.includes('rfp')) return 'rfpDate';
  
  if (name.includes('results announcment') || name.includes('results announcement') || name.includes('announcement date') || name.includes('results date')) {
    return 'resultAnnouncementDate';
  }
  
  if (name.includes('program name') || name.includes('program')) return 'programName';
  if (name.includes('tender winner') || name.includes('developer')) return 'developer';
  
  if (name.includes('winning tariff') || name.includes('tariff')) {
    if (name.includes('usd') || name.includes('$')) return 'winningTariffUSD';
    return 'winningTariffINR';
  }
  
  if (name.includes('ppa tenure') || name.includes('ppa')) return 'ppaTenureYears';
  if (name.includes('epc')) return 'epc';
  
  if (name.includes('bess supplier')) return 'bessSupplier';
  if (name.includes('module supplier')) return 'moduleSupplier';
  if (name.includes('floater supplier')) return 'floaterSupplier';
  if (name.includes('inverter supplier')) return 'inverterSupplier';
  if (name.includes('inverter type')) return 'inverterType';
  if (name.includes('tracker supplier')) return 'trackerSupplier';
  if (name.includes('tracker type')) return 'trackerType';
  
  if (name.includes('expected completion')) return 'expectedCompletion';
  if (name.includes('actual completion')) return 'actualCompletion';
  
  if (name.includes('entry date')) return 'entryDate';
  if (name.includes('last updated') || name.includes('updated date')) return 'lastUpdated';
  if (name.includes('remarks')) return 'remarks';
  if (name.includes('link') || name.includes('url') || name.includes('website')) return 'link';

  // Fallback: convert unknown column name to standard camelCase
  return name
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
