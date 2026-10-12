import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
if (!pool) throw new Error('DATABASE_URL is required');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(7042026)");
  await client.query('CREATE TABLE IF NOT EXISTS radar_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const applied = await client.query("SELECT version FROM radar_migrations WHERE version = '001'");
  if (!applied.rowCount) {
    await client.query(await readFile(new URL('./001_procurement.sql', import.meta.url), 'utf8'));
    await client.query("INSERT INTO radar_migrations(version) VALUES ('001')");
  }
  await client.query('COMMIT');
  console.log('Procurement schema is up to date');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
