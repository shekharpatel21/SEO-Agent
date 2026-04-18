// Microsoft Teams adapter — uses the Bot Framework SDK.
// Mounts POST /api/messages on the shared Express app; configure that URL
// as the bot's messaging endpoint in the Azure Bot Service registration.
//
// Set TEAMS_APP_ID and TEAMS_APP_PASSWORD to enable. If either is missing
// the adapter is skipped (the rest of the server still runs).

const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

const APP_ID = process.env.TEAMS_APP_ID;
const APP_PASSWORD = process.env.TEAMS_APP_PASSWORD;
const APP_TYPE = process.env.TEAMS_APP_TYPE || "MultiTenant";
const APP_TENANT = process.env.TEAMS_APP_TENANT_ID || "";

function mount(app) {
  if (!APP_ID || !APP_PASSWORD) {
    console.warn("[teams] TEAMS_APP_ID / TEAMS_APP_PASSWORD not set — skipping Teams adapter.");
    return;
  }
  let botbuilder;
  try {
    botbuilder = require("botbuilder");
  } catch {
    console.warn("[teams] `botbuilder` not installed — run `npm install botbuilder` to enable.");
    return;
  }

  const { CloudAdapter, ConfigurationBotFrameworkAuthentication, ActivityHandler, CardFactory } = botbuilder;

  const authConfig = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: APP_ID,
    MicrosoftAppPassword: APP_PASSWORD,
    MicrosoftAppType: APP_TYPE,
    MicrosoftAppTenantId: APP_TENANT,
  });
  const adapter = new CloudAdapter(authConfig);

  adapter.onTurnError = async (context, error) => {
    console.error("[teams] turn error:", error);
    try {
      await context.sendActivity(`⚠️ ${humanizeError(error.message)}`);
    } catch {}
  };

  class SeoBot extends ActivityHandler {
    constructor() {
      super();
      this.onMessage(async (context, next) => {
        const raw = (context.activity.text || "").trim();
        const query = raw.replace(/<at>.*?<\/at>/gi, "").trim();

        if (!query) {
          await context.sendActivity(
            "Ask me something like: _10 keywords for AI agent automation_"
          );
          await next();
          return;
        }

        await context.sendActivity({ type: "typing" });
        await context.sendActivity(`⏳ Working on: ${query}`);

        try {
          const result = await handleQuery(query, {
            adapter: "teams",
            user: context.activity?.from?.id,
          });
          const card = CardFactory.adaptiveCard({
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.4",
            body: [
              { type: "TextBlock", size: "Large", weight: "Bolder", text: `SEO Report: ${query.slice(0, 100)}`, wrap: true },
              { type: "TextBlock", text: result.report.slice(0, 3800), wrap: true },
            ],
          });
          await context.sendActivity({ attachments: [card] });

          if (result.pdfBuffer) {
            await context.sendActivity({
              attachments: [{
                name: result.filename,
                contentType: "application/pdf",
                contentUrl: `data:application/pdf;base64,${result.pdfBuffer.toString("base64")}`,
              }],
            });
          }
        } catch (err) {
          console.error("[teams] handleQuery failed:", err.stack || err.message);
          await context.sendActivity(`⚠️ ${err.userFacing || humanizeError(err.message)}`);
        }
        await next();
      });

      this.onMembersAdded(async (context, next) => {
        for (const member of context.activity.membersAdded || []) {
          if (member.id !== context.activity.recipient.id) {
            await context.sendActivity(
              "👋 SEO Keyword Agent here. Ask me: _10 keywords for AI agent automation_"
            );
          }
        }
        await next();
      });
    }
  }

  const bot = new SeoBot();

  app.post("/api/messages", (req, res) => {
    adapter.process(req, res, (context) => bot.run(context));
  });

  activity.registerAdapter("teams", "ready");
  console.log("✓ [teams] mounted on POST /api/messages");
}

module.exports = { mount };
