# SEO Agent

Source-available, self-hostable SEO research AI agent with a multi-platform bot backend. Free for personal, educational, and research use. Ask a question from Slack, Discord, Telegram, Microsoft Teams, WhatsApp, email, a web widget, the CLI, or any HTTP client — get back a structured SEO report with keyword ideas, SERP analysis, competitor insight, and a styled PDF.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-orange.svg)](./LICENSE)

> **Free for personal, educational, and research use.** Commercial use, hosted SaaS, and any revenue-generating activity require a separate license — see [LICENSE](./LICENSE) or contact [shekharpatel2221@gmail.com](mailto:shekharpatel2221@gmail.com).

---

## Features

- **Keyword ideas, SERP analysis, related & competitor keywords** — powered by your choice of DataForSEO, SEMrush, or Ahrefs
- **AI-generated reports** — pick OpenAI, Gemini, or Anthropic
- **Styled PDF export** — auto-generated per query
- **8 bot adapters** — Slack, Discord, Telegram, MS Teams, WhatsApp, Email, Web widget, CLI, plus a generic HTTP webhook
- **Auto-enable** — each adapter activates only when its env vars are set
- **Built-in web scraper** — fetch mode + optional Playwright for JS-rendered sites
- **Production-ready** — API key auth, rate limiting, `/health` probe, `/admin` dashboard, graceful shutdown

---

## How it works

The repo ships two pieces that boot together with one command:

- **`frontend/`** — a Next.js app exposing the chat UI and the SEO logic at `/api/chat` and `/api/export-pdf`
- **`bot-server.js`** — a Node process running every adapter (Slack/Discord/Telegram/etc.). Each adapter forwards user queries to the frontend's `/api/chat` and returns the report

`npm start` spawns both — adapters on `:4000`, the embedded Next.js on `:3000`.

```
                      ┌──────────────────────────────────────────────┐
                      │             Next.js frontend                 │
                      │    (chat UI, SEO research, PDF export)       │
                      │        /api/chat   /api/export-pdf   …       │
                      └──────────────────────┬───────────────────────┘
                                             │ HTTP
                                             ▼
              ┌────────────────────┐   ┌─────────────┐
              │  core/handler.js   │◀──│ core/       │
              │  (shared logic:    │   │ activity.js │
              │  query → report    │   │ auth.js     │
              │  + PDF buffer)     │   │ rateLimit.js│
              └─────────▲──────────┘   └─────────────┘
                        │
                        │   each adapter calls handleQuery()
                        │
   ┌──────┬──────┬──────┼──────┬──────┬──────┬──────┬──────┐
   │      │      │      │      │      │      │      │      │
 Slack  Disc. Tele.  Teams  W'App Email  Web   HTTP   CLI
   │      │      │      │      │      │   widget   any   REPL
   │      │      │      │      │      │  + iframe        │
   ▼      ▼      ▼      ▼      ▼      ▼     ▼      ▼     ▼
      adapters/  ▸  each one is a thin translator to/from its platform


    SEO data flows in via one of three providers (pick one with SEO_PROVIDER):
              DataForSEO   ·   SEMrush   ·   Ahrefs
```

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/shekharpatel21/SEO-Agent.git
cd SEO-Agent
npm install
```

A single `npm install` installs both backend and frontend dependencies (the `postinstall` hook handles the frontend).

### 2. Configure

Copy `.env.example` to `.env` and fill in credentials:

```env
# Required: pick one SEO data provider
SEO_PROVIDER=dataforseo              # dataforseo | semrush | ahrefs
DATAFORSEO_USERNAME=your_username
DATAFORSEO_PASSWORD=your_password
# or use SEMrush:
# SEMRUSH_API_KEY=...
# or use Ahrefs:
# AHREFS_API_TOKEN=...

# Pick one AI provider
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=...
```

### 3. Run

```bash
npm start
```

You'll see which adapters connected and which were skipped for missing credentials. Open [http://localhost:3000](http://localhost:3000) for the chat UI, or use one of the bot adapters.

> **Note:** The chat UI lives at the root URL — `http://localhost:3000`. The path `/api/chat` is a **POST-only** internal endpoint that bot adapters call; visiting it in a browser shows a 404, which is expected.

For a no-token quick test:

```bash
npm run cli
```

---

## Commands

All commands are run from the root of the project, from a terminal:

