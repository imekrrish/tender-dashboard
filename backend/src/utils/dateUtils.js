/**
 * Converts Excel serial dates, JS dates, or string dates to YYYY-MM-DD format.
 * Returns null if invalid or missing.
 */
export function excelDateToJSDate(val) {
  if (val === null || val === undefined || val === '') return null;
  
  // If it's a number, convert Excel serial to JS date string
  if (typeof val === 'number' && !isNaN(val)) {
    // Excel leap year bug adjustment (Excel thinks 1900 was a leap year)
    // 25569 is the number of days between Jan 1 1900 and Jan 1 1970
    const utc_days = Math.floor(val - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    if (isNaN(date_info.getTime())) return null;
    return date_info.toISOString().split("T")[0];
  }
  
  // If it's a date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split("T")[0];
  }
  
  // If it's a string, try parsing it
  if (typeof val === 'string') {
    const cleaned = val.trim();
    if (cleaned === '' || cleaned.toUpperCase() === 'NA' || cleaned.toUpperCase() === 'N/A') return null;
    
    // Try native parse
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    
    // Check if format is DD-MM-YYYY or DD/MM/YYYY
    const parts = cleaned.split(/[-/]/);
    if (parts.length === 3) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const third = parseInt(parts[2], 10);
      
      if (!isNaN(first) && !isNaN(second) && !isNaN(third)) {
        // If third is 4 digits, assume format is DD-MM-YYYY or DD/MM/YYYY
        if (third > 1000) {
          const d = new Date(third, second - 1, first);
          if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        }
        // If first is 4 digits, assume format is YYYY-MM-DD
        if (first > 1000) {
          const d = new Date(first, second - 1, third);
          if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        }
      }
    }
  }
  
  return null;
}

/**
 * Extracts the year as a number from a YYYY-MM-DD string.
 */
export function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}
