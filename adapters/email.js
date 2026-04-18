// Email adapter — accept inbound email via a webhook (SendGrid Inbound Parse,
// Mailgun Routes, Cloudflare Email Workers, etc.) and reply via SMTP.
//
// Routes:
//   POST /api/webhook/email  — body: { from, subject, text | body, [messageId] }
//                              Accepts JSON or form-encoded.
//
// Configure SMTP via standard env vars:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
//   SMTP_FROM (From: header, e.g. "SEO Bot <bot@example.com>")
//   SMTP_SECURE=1 if using port 465 implicit TLS
//
// The bot replies with the report in the body and the PDF as an attachment.

const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_FROM = process.env.SMTP_FROM || "";

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_FROM) return null;
  let nodemailer;
  try { nodemailer = require("nodemailer"); }
  catch {
    console.warn("[email] `nodemailer` not installed — run `npm install nodemailer`.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "1",
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return transporter;
}

function extractQuery(body) {
  // Strip common email quoting patterns so a "reply" doesn't re-ask the whole thread.
  const text = (body || "").split(/^On .+ wrote:/m)[0]
    .split(/^-+Original Message-+/mi)[0]
    .replace(/^>.*$/gm, "")
    .trim();
  return text;
}

function mount(app) {
  const express = require("express");
  const t = getTransporter();
  activity.registerAdapter("email", t ? "ready" : "ready (outbound disabled — SMTP_* not set)");

  app.post(
    "/api/webhook/email",
    express.json({ limit: "1mb" }),
    express.urlencoded({ extended: true, limit: "1mb" }),
    async (req, res) => {
      const from = req.body.from || req.body.From || req.body.sender || "unknown";
      const subject = req.body.subject || req.body.Subject || "(no subject)";
      const text = req.body.text || req.body.body || req.body["body-plain"] || "";
      const messageId = req.body.messageId || req.body["Message-Id"] || "";
      const query = extractQuery(text).slice(0, 2000);

      if (!query) {
        return res.status(400).json({ success: false, error: "Empty email body." });
      }

      console.log(`[email] from=${from} subject="${subject}"`);
      let result, errMsg;
      try {
        result = await handleQuery(query, { adapter: "email", user: from });
      } catch (err) {
        errMsg = err.userFacing || humanizeError(err.message);
      }

      const trans = getTransporter();
      if (trans) {
        const mail = {
          from: SMTP_FROM,
          to: from,
          subject: `Re: ${subject}`,
          inReplyTo: messageId || undefined,
          references: messageId || undefined,
          text: result
            ? `Your SEO report:\n\n${result.report}\n\n— SEO Keyword Agent`
            : `We hit an error:\n\n${errMsg}\n\nPlease retry.`,
          attachments: result?.pdfBuffer
            ? [{ filename: result.filename, content: result.pdfBuffer, contentType: "application/pdf" }]
            : [],
        };
        try {
          const info = await trans.sendMail(mail);
          console.log(`[email] replied to ${from} · id=${info.messageId}`);
        } catch (err) {
          console.error("[email] sendMail failed:", err.message);
        }
      } else {
        console.warn("[email] no SMTP transporter — skipping outbound reply.");
      }

      res.json({ success: !!result, replied: Boolean(trans), error: errMsg });
    }
  );

  console.log("✓ [email] mounted POST /api/webhook/email");
}

module.exports = { mount };
