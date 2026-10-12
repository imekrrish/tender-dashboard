import { timingSafeEqual } from 'node:crypto';

export function createAdminAuth({ now = Date.now } = {}) {
  const failures = new Map();
  const windowMs = 5 * 60 * 1000;
  return function admin(req, res, next) {
    const key = process.env.ADMIN_API_KEY;
    if (!key) return res.status(503).json({ error: 'Admin access is not configured' });
    const address = req.ip || req.socket?.remoteAddress || 'unknown';
    const time = now();
    let attempt = failures.get(address);
    if (attempt && attempt.until <= time) { failures.delete(address); attempt = null; }
    if (attempt?.count >= 5) {
      res.setHeader('Retry-After', String(Math.ceil((attempt.until - time) / 1000)));
      return res.status(429).json({ error: 'Too many incorrect PIN attempts. Try again in a few minutes.' });
    }
    const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const a = Buffer.from(key), b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      if (failures.size >= 10000) for (const [ip, entry] of failures) if (entry.until <= time) failures.delete(ip);
      if (failures.size >= 10000 && !failures.has(address)) return res.status(429).json({ error: 'Try again in a few minutes.' });
      failures.set(address, { count: (attempt?.count || 0) + 1, until: attempt?.until || time + windowMs });
      return res.status(401).json({ error: 'Incorrect admin PIN' });
    }
    failures.delete(address);
    next();
  };
}
