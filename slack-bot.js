// Slack Socket Mode listener - responds to @mentions of the bot in any channel.
// Run alongside the Next.js server: `node slack-bot.js`
// Build tag is printed on startup so you can verify the latest code is running.
const BUILD_TAG = "slack-bot v3 — humanized errors + auto-retry + PDF upload";

require("dotenv").config();
const { SocketModeClient } = require("@slack/socket-mode");
const { WebClient } = require("@slack/web-api");

console.log(`▶ ${BUILD_TAG} — started at ${new Date().toISOString()}`);

const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHAT_API = process.env.CHAT_API_URL || "http://localhost:3000/api/chat";
const PDF_API =
  process.env.PDF_API_URL ||
  CHAT_API.replace(/\/api\/chat\/?$/, "/api/export-pdf");

if (!APP_TOKEN || !APP_TOKEN.startsWith("xapp-")) {
  console.error("ERROR: SLACK_APP_TOKEN must be set and start with 'xapp-'");
  process.exit(1);
}
if (!BOT_TOKEN || !BOT_TOKEN.startsWith("xoxb-")) {
  console.error("ERROR: SLACK_BOT_TOKEN must be set and start with 'xoxb-'");
  process.exit(1);
}

const slackClient = new SocketModeClient({ appToken: APP_TOKEN });
const webClient = new WebClient(BOT_TOKEN);

