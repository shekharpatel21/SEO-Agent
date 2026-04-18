// Multi-platform SEO bot server.
// Auto-enables each adapter based on which env vars are set, so you can ship
// this same file and have only the platforms with credentials come online.
//
//   Slack      → SLACK_BOT_TOKEN + SLACK_APP_TOKEN        (WebSocket)
//   Discord    → DISCORD_BOT_TOKEN                         (WebSocket)
//   Telegram   → TELEGRAM_BOT_TOKEN                        (long-poll)
//   MS Teams   → TEAMS_APP_ID + TEAMS_APP_PASSWORD         (HTTP webhook)
//   WhatsApp   → TWILIO_AUTH_TOKEN (optional signing)      (HTTP webhook)
//   Email      → SMTP_HOST + SMTP_FROM (outbound)          (HTTP webhook in)
//   CLI        → BOT_CLI_ENABLED=1                         (interactive)
//   Webhook /
//   Web widget → always on (no creds required)

const BUILD_TAG = "bot-server v2 — slack/discord/telegram/teams/whatsapp/email/cli/webhook+widget";

require("dotenv").config();
const express = require("express");
let cors; try { cors = require("cors"); } catch {}

const activity = require("./core/activity");

console.log(`▶ ${BUILD_TAG} — started at ${new Date().toISOString()}`);

const app = express();
if (cors) app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// Long-lived adapters (their own transport).
require("./adapters/slack").start();
require("./adapters/discord").start();
require("./adapters/telegram").start();
require("./adapters/cli").start();

// HTTP-mounted adapters share the Express app.
require("./adapters/teams").mount(app);
require("./adapters/whatsapp").mount(app);
require("./adapters/email").mount(app);
require("./adapters/webhook").mount(app);

const PORT = parseInt(process.env.BOT_SERVER_PORT || "4000", 10);
const server = app.listen(PORT, () => {
  activity.setAdapterStatus("webhook", "ready");
  console.log(`✓ HTTP adapters listening on :${PORT}`);
  console.log(`  • Web widget:     http://localhost:${PORT}/widget/`);
  console.log(`  • Embed script:   http://localhost:${PORT}/widget.js`);
  console.log(`  • Admin:          http://localhost:${PORT}/admin`);
  console.log(`  • Health:         http://localhost:${PORT}/health`);
  console.log(`  • Generic API:    POST http://localhost:${PORT}/api/message`);
  console.log(`  • Teams:          POST http://localhost:${PORT}/api/messages`);
  console.log(`  • WhatsApp:       POST http://localhost:${PORT}/api/webhook/whatsapp`);
  console.log(`  • Email inbound:  POST http://localhost:${PORT}/api/webhook/email`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n↯ ${signal} received — shutting down…`);
  const timer = setTimeout(() => {
    console.error("  shutdown timeout — forcing exit");
    process.exit(1);
  }, 8000).unref();
  server.close((err) => {
    clearTimeout(timer);
    if (err) { console.error("  HTTP close error:", err.message); process.exit(1); }
    console.log("  HTTP server closed. bye.");
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
