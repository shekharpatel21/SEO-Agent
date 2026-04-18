// Telegram adapter — responds to /seo <query>, direct messages in private chats,
// and @botname mentions in groups.

const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function splitForTelegram(text, limit = 3800) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}

function start() {
  if (!TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — skipping Telegram adapter.");
    return;
  }
  activity.registerAdapter("telegram", "connecting");
  let TelegramBot;
  try {
    TelegramBot = require("node-telegram-bot-api");
  } catch {
    console.warn("[telegram] `node-telegram-bot-api` not installed — run `npm install node-telegram-bot-api`.");
    return;
  }

  const bot = new TelegramBot(TOKEN, { polling: true });

  bot.getMe().then((me) => {
    activity.setAdapterStatus("telegram", "connected");
    console.log(`✓ [telegram] logged in as @${me.username}`);
    bot._cachedUsername = me.username;
  }).catch((err) => {
    activity.setAdapterStatus("telegram", "error", err.message);
    console.error("[telegram] getMe failed:", err.message);
  });

  bot.on("polling_error", (err) => {
    console.error("[telegram] polling error:", err.code || err.message);
  });

  async function respond(chatId, replyToMessageId, query) {
    let statusMsg;
    try {
      statusMsg = await bot.sendMessage(chatId, `⏳ Working on: ${query}`, {
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true,
      });
    } catch (err) {
      console.error("[telegram] sendMessage failed:", err.message);
      return;
    }

    try {
      const result = await handleQuery(query, { adapter: "telegram", user: String(chatId) });
      const pieces = splitForTelegram(`*SEO Report for:* ${query}\n\n${result.report}`);

      try {
        await bot.editMessageText(pieces[0], {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "Markdown",
        });
      } catch {
        await bot.editMessageText(pieces[0], {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
      }
      for (let i = 1; i < pieces.length; i++) {
        await bot.sendMessage(chatId, pieces[i]);
      }

      if (result.pdfBuffer) {
        await bot.sendDocument(
          chatId,
          result.pdfBuffer,
          { caption: "📄 PDF version attached." },
          { filename: result.filename, contentType: "application/pdf" }
        );
      }
    } catch (err) {
      console.error("[telegram] handleQuery failed:", err.stack || err.message);
      const text = `⚠️ ${err.userFacing || humanizeError(err.message)}`;
      try {
        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
      } catch {}
    }
  }

  bot.onText(/^\/seo(?:@\w+)?\s+(.+)/i, async (msg, match) => {
    await respond(msg.chat.id, msg.message_id, match[1].trim());
  });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    if (/^\/seo(?:@\w+)?/i.test(msg.text)) return;

    const isPrivate = msg.chat.type === "private";
    const username = bot._cachedUsername;
    const mentioned =
      username && new RegExp(`@${username}\\b`, "i").test(msg.text);

    if (!isPrivate && !mentioned) return;

    let query = msg.text;
    if (username) {
      query = query.replace(new RegExp(`@${username}\\b`, "gi"), "").trim();
    }
    if (!query) {
      await bot.sendMessage(
        msg.chat.id,
        "Ask me something like: `/seo 10 keywords for AI agent automation`",
        { reply_to_message_id: msg.message_id, allow_sending_without_reply: true }
      );
      return;
    }
    await respond(msg.chat.id, msg.message_id, query);
  });
}

module.exports = { start };
