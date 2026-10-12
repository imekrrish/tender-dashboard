import pg from 'pg';
export const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 }) : null;
pool?.on('error', () => console.error('PostgreSQL pool connection failed'));
export async function database(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'Database not configured. Set DATABASE_URL and run npm run migrate.' });
  next();
}
