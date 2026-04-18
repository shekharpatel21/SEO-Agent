// Cross-adapter activity log. Every query flows through here so /admin and
// /health can answer "what's happening" without touching the chat API.
//
// In-memory ring (last N entries) + optional JSONL file append for audit.
// Set BOT_ACTIVITY_FILE to a path to persist (e.g. ./logs/activity.jsonl).

const fs = require("fs");
const path = require("path");

const RING_SIZE = parseInt(process.env.BOT_ACTIVITY_RING || "200", 10);
const FILE = process.env.BOT_ACTIVITY_FILE || "";

const ring = [];
const adapters = new Map();   // name -> { status, startedAt, lastEvent }
const counters = { total: 0, success: 0, failure: 0 };

if (FILE) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); }
  catch (err) { console.warn(`[activity] mkdir failed for ${FILE}:`, err.message); }
}

function appendFile(entry) {
  if (!FILE) return;
  fs.appendFile(FILE, JSON.stringify(entry) + "\n", (err) => {
    if (err) console.warn("[activity] file write failed:", err.message);
  });
}

function registerAdapter(name, status = "starting") {
  adapters.set(name, { status, startedAt: new Date().toISOString(), lastEvent: null });
}
function setAdapterStatus(name, status, detail) {
  const cur = adapters.get(name) || { startedAt: new Date().toISOString() };
  cur.status = status;
  if (detail !== undefined) cur.detail = detail;
  adapters.set(name, cur);
}
function adapterSnapshot() {
  return Object.fromEntries(adapters);
}

function record(event) {
  const entry = {
    ts: new Date().toISOString(),
    ...event,
  };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();

  if (event.kind === "query") {
    counters.total++;
    if (event.success) counters.success++;
    else counters.failure++;
  }
  if (event.adapter && adapters.has(event.adapter)) {
    adapters.get(event.adapter).lastEvent = entry.ts;
  }
  appendFile(entry);
  return entry;
}

function recent(limit = 50) {
  return ring.slice(-limit).reverse();
}
function summary() {
  return { ...counters, ring: ring.length };
}

module.exports = {
  registerAdapter,
  setAdapterStatus,
  adapterSnapshot,
  record,
  recent,
  summary,
};
