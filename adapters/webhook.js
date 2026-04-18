// Generic webhook, embeddable widget, health probe, and admin dashboard.
//
// Routes:
//   POST /api/message             — generic "any platform" entry. Auth + rate-limit.
//   POST /api/webhook/whatsapp    — Twilio WhatsApp webhook (TwiML reply).
//   POST /api/webhook/email       — inbound-email webhook (SendGrid/Mailgun shape).
//   GET  /health                  — liveness + per-adapter status + counters.
//   GET  /api/activity?limit=N    — recent query events (read-only audit).
//   GET  /admin                   — zero-dep HTML dashboard of the above.
//   GET  /widget/                 — embeddable chat UI.
//   GET  /widget.js               — <script> embed that injects a floating button.

const path = require("path");
const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");
const { requireApiKey, enabled: authEnabled } = require("../core/auth");
const { rateLimit } = require("../core/rateLimit");

function mount(app) {
  const express = require("express");
  activity.registerAdapter("webhook", "ready");

  app.use("/api/message", express.json({ limit: "1mb" }));
  app.use("/api/message", rateLimit, requireApiKey);

  app.post("/api/message", async (req, res) => {
    const query = (req.body?.query || req.body?.message || "").toString().trim();
    if (!query) {
      return res.status(400).json({ success: false, error: "Missing `query` field." });
    }
    try {
      const result = await handleQuery(query, {
        adapter: "webhook",
        user: req.get("x-user-id") || "anon",
      });
      res.json({
        success: true,
        query,
        report: result.report,
        meta: result.meta,
        filename: result.filename,
        pdf_base64: result.pdfBuffer ? result.pdfBuffer.toString("base64") : null,
      });
    } catch (err) {
      console.error("[webhook] handleQuery failed:", err.stack || err.message);
      res.status(500).json({
        success: false,
        error: err.userFacing || humanizeError(err.message),
      });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      version: require("../package.json").version,
      auth: authEnabled ? "enabled" : "open",
      adapters: activity.adapterSnapshot(),
      counters: activity.summary(),
    });
  });

  app.get("/api/activity", rateLimit, requireApiKey, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    res.json({ entries: activity.recent(limit), counters: activity.summary() });
  });

  app.get("/admin", (_req, res) => {
    res.type("html").send(renderAdminHtml());
  });

  app.use("/widget", express.static(path.join(__dirname, "..", "public", "widget")));
  app.get("/widget.js", (_req, res) => {
    res.type("application/javascript").sendFile(
      path.join(__dirname, "..", "public", "widget", "embed.js")
    );
  });

  // Third-party inbound webhooks (WhatsApp/email) live in dedicated files
  // and mount themselves; they're optional and loaded from bot-server.js.

  console.log("✓ [webhook] mounted /api/message, /health, /api/activity, /admin, /widget");
}

function renderAdminHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>SEO Bot — Admin</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;padding:24px}
  h1{margin:0 0 4px;font-size:20px}
  h2{margin:24px 0 8px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px}
  .card .label{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  .card .value{font-size:22px;font-weight:600;margin-top:4px}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:10px;overflow:hidden;font-size:13px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #334155}
  th{background:#0b1220;color:#94a3b8;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  tr:last-child td{border-bottom:0}
  .ok{color:#22c55e}.bad{color:#ef4444}.muted{color:#94a3b8}
  pre{background:#0b1220;padding:12px;border-radius:8px;overflow:auto;font-size:12px}
  button{background:#4f46e5;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px}
</style></head>
<body>
<h1>SEO Keyword Agent</h1>
<div class="muted" id="status">loading…</div>

<h2>Counters</h2>
<div class="grid" id="counters"></div>

<h2>Adapters</h2>
<table id="adapters"><thead><tr><th>Name</th><th>Status</th><th>Started</th><th>Last event</th></tr></thead><tbody></tbody></table>

<h2>Recent activity <button onclick="load()">Refresh</button></h2>
<table id="activity"><thead><tr><th>Time</th><th>Adapter</th><th>User</th><th>Query</th><th>Result</th><th>Duration</th></tr></thead><tbody></tbody></table>

<script>
async function load() {
  const h = await fetch('/health').then(r=>r.json()).catch(()=>({}));
  document.getElementById('status').textContent =
    'v'+h.version+' · auth: '+h.auth+' · '+(h.ts||'');

  const c = h.counters || {};
  document.getElementById('counters').innerHTML =
    [['total',c.total],['success',c.success],['failure',c.failure],['ring',c.ring]]
      .map(([k,v])=>'<div class="card"><div class="label">'+k+'</div><div class="value">'+(v||0)+'</div></div>').join('');

  const rows = Object.entries(h.adapters||{}).map(([name,a])=>
    '<tr><td>'+name+'</td><td class="'+((a.status==='ready'||a.status==='connected')?'ok':'muted')+'">'+a.status+'</td><td class="muted">'+(a.startedAt||'')+'</td><td class="muted">'+(a.lastEvent||'—')+'</td></tr>'
  ).join('');
  document.querySelector('#adapters tbody').innerHTML = rows || '<tr><td colspan="4" class="muted">No adapters registered</td></tr>';

  try {
    const a = await fetch('/api/activity?limit=50').then(r=>r.ok?r.json():{entries:[]});
    const trs = (a.entries||[]).map(e=>
      '<tr><td class="muted">'+new Date(e.ts).toLocaleTimeString()+'</td>'+
      '<td>'+(e.adapter||'—')+'</td>'+
      '<td class="muted">'+(e.user||'—')+'</td>'+
      '<td>'+(e.query||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+'</td>'+
      '<td class="'+(e.success?'ok':'bad')+'">'+(e.success?'ok'+(e.pdf?' · pdf':''):(e.error||'fail'))+'</td>'+
      '<td class="muted">'+(e.durationMs?e.durationMs+'ms':'—')+'</td></tr>'
    ).join('');
    document.querySelector('#activity tbody').innerHTML = trs || '<tr><td colspan="6" class="muted">No activity yet · send a query to populate</td></tr>';
  } catch(e) {
    document.querySelector('#activity tbody').innerHTML = '<tr><td colspan="6" class="bad">Activity API protected — set X-API-Key to view.</td></tr>';
  }
}
load();
setInterval(load, 5000);
</script>
</body></html>`;
}

module.exports = { mount };
