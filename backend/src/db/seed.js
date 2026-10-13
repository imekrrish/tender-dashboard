import { pool } from './pool.js';
import { decodeSeed, seedDatabase } from './seed-service.js';

const value = process.env.TENDER_SEED_BASE64;
if (!value?.trim()) {
  console.log('Tender seed skipped: TENDER_SEED_BASE64 is not configured.');
  await pool?.end();
} else {
  let client;
  try {
    // Validate before opening a connection; never print the encoded data.
    decodeSeed(value);
    if (!pool) throw new Error('DATABASE_URL is required');
    client = await pool.connect();
    const report = await seedDatabase(client, value);
    console.log(report.already_imported
      ? 'Tender seed already applied; records were not changed.'
      : `Tender seed applied: ${report.counts.tenders} tenders, ${report.counts.tender_documents} documents.`);
  } catch (error) {
    console.error('Tender seed failed; deployment stopped. Error:', error.code || error.name);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool?.end();
  }
}
