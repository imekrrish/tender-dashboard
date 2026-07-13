/**
 * Heuristically detects the data type of a column based on its values.
 * Returns: 'number' | 'date' | 'url' | 'text'
 */
export function detectColumnType(values, headerName = '') {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNullValues.length === 0) return 'text';

  const name = String(headerName).toLowerCase();
  
  // Keywords indicating date columns
  const dateKeywords = ['date', 'completion', 'updated', 'entry', 'announcment', 'announcement', 'time', 'created'];
  const isDateHeader = dateKeywords.some(keyword => name.includes(keyword));

  let numberCount = 0;
  let dateCount = 0;
  let urlCount = 0;

  nonNullValues.forEach(val => {
    // 1. Check URL
    const strVal = String(val).trim();
    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://') || val.includes('www.'))) {
      urlCount++;
      return;
    }

    // 2. Check Number
    const cleanNumStr = strVal.replace(/,/g, '');
    const isNum = !isNaN(cleanNumStr) && cleanNumStr !== '';

    if (isNum) {
      const numVal = Number(cleanNumStr);
      // Excel serial date values typically lie between 30000 and 60000
      if (isDateHeader && numVal >= 30000 && numVal <= 60000) {
        dateCount++;
      } else {
        numberCount++;
      }
      return;
    }

    // 3. Check Date String / Date Object
    const isDateObject = val instanceof Date;
    const isDateString = typeof val === 'string' && isNaN(Number(val)) && !isNaN(Date.parse(strVal));
    const dateRegex = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;
    
    if (isDateObject || isDateString || dateRegex.test(strVal)) {
      dateCount++;
    }
  });

  const total = nonNullValues.length;
  
  // Decide type based on majority threshold
  if (dateCount / total > 0.7 || (isDateHeader && (dateCount + numberCount) / total > 0.7)) {
    return 'date';
  }
  if (numberCount / total > 0.7) {
    return 'number';
  }
  if (urlCount / total > 0.7) {
    return 'url';
  }
  
  return 'text';
}
