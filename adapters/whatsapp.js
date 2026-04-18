// WhatsApp adapter — Twilio sandbox or paid WhatsApp Business API.
// Set TWILIO_AUTH_TOKEN to enable (signature verification is then enforced).
// Configure this URL as the Twilio WhatsApp inbound webhook:
//   POST /api/webhook/whatsapp
//
// The bot replies via TwiML (no outbound HTTP), so media attachments are
// offered as a follow-up download link rather than a PDF file (Twilio
// requires media to be hosted at a public URL, not inlined).

const crypto = require("crypto");
const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const PUBLIC_URL = (process.env.BOT_PUBLIC_URL || "").replace(/\/$/, "");

function verifyTwilioSignature(req) {
  if (!AUTH_TOKEN) return true;
  const signature = req.get("x-twilio-signature");
  if (!signature) return false;
  const url = (PUBLIC_URL || `https://${req.get("host")}`) + req.originalUrl;
  const params = req.body || {};
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

// Simple token cache so a user can request the last PDF by URL.
const pdfCache = new Map(); // token -> { buffer, filename, expires }
function stashPdf(buffer, filename) {
  const token = crypto.randomBytes(12).toString("hex");
  pdfCache.set(token, { buffer, filename, expires: Date.now() + 30 * 60_000 });
  return token;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pdfCache) if (v.expires < now) pdfCache.delete(k);
}, 5 * 60_000).unref();

function mount(app) {
  const express = require("express");
  activity.registerAdapter("whatsapp", AUTH_TOKEN ? "ready" : "ready (unsigned)");

  app.post(
    "/api/webhook/whatsapp",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      if (!verifyTwilioSignature(req)) {
        return res.status(403).type("text/plain").send("Invalid Twilio signature.");
      }
      const from = req.body.From || "whatsapp:unknown";
      const query = (req.body.Body || "").trim();
      console.log(`[whatsapp] from=${from} body="${query}"`);

      let reply;
      try {
        const result = await handleQuery(query, { adapter: "whatsapp", user: from });
        reply = `*SEO Report:* ${query}\n\n${result.report.slice(0, 1400)}`;
        if (result.pdfBuffer && PUBLIC_URL) {
          const token = stashPdf(result.pdfBuffer, result.filename);
          reply += `\n\n📄 PDF: ${PUBLIC_URL}/api/webhook/whatsapp/pdf/${token}`;
        }
      } catch (err) {
        reply = `⚠️ ${err.userFacing || humanizeError(err.message)}`;
      }

      res.type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`
      );
    }
  );

  app.get("/api/webhook/whatsapp/pdf/:token", (req, res) => {
    const entry = pdfCache.get(req.params.token);
    if (!entry || entry.expires < Date.now()) {
      return res.status(404).type("text/plain").send("Expired or unknown PDF token.");
    }
    res.type("application/pdf");
    res.set("Content-Disposition", `inline; filename="${entry.filename}"`);
    res.send(entry.buffer);
  });

  console.log("✓ [whatsapp] mounted POST /api/webhook/whatsapp");
}

module.exports = { mount };
