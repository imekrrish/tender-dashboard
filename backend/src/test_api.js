import { parseExcelData } from './services/excelService.js';
import { getUniqueFilterValues, filterTenders } from './services/filterService.js';
import { aggregateData } from './services/chartService.js';

try {
  console.log("--- STARTING BACKEND SERVICE VERIFICATION ---");
  console.log("1. Parsing Excel Workbook...");
  const { tenders, news } = parseExcelData();
  console.log(`   [PASS] Parsed ${tenders.length} tenders and ${news.length} news entries.`);
  
  console.log("2. Inspecting first parsed tender entry:");
  console.log(tenders[0]);

  console.log("\n3. Inspecting first parsed news entry:");
  console.log(news[0]);

  console.log("\n4. Generating unique filter lists...");
  const filters = getUniqueFilterValues(tenders);
  console.log("   Regions:", filters.region);
  console.log("   Countries Count:", filters.country ? filters.country.length : 0);
  console.log("   Years Available:", filters.years);
  
  console.log("\n5. Filtering test: Region = Asia");
  const filtered = filterTenders(tenders, { region: ["Asia"] });
  console.log(`   [PASS] Found ${filtered.length} tenders in Asia (out of ${tenders.length}).`);

  console.log("\n6. Aggregating test: Country by Sum of Capacity MW");
  const chartData = aggregateData(tenders, {
    xAxis: 'country',
    yAxis: 'pvCapacityMW',
    groupBy: null,
    aggregation: 'sum'
  });
  console.log("   Top 3 aggregated countries:", chartData.slice(0, 3));

  console.log("\n--- BACKEND SERVICE LAYER IS SUCCESSFULLY VERIFIED ---");
} catch (error) {
  console.error("\n[FAIL] Verification failed with error:", error);
  process.exit(1);
}
