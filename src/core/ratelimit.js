import { tooManyRequests } from './errors.js';

/**
 * Limitador de peticiones por IP, en memoria.
 * En Vercel cada instancia tiene su propio contador (es una mitigacion, no una garantia);
 * en Render cubre todo el proceso.
 */
export function rateLimit({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits) {
      if (value.reset <= now) hits.delete(key);
    }
  }, windowMs).unref?.();

  return function rateLimitMiddleware(req, res, next) {
    const key = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0];
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil((entry.reset - now) / 1000)));
    if (entry.count > max) return next(tooManyRequests(Math.ceil((entry.reset - now) / 1000)));
    return next();
  };
}
