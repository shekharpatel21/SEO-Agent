// Slack adapter — Socket Mode listener for @mentions.
// Delegates the SEO work to core/handler.js; this file only handles
// Slack-specific message posting, reactions, and the stop-command flow.

const { SocketModeClient } = require("@slack/socket-mode");
const { WebClient } = require("@slack/web-api");
const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

function stripBotMention(text) {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}
function isStopCommand(q) {
  return /^\s*stop\s*[.!]?\s*$/i.test(q);
}

function start() {
  if (!APP_TOKEN || !APP_TOKEN.startsWith("xapp-")) {
    console.warn("[slack] SLACK_APP_TOKEN missing or invalid — skipping Slack adapter.");
    return;
  }
  if (!BOT_TOKEN || !BOT_TOKEN.startsWith("xoxb-")) {
    console.warn("[slack] SLACK_BOT_TOKEN missing or invalid — skipping Slack adapter.");
    return;
  }
  activity.registerAdapter("slack", "connecting");

  const slackClient = new SocketModeClient({ appToken: APP_TOKEN });
  const webClient = new WebClient(BOT_TOKEN);
  const inflight = new Map();

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
        await webClient.chat.update({
          channel: pending.status.channel,
          ts: pending.status.ts,
          text: `:octagonal_sign: Stopped: _${pending.query.slice(0, 120)}_`,
        }).catch(() => {});
        await webClient.reactions.remove({
          channel: pending.status.channel,
          timestamp: pending.status.ts,
          name: "mag",
        }).catch(() => {});
      }
      await webClient.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts,
        text: `:octagonal_sign: Stopped your request: _${pending.query.slice(0, 120)}_`,
      });
      return;
    }

    console.log(`[slack] user=${user} channel=${channel} query="${query}"`);

    const existing = inflight.get(user);
    if (existing) { existing.controller.abort(); inflight.delete(user); }
    const controller = new AbortController();
    inflight.set(user, { controller, query, status: null });

    const status = await webClient.chat.postMessage({
      channel,
      thread_ts: thread_ts || ts,
      text: `:hourglass_flowing_sand: Working on: ${query}`,
    });
    if (inflight.get(user)?.controller === controller) {
      inflight.set(user, { controller, query, status: { channel, ts: status.ts } });
    }
    if (controller.signal.aborted) return;
    await webClient.reactions.add({ channel, timestamp: status.ts, name: "mag" }).catch(() => {});

    let result;
    try {
      result = await handleQuery(query, { signal: controller.signal, adapter: "slack", user });
    } catch (err) {
      const aborted = err.name === "AbortError" || controller.signal.aborted;
      if (aborted) {
        await webClient.chat.update({
          channel,
          ts: status.ts,
          text: `:octagonal_sign: Stopped: _${query.slice(0, 120)}_`,
        }).catch(() => {});
      } else {
        console.error("[slack] chat failed:", err.stack || err.message);
        await webClient.chat.update({
          channel,
          ts: status.ts,
          text: `:warning: ${err.userFacing || humanizeError(err.message)}`,
        }).catch(() => {});
      }
      await webClient.reactions.remove({ channel, timestamp: status.ts, name: "mag" }).catch(() => {});
      if (inflight.get(user)?.controller === controller) inflight.delete(user);
      return;
    }

    if (controller.signal.aborted) {
      if (inflight.get(user)?.controller === controller) inflight.delete(user);
      return;
    }
    if (inflight.get(user)?.controller === controller) inflight.delete(user);

    await webClient.chat.update({
      channel,
      ts: status.ts,
      text: `*SEO Report for:* ${query}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `SEO Report: ${query.slice(0, 100)}` } },
        { type: "section", text: { type: "mrkdwn", text: result.report.slice(0, 2900) } },
      ],
    });
    await webClient.reactions.remove({ channel, timestamp: status.ts, name: "mag" }).catch(() => {});
    await webClient.reactions.add({ channel, timestamp: status.ts, name: "white_check_mark" }).catch(() => {});

    if (result.pdfBuffer) {
      try {
        await webClient.files.uploadV2({
          channel_id: channel,
          thread_ts: thread_ts || ts,
          file: result.pdfBuffer,
          filename: result.filename,
          title: `SEO Report: ${query.slice(0, 80)}`,
          initial_comment: ":page_facing_up: PDF version attached.",
        });
      } catch (err) {
        console.error("[slack] PDF upload failed:", err.message);
      }
    }
  }

  slackClient.on("app_mention", async ({ event, ack }) => {
    await ack();
    try { await handleMention(event); }
    catch (err) { console.error("[slack] handleMention threw:", err); }
  });
  slackClient.on("connected", () => {
    activity.setAdapterStatus("slack", "connected");
    console.log("✓ [slack] connected via Socket Mode.");
  });
  slackClient.on("disconnected", () => {
    activity.setAdapterStatus("slack", "disconnected");
    console.warn("[slack] disconnected. Reconnecting...");
  });
  slackClient.on("error", (err) => console.error("[slack] error:", err));
  slackClient.start().catch((err) => console.error("[slack] failed to start:", err));
}

module.exports = { start };