| Command | Action |
|---|---|
| `npm install` | Install backend + frontend dependencies (postinstall installs frontend deps automatically) |
| `npm start` | Start everything — backend on `:4000` + embedded Next.js on `:3000` |
| `npm run dev` | Same as `start`, with auto-restart on file changes (`node --watch`) |
| `npm run cli` | Interactive CLI REPL — zero tokens needed, instant local testing |
| `npm run build:frontend` | Production build of the Next.js app (use with `BOT_FRONTEND_MODE=start`) |
| `npm run start:slack-only` | Legacy single-platform Slack-only entry (still works) |
| `docker compose up` | Run the whole stack containerized |

---

## Required API keys

| Service | Required | Get it at |
|---|---|---|
| DataForSEO / SEMrush / Ahrefs | Pick one (SEO data) | [dataforseo.com](https://dataforseo.com) · [semrush.com](https://www.semrush.com) · [ahrefs.com](https://ahrefs.com) |
| OpenAI / Gemini / Anthropic | Pick one (AI provider) | [openai.com](https://platform.openai.com) · [aistudio.google.com](https://aistudio.google.com/app/apikey) · [anthropic.com](https://console.anthropic.com) |

Bot tokens (Slack / Discord / Telegram / Teams / Twilio / SMTP) are only required if you want that specific platform.

---

## Supported bot platforms

| Platform | Transport | Required env vars |
|---|---|---|
| **Slack** | WebSocket (Socket Mode) | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` |
| **Discord** | WebSocket (Gateway) | `DISCORD_BOT_TOKEN` |
| **Telegram** | Long polling | `TELEGRAM_BOT_TOKEN` |
| **MS Teams** | HTTP (Bot Framework) | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD` |
| **WhatsApp** | HTTP (Twilio) | `TWILIO_AUTH_TOKEN`, `BOT_PUBLIC_URL` |
| **Email** | Inbound webhook + SMTP | `SMTP_HOST`, `SMTP_FROM` |
| **Web widget** | Embeddable HTML / iframe | *(none)* |
| **Generic HTTP** | `POST /api/message` | *(none, optional `BOT_API_KEYS`)* |
| **CLI** | Local REPL | `BOT_CLI_ENABLED=1` |

For even more notes (corner cases, troubleshooting), see [BOT_PLATFORMS.md](./BOT_PLATFORMS.md).

---

## Platform setup

### Slack

Uses Slack Socket Mode (no public URL needed).

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) → **From scratch**.
2. **Settings → Socket Mode** → Enable → generate an App-Level Token with `connections:write` scope. This is your `SLACK_APP_TOKEN` (`xapp-…`).
3. **OAuth & Permissions → Bot Token Scopes** — add: `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`, `files:write`, `files:read`, `groups:history`, `groups:read`, `im:history`, `im:read`, `reactions:write`, `reactions:read`.
4. **Install to Workspace** → copy the Bot User OAuth Token (`xoxb-…`). This is your `SLACK_BOT_TOKEN`.
5. **Event Subscriptions → Subscribe to bot events** — add `app_mention`, `message.channels`, `message.groups`, `message.im`.
6. Add to `.env`:
   ```env
   SLACK_BOT_TOKEN=xoxb-…
   SLACK_APP_TOKEN=xapp-…
   SLACK_SIGNING_SECRET=…
   ```
7. Invite the bot: `/invite @YourBotName`. Then `@YourBotName 10 keywords for AI agent automation`.

**Stop command**: `@YourBotName stop` aborts your in-flight request.

### Discord

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. **Bot** → Add Bot → copy the token as `DISCORD_BOT_TOKEN`.
3. **Privileged Gateway Intents** → enable **Message Content Intent**.
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands`; permissions: `Send Messages`, `Attach Files`, `Read Message History`. Use the generated URL to invite the bot.
5. Add to `.env`:
   ```env
   DISCORD_BOT_TOKEN=…
   ```
6. Mention the bot in a channel, or use `!seo <query>` directly.

### Telegram

1. Message **@BotFather** on Telegram → `/newbot`.
2. Copy the token as `TELEGRAM_BOT_TOKEN`.
3. Add to `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=…
   ```
4. DM the bot or use `/seo <query>` in any group it's added to. In groups it also responds to `@botname <query>`.

### Microsoft Teams

Uses the Azure Bot Framework. Requires a public HTTPS endpoint.

1. Create an **Azure Bot** resource in the Azure Portal.
2. Messaging endpoint: `https://YOUR_HOST/api/messages`.
3. From **Configuration** copy the Microsoft App ID and generate a client secret.
4. Add to `.env`:
   ```env
   TEAMS_APP_ID=…
   TEAMS_APP_PASSWORD=…
   TEAMS_APP_TYPE=MultiTenant         # or SingleTenant / UserAssignedMSI
   TEAMS_APP_TENANT_ID=…              # only for SingleTenant
   ```
5. Use the **Developer Portal for Teams** or Teams Toolkit to package a manifest and install the bot into a team. Once installed, @mention it.

### WhatsApp (Twilio)

Uses Twilio's WhatsApp API (sandbox for testing, or a paid WhatsApp Business profile for production).

1. Activate the Twilio Sandbox at [twilio.com/console/sms/whatsapp/sandbox](https://www.twilio.com/console/sms/whatsapp/sandbox).
2. Set the inbound webhook URL to `https://YOUR_HOST/api/webhook/whatsapp`.
3. Copy the Auth Token and add to `.env`:
   ```env
   TWILIO_AUTH_TOKEN=…
   BOT_PUBLIC_URL=https://YOUR_HOST     # so PDF download links resolve
   ```
4. From WhatsApp, follow the Twilio sandbox join instructions, then just send your query.

PDFs are too large for TwiML inline — the bot replies with a time-boxed download link (`/api/webhook/whatsapp/pdf/<token>`, valid for 30 min).

### Email (SMTP in/out)

Works with any inbound-email provider (SendGrid Inbound Parse, Mailgun Routes, Cloudflare Email Workers) that POSTs parsed email to a webhook.

1. **Outbound (SMTP reply)** — add to `.env`:
   ```env
   SMTP_HOST=smtp.yourprovider.com
   SMTP_PORT=587
   SMTP_SECURE=                    # 1 for implicit TLS on 465
   SMTP_USER=bot@yourdomain.com
   SMTP_PASS=…
   SMTP_FROM=SEO Bot <bot@yourdomain.com>
   ```
2. **Inbound** — in your email provider, route incoming mail for `bot@yourdomain.com` to `POST https://YOUR_HOST/api/webhook/email`. Body fields accepted: `from`, `subject`, `text` / `body` / `body-plain`, optional `messageId`.

The bot strips common email quoting ("On … wrote:", `>` lines), runs the query, and replies with the report in the body + PDF as an attachment.

### Web widget

The simplest possible integration — one script tag on any page:

```html
<script src="https://YOUR_HOST/widget.js" defer></script>
```

This injects a floating **Ask SEO** button bottom-right that opens the widget in an iframe. The widget itself is served at `/widget/` and can also be linked directly or embedded in its own `<iframe>`.

Configure the endpoint from the parent page if needed:

```html
<script>window.SEO_WIDGET_ENDPOINT = "https://YOUR_HOST/api/message";</script>
<script src="https://YOUR_HOST/widget.js" defer></script>
```

### Generic HTTP webhook

For anything not listed above — Mattermost, Zulip, Rocket.Chat, Zapier, n8n, Make.com, custom apps, mobile apps, curl:

```bash
curl -X POST https://YOUR_HOST/api/message \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{"query":"10 keywords for AI agent automation"}'
```

Response:

```json
{
  "success": true,
  "query": "10 keywords for AI agent automation",
  "report": "markdown report…",
  "meta": { "intents": [...], "domains": [...], "keyword": "…", "filteredData": {...} },
  "filename": "10-keywords-for-ai-agent-automation.pdf",
  "pdf_base64": "JVBERi0xLjcK…"
}
```

No credentials needed by default. Set `BOT_API_KEYS` to require a key (see [Security](#security)).

### CLI

Zero external dependencies, instant local testing:

```bash
npm run cli
```

```
▶ SEO CLI — type a question, or :help
seo> 10 keywords for AI agent automation
…report prints…
  (PDF ready · use  :save report.pdf  to export)
seo> :save ~/Desktop/report.pdf
  saved → /Users/you/Desktop/report.pdf
seo> :quit
```

Also usable from scripts and pipelines.

---

## HTTP endpoints

| Route | Method | Purpose |
|---|---|---|
| `/api/message` | POST | Generic query entry — any client, any platform |
| `/api/messages` | POST | Microsoft Teams (Bot Framework) |
| `/api/webhook/whatsapp` | POST | WhatsApp inbound (Twilio) |
| `/api/webhook/email` | POST | Inbound-email webhook |
| `/widget/` | GET | Embeddable chat widget |
| `/widget.js` | GET | Floating-button embed script |
| `/admin` | GET | Live dashboard |
| `/health` | GET | JSON probe for uptime monitoring |
| `/api/activity` | GET | Recent query log (JSON) |

---

## Configuration reference

```env
# ── SEO data provider (pick one) ──────────────────
SEO_PROVIDER=dataforseo              # dataforseo | semrush | ahrefs
DATAFORSEO_USERNAME=
DATAFORSEO_PASSWORD=
SEMRUSH_API_KEY=
AHREFS_API_TOKEN=

# ── AI provider (pick one) ────────────────────────
AI_PROVIDER=gemini                   # openai | gemini | anthropic
AI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# ── Slack ─────────────────────────────────────────
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=

# ── Discord ───────────────────────────────────────
DISCORD_BOT_TOKEN=

# ── Telegram ──────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ── Microsoft Teams ───────────────────────────────
TEAMS_APP_ID=
TEAMS_APP_PASSWORD=

# ── WhatsApp (Twilio) ─────────────────────────────
TWILIO_AUTH_TOKEN=
BOT_PUBLIC_URL=

# ── Email (SMTP outbound) ─────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# ── CLI ───────────────────────────────────────────
BOT_CLI_ENABLED=                     # 1 to enable in `npm start`

# ── Bot server ────────────────────────────────────
BOT_SERVER_PORT=4000
BOT_API_KEYS=                        # comma-separated; if set, /api/message requires one
BOT_RATE_LIMIT_MAX=30
BOT_RATE_LIMIT_WINDOW_SEC=60

# ── Embedded frontend ─────────────────────────────
BOT_EMBED_FRONTEND=                  # 0 to disable the auto-spawned Next.js
FRONTEND_PORT=3000
```

---

## Security

- Set `BOT_API_KEYS` to a comma-separated list. `/api/message` and `/api/activity` then require one via `Authorization: Bearer <key>`, `X-API-Key`, or `?api_key=`. Constant-time comparison.
- Built-in sliding-window rate limiter: 30 req/min by default, keyed by API key or IP.
- WhatsApp adapter verifies Twilio's HMAC-SHA1 signature when `TWILIO_AUTH_TOKEN` is set.

---

## Tech stack

Node 20+, Express, Next.js 14, Tailwind CSS, DataForSEO / SEMrush / Ahrefs, OpenAI / Gemini / Anthropic SDKs, Slack / Discord / Telegram / Bot Framework SDKs, optional Playwright for JS-rendered scraping.

---

## Project layout

```
SEO-Agent/
├── core/                    # shared, platform-agnostic modules
│   ├── handler.js           # query → report + PDF
│   ├── activity.js          # in-memory ring + JSONL log
│   ├── auth.js              # API key middleware
│   ├── rateLimit.js         # sliding-window limiter
│   └── frontend.js          # spawns the embedded Next.js on `npm start`
├── adapters/                # one file per platform
│   ├── slack.js
│   ├── discord.js
│   ├── telegram.js
│   ├── teams.js
│   ├── whatsapp.js
│   ├── email.js
│   ├── webhook.js           # /api/message + /admin + /health + widget routes
│   └── cli.js
├── public/widget/           # embeddable chat UI
│   ├── index.html
│   └── embed.js
├── frontend/                # Next.js app (UI + /api/chat + /api/export-pdf)
├── bot-server.js            # main entry — wires everything together
├── slack-bot.js             # legacy single-platform entry (still works)
├── Dockerfile
├── docker-compose.yml
├── BOT_PLATFORMS.md         # focused platform integration notes
└── README.md                # you are here
```

---

## License

**PolyForm Noncommercial 1.0.0** — see [LICENSE](./LICENSE).

Free for personal, educational, and research use. **Commercial use is not permitted** under this license — including selling the software, hosting it as a paid SaaS, integrating it into commercial products, or any revenue-generating activity. For commercial licensing, partnerships, or hosted-SaaS rights, contact [shekharpatel2221@gmail.com](mailto:shekharpatel2221@gmail.com).
