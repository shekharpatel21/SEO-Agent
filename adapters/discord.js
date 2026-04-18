// Discord adapter — responds to @mentions or the `!seo <query>` command.
// Posts the report as a message and attaches the PDF.

const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const TOKEN = process.env.DISCORD_BOT_TOKEN;

function splitForDiscord(text, limit = 1900) {
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
    console.warn("[discord] DISCORD_BOT_TOKEN not set — skipping Discord adapter.");
    return;
  }
  activity.registerAdapter("discord", "connecting");
  let Client, GatewayIntentBits, Partials, AttachmentBuilder;
  try {
    ({ Client, GatewayIntentBits, Partials, AttachmentBuilder } = require("discord.js"));
  } catch {
    console.warn("[discord] `discord.js` not installed — run `npm install discord.js` to enable.");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once("ready", () => {
    activity.setAdapterStatus("discord", "connected");
    console.log(`✓ [discord] logged in as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const mentioned = message.mentions.has(client.user);
    const commandMatch = message.content.match(/^!seo\s+(.+)/i);
    if (!mentioned && !commandMatch) return;

    const raw = commandMatch
      ? commandMatch[1]
      : message.content.replace(/<@!?\d+>/g, "").trim();

    if (!raw) {
      await message.reply("Ask me something like: `!seo 10 keywords for AI agent automation`");
      return;
    }

    let statusMsg;
    try {
      statusMsg = await message.reply(`⏳ Working on: ${raw}`);
    } catch (err) {
      console.error("[discord] failed to send status:", err.message);
      return;
    }

    try {
      const result = await handleQuery(raw, { adapter: "discord", user: message.author.id });

      const header = `**SEO Report for:** ${raw}\n\n`;
      const pieces = splitForDiscord(header + result.report);
      await statusMsg.edit(pieces[0]);
      for (let i = 1; i < pieces.length; i++) {
        await message.channel.send(pieces[i]);
      }

      if (result.pdfBuffer) {
        const attachment = new AttachmentBuilder(result.pdfBuffer, { name: result.filename });
        await message.channel.send({
          content: "📄 PDF version attached.",
          files: [attachment],
        });
      }
    } catch (err) {
      console.error("[discord] handleQuery failed:", err.stack || err.message);
      const text = `⚠️ ${err.userFacing || humanizeError(err.message)}`;
      try { await statusMsg.edit(text); } catch {}
    }
  });

  client.login(TOKEN).catch((err) => {
    console.error("[discord] login failed:", err.message);
  });
}

module.exports = { start };
