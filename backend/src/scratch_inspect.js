import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_PATH = path.join(__dirname, 'data/Auction Tracker Database_Version 1.xlsx');

try {
  const workbook = xlsx.readFile(EXCEL_PATH);
  console.log("Sheet names:", workbook.SheetNames);
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (sheetName === 'Sheet2') {
      const fullRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`\nSheet: ${sheetName} Raw Row 0:`, fullRows[0]);
      console.log(`Sheet: ${sheetName} Raw Row 1:`, fullRows[1]);
      console.log(`Sheet: ${sheetName} Raw Row 2:`, fullRows[2]);
      
      const parsedWithRange = xlsx.utils.sheet_to_json(sheet, { range: 1 });
      console.log(`Sheet: ${sheetName} Parsed with range: 1 - First record:`, parsedWithRange[0]);
    } else {
      const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`\nSheet: ${sheetName}`);
      console.log("Headers:", json[0]);
      console.log("First row data:", json[1]);
    }
  });
} catch (e) {
  console.error("Error reading file:", e);
}
