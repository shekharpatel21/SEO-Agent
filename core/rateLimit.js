// Tiny in-memory sliding-window rate limiter.
// For a single-process bot server this is plenty; front it with a reverse
// proxy or CDN rate limiter if you deploy multiple instances.
//
// Defaults: 30 requests / 60 s, keyed by X-API-Key → IP → "anon".
// Override with BOT_RATE_LIMIT_MAX and BOT_RATE_LIMIT_WINDOW_SEC.

const MAX = parseInt(process.env.BOT_RATE_LIMIT_MAX || "30", 10);
const WINDOW_MS = parseInt(process.env.BOT_RATE_LIMIT_WINDOW_SEC || "60", 10) * 1000;

const buckets = new Map();

function keyFor(req) {
  const apiKey = req.get("x-api-key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (apiKey) return `k:${apiKey.slice(0, 12)}`;
  const ip = (req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "anon")
    .toString().split(",")[0].trim();
  return `ip:${ip}`;
}

function prune(bucket, now) {
  while (bucket.length && now - bucket[0] > WINDOW_MS) bucket.shift();
}

function rateLimit(req, res, next) {
  const key = keyFor(req);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) { bucket = []; buckets.set(key, bucket); }
  prune(bucket, now);
  if (bucket.length >= MAX) {
    const retryMs = WINDOW_MS - (now - bucket[0]);
    res.set("Retry-After", Math.ceil(retryMs / 1000));
    return res.status(429).json({
      success: false,
      error: `Rate limit exceeded — max ${MAX} requests per ${WINDOW_MS / 1000}s. Retry in ${Math.ceil(retryMs / 1000)}s.`,
    });
  }
  bucket.push(now);
  next();
}

// Periodic cleanup so the Map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    prune(v, now);
    if (!v.length) buckets.delete(k);
  }
}, WINDOW_MS).unref();

module.exports = { rateLimit };