function stripBotMention(text) {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// Convert any error message — raw HTML, JSON.parse output, internal server
// error text, stack traces — into a short, readable Slack-friendly sentence.
// The full technical detail is still console.error'd for the operator.
function humanizeError(errorMessage) {
  const msg = String(errorMessage || "").trim();
  if (!msg) {
    return "The backend returned an empty response. Please retry in a moment.";
  }
  if (/unexpected token|is not valid json|json.parse/i.test(msg)) {
    return "The backend returned an unexpected non-JSON response — it may be restarting or temporarily overloaded. Please retry in a moment.";
  }
  if (/internal server error/i.test(msg)) {
    return "The backend hit an internal error. Please retry; if it keeps happening, check the server logs.";
  }
  if (/access denied|subscription|40204|40101|40104/i.test(msg)) {
    return "One of the data-provider subscriptions is not active. Activate it in your DataForSEO account and retry.";
  }
  if (/failed to reach|econnrefused|network|fetch failed/i.test(msg)) {
    return "Could not reach the backend. Check that the Next.js server is running and `CHAT_API_URL` points to it.";
  }
  if (/timeout|timed out/i.test(msg)) {
    return "The backend took too long to respond. Please retry.";
  }
  if (/rate limit|429|too many requests/i.test(msg)) {
    return "The data provider rate-limited this request. Wait a minute and retry.";
  }
  // Unknown shape — truncate heavily so we never dump a stack trace into Slack.
  const short = msg.replace(/\s+/g, " ").slice(0, 160);
  return `The backend returned an error: ${short}${msg.length > 160 ? "…" : ""}`;
}

// Strip HTML tags and collapse whitespace so a Next.js error page becomes a
// short, readable sentence instead of a wall of markup in the Slack message.
function cleanHtmlSnippet(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// POST the chat request with a single automatic retry. Next.js dev mode
// occasionally returns an HTML overlay during hot-reload; a one-shot retry
// after a short pause clears those. Real failures still surface, just with
// a clean user-friendly message instead of the raw JSON.parse error.
async function postChatWithRetry(body, signal) {
  const attempts = 2;
  let lastProblem = null;
  for (let i = 0; i < attempts; i++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await res.text();
    const looksLikeHtml = raw.trimStart().startsWith("<");
    if (!looksLikeHtml) {
      try {
        return { data: JSON.parse(raw), status: res.status };
      } catch {
        lastProblem = {
          status: res.status,
          snippet: raw.replace(/\s+/g, " ").slice(0, 240),
        };
      }
    } else {
      lastProblem = { status: res.status, snippet: cleanHtmlSnippet(raw) };
    }

    // Only retry when it looks like a transient dev-server state.
    if (i < attempts - 1) {
      console.warn(
        `[chat] retry ${i + 1} — status=${lastProblem.status} snippet="${lastProblem.snippet.slice(0, 120)}"`
      );
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const err = new Error(
    `The backend returned a non-JSON response (HTTP ${lastProblem.status}). Details: ${lastProblem.snippet}`
  );
  err.userFacing = `:warning: The backend is temporarily unavailable (HTTP ${lastProblem.status}). Please retry in a moment. If this persists, check the \`npm run dev\` terminal for compile errors.`;
  throw err;
}

// Tracks in-flight requests keyed by Slack user id so that user can cancel
// their own pending request by @mentioning the bot again with just "stop".
const inflight = new Map();

function isStopCommand(query) {
  return /^\s*stop\s*[.!]?\s*$/i.test(query);
}

async function handleMention(event) {
  const { channel, ts, thread_ts, text, user } = event;
  const query = stripBotMention(text || "");

  if (!query) {
    await webClient.chat.postMessage({
      channel,
      thread_ts: thread_ts || ts,
      text: "Hi! Ask me something like: _give me 10 keywords for AI agent automation_",
    });
    return;
  }

  if (isStopCommand(query)) {
    const pending = inflight.get(user);
    if (!pending) {
      await webClient.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts,
        text: ":information_source: Nothing to stop — no request is currently running for you.",
      });
      return;
    }

    pending.controller.abort();
    inflight.delete(user);

    if (pending.status) {
      await webClient.chat
        .update({
          channel: pending.status.channel,
          ts: pending.status.ts,
          text: `:octagonal_sign: Stopped: _${pending.query.slice(0, 120)}_`,
        })
        .catch(() => {});
      await webClient.reactions
        .remove({
          channel: pending.status.channel,
          timestamp: pending.status.ts,
          name: "mag",
        })
        .catch(() => {});
    }

    await webClient.chat.postMessage({
      channel,
      thread_ts: thread_ts || ts,
      text: `:octagonal_sign: Stopped your request: _${pending.query.slice(0, 120)}_`,
    });
    console.log(`[mention] user=${user} stopped prior request`);
    return;
  }

  console.log(`[mention] user=${user} channel=${channel} query="${query}"`);

  // Register the controller BEFORE any await so a "stop" mention that arrives
  // while we're still posting the status message can still find it and abort.
  const existing = inflight.get(user);
  if (existing) {
    existing.controller.abort();
    inflight.delete(user);
  }
  const controller = new AbortController();
  inflight.set(user, { controller, query, status: null });

  // Step 1: Post status message in the thread with :mag: reaction
  const status = await webClient.chat.postMessage({
    channel,
    thread_ts: thread_ts || ts,
    text: `:hourglass_flowing_sand: Working on: ${query}`,
  });

  // Attach the status ref so a later stop can update the right message.
  if (inflight.get(user)?.controller === controller) {
    inflight.set(user, {
      controller,
      query,
      status: { channel, ts: status.ts },
    });
  }

  // If stop arrived while we were posting the status message, bail now.
  if (controller.signal.aborted) {
    await webClient.chat
      .update({
        channel,
        ts: status.ts,
        text: `:octagonal_sign: Stopped: _${query.slice(0, 120)}_`,
      })
      .catch(() => {});
    return;
  }

  await webClient.reactions
    .add({ channel, timestamp: status.ts, name: "mag" })
    .catch(() => {});

  // Step 2: Call the Next.js chat API (skipSlack so it doesn't also post to #seo-reports)
  let report;
  let reportMeta = null;
  try {
    const { data } = await postChatWithRetry(
      { message: query, skipSlack: true },
      controller.signal
    );
    if (!data.success) {
      const err = new Error(data.error || "Unknown error");
      err.userFacing = `:warning: ${humanizeError(data.error)}`;
      throw err;
    }
    report = data.report;
    reportMeta = {
      intents: data.intents,
      domains: data.domains,
      keyword: data.keyword,
      filteredData: data.filtered_data,
    };
  } catch (err) {
    const aborted =
      err.name === "AbortError" || controller.signal.aborted;
    if (aborted) {
      await webClient.chat.update({
        channel,
        ts: status.ts,
        text: `:octagonal_sign: Stopped: _${query.slice(0, 120)}_`,
      });
      await webClient.reactions
        .remove({ channel, timestamp: status.ts, name: "mag" })
        .catch(() => {});
      console.log(`[mention] user=${user} request aborted`);
    } else {
      console.error("Chat API failed:", err.stack || err.message);
      await webClient.chat.update({
        channel,
        ts: status.ts,
        text: err.userFacing || `:warning: ${humanizeError(err.message)}`,
      });
      await webClient.reactions
        .remove({ channel, timestamp: status.ts, name: "mag" })
        .catch(() => {});
    }
    if (inflight.get(user)?.controller === controller) inflight.delete(user);
    return;
  }

  // Stop may have arrived while we were awaiting the fetch body — don't post
  // the report in that case. The stop handler already updated the status msg.
  if (controller.signal.aborted) {
    if (inflight.get(user)?.controller === controller) inflight.delete(user);
    console.log(`[mention] user=${user} aborted after fetch — dropping report`);
    return;
  }

  if (inflight.get(user)?.controller === controller) inflight.delete(user);

  // Step 3: Update status message with the report + swap reactions
  await webClient.chat.update({
    channel,
    ts: status.ts,
    text: `*SEO Report for:* ${query}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `SEO Report: ${query.slice(0, 100)}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: report.slice(0, 2900) },
      },
    ],
  });

  await webClient.reactions
    .remove({ channel, timestamp: status.ts, name: "mag" })
    .catch(() => {});
  await webClient.reactions
    .add({ channel, timestamp: status.ts, name: "white_check_mark" })
    .catch(() => {});

  console.log(`[mention] replied in ${channel}`);

  // Step 4: Generate + upload the styled PDF into the same thread.
  // Best-effort — a PDF failure should not wipe out a successful text reply.
  try {
    const pdfRes = await fetch(PDF_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        report,
        intents: reportMeta?.intents ?? [],
        domains: reportMeta?.domains ?? [],
        keyword: reportMeta?.keyword ?? "",
        filteredData: reportMeta?.filteredData ?? {},
      }),
    });
    if (!pdfRes.ok) {
      const text = await pdfRes.text();
      throw new Error(`PDF API ${pdfRes.status}: ${text.slice(0, 200)}`);
    }
    const arrayBuf = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const safe = (query || "seo-report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    await webClient.files.uploadV2({
      channel_id: channel,
      thread_ts: thread_ts || ts,
      file: buffer,
      filename: `${safe || "seo-report"}.pdf`,
      title: `SEO Report: ${query.slice(0, 80)}`,
      initial_comment: ":page_facing_up: PDF version attached.",
    });
    console.log(`[mention] uploaded PDF to ${channel}`);
  } catch (err) {
    console.error("PDF upload failed:", err.message);
  }
}

slackClient.on("app_mention", async ({ event, ack }) => {
  console.log("[event] app_mention received:", JSON.stringify(event).slice(0, 300));
  await ack();
  try {
    await handleMention(event);
  } catch (err) {
    console.error("handleMention threw:", err);
  }
});

// Catch-all: log every event the bot receives (for debugging)
slackClient.on("slack_event", async ({ ack, body }) => {
  const type = body?.event?.type || body?.type || "unknown";
  console.log(`[slack_event] type=${type}`);
  if (ack) await ack();
});

slackClient.on("connected", () => {
  console.log("✓ Slack bot connected via Socket Mode. Listening for @mentions.");
});

slackClient.on("disconnected", () => {
  console.warn("Slack bot disconnected. Reconnecting...");
});

slackClient.on("error", (err) => {
  console.error("[slack error]", err);
});

slackClient.start().catch((err) => {
  console.error("Failed to start Slack bot:", err);
  process.exit(1);
});
