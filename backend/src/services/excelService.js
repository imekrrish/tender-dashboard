import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { excelDateToJSDate, extractYear } from '../utils/dateUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXCEL_PATH = path.join(__dirname, '../data/Auction Tracker Database_Version 1.xlsx');

let cachedTenders = null;
let cachedNews = null;

function normalizeNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim().toUpperCase();
  if (str === 'NA' || str === 'N/A' || str === '-' || str === '') return null;
  // Strip non-numeric characters except dots and minus
  const cleaned = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function normalizeString(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  return str.toUpperCase() === 'NA' || str.toUpperCase() === 'N/A' ? '' : str;
}

export function parseExcelData() {
  if (cachedTenders && cachedNews) {
    return { tenders: cachedTenders, news: cachedNews };
  }

  try {
    const workbook = xlsx.readFile(EXCEL_PATH, { defval: null });
    
    // Parse Sheet1 (Tenders)
    const sheet1Name = workbook.SheetNames[0];
    const sheet1 = workbook.Sheets[sheet1Name];
    const rawTenders = xlsx.utils.sheet_to_json(sheet1, { defval: null });
    
    cachedTenders = rawTenders.map((row, idx) => {
      // Excel field names are exactly as inspected
      const rfpDate = excelDateToJSDate(row['RfP date']);
      // Notice spelling: Results announcment date (no 'e')
      const resultAnnouncementDate = excelDateToJSDate(
        row['Results announcment date'] !== undefined 
          ? row['Results announcment date'] 
          : row['Results announcement date']
      );
      const expectedCompletion = excelDateToJSDate(row['Expected completion']);
      const actualCompletion = excelDateToJSDate(row['Actual completion']);
      const entryDate = excelDateToJSDate(row['Entry date']);
      const lastUpdated = excelDateToJSDate(row['Last updated']);

      return {
        id: idx + 1,
        region: normalizeString(row['Region']),
        country: normalizeString(row['Country']),
        projectName: normalizeString(row['Project/Tender name']),
        location: normalizeString(row['Location']),
        state: normalizeString(row['State']),
        pvCapacityMW: normalizeNumber(row['PV capacity (MW)']),
        installationType: normalizeString(row['Installation type']),
        technology: normalizeString(row['Technology Specification (PV, PV-Storage, FPV, Storage)']) || normalizeString(row['Technology Specification']),
        nonPriceCriteria: normalizeString(row['Non-Price Criteria']),
        developmentStatus: normalizeString(row['Development status']),
        bessCapacity: normalizeString(row['BESS capacity']),
        issuingAuthority: normalizeString(row['Issuing authority']),
        rfpDate,
        rfpYear: extractYear(rfpDate),
        resultAnnouncementDate,
        resultAnnouncementYear: extractYear(resultAnnouncementDate),
        programName: normalizeString(row['Program name']),
        developer: normalizeString(row['Tender winner/Developer']),
        winningTariffINR: normalizeNumber(row['Winning tariff (INR/kWh)']),
        winningTariffUSD: normalizeNumber(row['Winning tariff (USD/kWh)']),
        ppaTenureYears: normalizeNumber(row['PPA tenure (years)']),
        epc: normalizeString(row['EPC']),
        bessSupplier: normalizeString(row['BESS supplier']),
        moduleSupplier: normalizeString(row['Module supplier']),
        floaterSupplier: normalizeString(row['Floater supplier']),
        inverterSupplier: normalizeString(row['Inverter supplier']),
        inverterType: normalizeString(row['Inverter type']),
        trackerSupplier: normalizeString(row['Tracker supplier']),
        trackerType: normalizeString(row['Tracker type (single/dual)']),
        expectedCompletion,
        expectedCompletionYear: extractYear(expectedCompletion),
        actualCompletion,
        actualCompletionYear: extractYear(actualCompletion),
        entryDate,
        entryYear: extractYear(entryDate),
        lastUpdated,
        remarks: normalizeString(row['Remarks']),
        link: normalizeString(row['Link'])
      };
    });

    // Parse Sheet2 (News/Updates)
    if (workbook.SheetNames.length > 1) {
      const sheet2Name = workbook.SheetNames[1];
      const sheet2 = workbook.Sheets[sheet2Name];
      // Use range: 1 to skip the "Daily update" title row and use the second row as keys
      const rawNews = xlsx.utils.sheet_to_json(sheet2, { range: 1, defval: null });
      cachedNews = rawNews.map((row, idx) => {
        return {
          id: idx + 1,
          date: excelDateToJSDate(row['Date']),
          country: normalizeString(row['Country']),
          news: normalizeString(row['News']),
          acquirer: normalizeString(row['Acquirer (Buyer)']),
          acquiree: normalizeString(row['Acquiree (target company)']),
          stake: row['Stake'] !== undefined ? row['Stake'] : '',
          investmentUSD: normalizeString(row['Investment (USD)']),
          marketImpact: normalizeString(row['Market Impact'])
        };
      });
    } else {
      cachedNews = [];
    }

    return { tenders: cachedTenders, news: cachedNews };
  } catch (error) {
    console.error('Error parsing excel file:', error);
    throw error;
  }
}

export function clearCache() {
  cachedTenders = null;
  cachedNews = null;
}
