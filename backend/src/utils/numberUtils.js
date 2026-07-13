/**
 * Normalizes number fields, stripping non-numeric text and comma formatting.
 * Treats NA/null states safely.
 */
export function normalizeNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  
  const str = String(val).trim().toUpperCase();
  if (str === 'NA' || str === 'N/A' || str === '-' || str === '') return null;
  
  // Strip non-numeric characters except decimal dot and minus sign
  const cleaned = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  
  return isNaN(num) ? null : num;
}
