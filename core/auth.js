// Optional API-key gate for the public HTTP endpoints.
// Enforced only when BOT_API_KEYS is set; otherwise endpoints are open
// (useful during local dev / first-run / self-hosted intranet).
//
// Usage:
//   BOT_API_KEYS=key1,key2,key3
// Clients send one of those keys in:
//   - Authorization: Bearer <key>
//   - X-API-Key: <key>
//   - ?api_key=<key>  (query string, convenient for browser widget configs)

const crypto = require("crypto");

const KEYS = (process.env.BOT_API_KEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function extractKey(req) {
  const auth = req.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) return bearer[1].trim();
  const header = req.get("x-api-key");
  if (header) return header.trim();
  if (req.query && typeof req.query.api_key === "string") return req.query.api_key;
  return null;
}

function requireApiKey(req, res, next) {
  if (!KEYS.length) return next();
  const key = extractKey(req);
  if (!key) {
    return res.status(401).json({ success: false, error: "Missing API key." });
  }
  const ok = KEYS.some((k) => timingSafeEqual(k, key));
  if (!ok) {
    return res.status(403).json({ success: false, error: "Invalid API key." });
  }
  next();
}

const enabled = KEYS.length > 0;

module.exports = { requireApiKey, enabled };
