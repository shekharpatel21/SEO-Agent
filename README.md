# SEO Keyword Agent

Open-source, self-hostable SEO keyword research AI agent with a **multi-platform bot backend**. Ask a question from Slack, Discord, Telegram, Microsoft Teams, WhatsApp, email, a web widget, the CLI, or any HTTP client — get back a structured SEO report with keyword ideas, SERP analysis, competitor insight, and a styled PDF.

Deploy on Vercel for free, plug in your own API keys, run the bot server anywhere Node runs. No SaaS subscription, no vendor lock-in.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/seo-keyword-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Required API keys](#required-api-keys)
- [Multi-platform bot backend](#multi-platform-bot-backend)
  - [Supported platforms](#supported-platforms)
  - [Starting the bot server](#starting-the-bot-server)
  - [Platform setup](#platform-setup)
    - [Slack](#slack)
    - [Discord](#discord)
    - [Telegram](#telegram)
    - [Microsoft Teams](#microsoft-teams)
    - [WhatsApp (Twilio)](#whatsapp-twilio)
    - [Email (SMTP in/out)](#email-smtp-inout)
    - [Web widget](#web-widget)
    - [Generic HTTP webhook](#generic-http-webhook)
    - [CLI](#cli)
- [Endpoints reference](#endpoints-reference)
- [Configuration reference](#configuration-reference)
- [Security](#security)
- [Observability](#observability)
- [Deployment](#deployment)
- [Adding a new platform](#adding-a-new-platform)
- [Web scraper (internal links)](#web-scraper-internal-links)
- [Backend API routes](#backend-api-routes)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### SEO research
- **Keyword Ideas** — search volume, difficulty, CPC, and intent from DataForSEO
- **SERP Analysis** — top-ranking pages for any query
- **Related Keywords** — variations and long-tails
- **Competitor Keywords** — see what any domain ranks for
- **AI Mode** — enriched keyword data with monthly trends
- **Internal Links** — built-in scraper (fetch mode + optional Playwright)
- **AI Reports** — structured analysis from OpenAI, Gemini, or Claude
- **PDF Export** — styled report PDF auto-generated per query

### Multi-platform bot
- **8 adapters out of the box** — Slack, Discord, Telegram, Teams, WhatsApp, Email, Web widget, CLI, plus a generic HTTP endpoint
- **Auto-enable** — each adapter activates only when its env vars are set
- **One shared core** — add a new platform in ~50 lines without touching the others
- **Embed on any site** — drop-in `<script src="…/widget.js">`

### Production-ready
- API key auth + sliding-window rate limiting on public endpoints
- Graceful shutdown (SIGINT/SIGTERM)
- `/health` probe with per-adapter status
- `/admin` dashboard with live activity log
- JSONL audit log (optional, file-backed)
- Dockerfile + docker-compose included

---

## Architecture

```
                      ┌──────────────────────────────────────────────┐
                      │             Next.js frontend                 │
                      │    (chat UI, keyword research, PDF export)   │
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
   ┌──────┬──────┬──────┼──────┬──────┬──────┬──────┬──────┐
   │      │      │      │      │      │      │      │      │
 Slack  Disc. Tele.  Teams  W'App Email  Web   HTTP   CLI
   │      │      │      │      │      │    widget  any    REPL
   │      │      │      │      │      │     + iframe    │
   ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼     ▼
      adapters/  ▸  each one is a thin translator to/from its platform
```

Every adapter calls `handleQuery(query, { adapter, user })` and formats the returned `{ report, pdfBuffer, meta, filename }` for its platform. The SEO pipeline lives in **one file** — [core/handler.js](core/handler.js) — so behavior stays consistent across every surface.

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/seo-keyword-agent.git
cd seo-keyword-agent
npm install
cd frontend && npm install && cd ..
```

### 2. Configure environment

Copy `.env` and fill in credentials:

```env
# Required: SEO data provider
DATAFORSEO_USERNAME=your_username
DATAFORSEO_PASSWORD=your_password

# Pick one AI provider
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=...

# Bot server port (default 4000)
BOT_SERVER_PORT=4000
```

All other env vars are optional and documented in [Configuration reference](#configuration-reference).

### 3. Run the frontend (keyword research API)

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you get the chat UI and the `/api/chat` + `/api/export-pdf` backend routes the bot server calls.

### 4. Run the bot server

In a second terminal:

```bash
npm start            # all enabled adapters
# or
npm run cli          # local CLI REPL only (no tokens needed)
```

You'll see which adapters came online and which were skipped for missing credentials.

---

## Required API keys

| Service | Required | Free tier | Get it at |
|---|---|---|---|
| DataForSEO | Yes | Trial credits | [dataforseo.com](https://dataforseo.com) |
| OpenAI | Pick one | Paid only | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | Pick one | Generous free tier | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| Anthropic Claude | Pick one | Credits available | [console.anthropic.com](https://console.anthropic.com) |

Platform bot tokens (Slack / Discord / Telegram / Teams / Twilio / SMTP) are only needed if you want *that specific platform*. The system ships nine adapters — enable as many or as few as you like.

---

## Multi-platform bot backend

### Supported platforms

| Platform       | Transport               | Required env vars                                       |
|----------------|--------------------------|----------------------------------------------------------|
| **Slack**      | WebSocket (Socket Mode)  | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`                    |
| **Discord**    | WebSocket (Gateway)      | `DISCORD_BOT_TOKEN`                                      |
| **Telegram**   | Long polling             | `TELEGRAM_BOT_TOKEN`                                     |
| **MS Teams**   | HTTP (Bot Framework)     | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`                    |
| **WhatsApp**   | HTTP (Twilio)            | `TWILIO_AUTH_TOKEN` (signing), `BOT_PUBLIC_URL`         |
| **Email**      | Inbound webhook + SMTP   | `SMTP_HOST`, `SMTP_FROM` (plus provider inbound route)  |
| **Web widget** | Embeddable HTML / iframe | *(none)*                                                 |
| **Generic HTTP** | `POST /api/message`    | *(none, optionally `BOT_API_KEYS`)*                      |
| **CLI**        | Local REPL               | `BOT_CLI_ENABLED=1`                                      |

### Starting the bot server

```bash
npm start              # production
npm run dev            # auto-restart on file changes
npm run cli            # interactive CLI only
docker compose up      # containerized (see Deployment)
```

On startup, the server prints which adapters connected and which it skipped:

```
▶ bot-server v2 — slack/discord/telegram/teams/whatsapp/email/cli/webhook+widget
[discord] DISCORD_BOT_TOKEN not set — skipping Discord adapter.
✓ [whatsapp] mounted POST /api/webhook/whatsapp
✓ [webhook] mounted /api/message, /health, /api/activity, /admin, /widget
✓ HTTP adapters listening on :4000
✓ [slack] connected via Socket Mode.
```

### Platform setup

#### Slack

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

#### Discord

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. **Bot** → Add Bot → copy the token as `DISCORD_BOT_TOKEN`.
3. **Privileged Gateway Intents** → enable **Message Content Intent**.
4. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands`; permissions: `Send Messages`, `Attach Files`, `Read Message History`. Use the generated URL to invite the bot.
5. Add to `.env`:
   ```env
   DISCORD_BOT_TOKEN=…
   ```
6. Mention the bot in a channel, or use `!seo <query>` directly.

#### Telegram

1. Message **@BotFather** on Telegram → `/newbot`.
2. Copy the token as `TELEGRAM_BOT_TOKEN`.
3. Add to `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=…
   ```
4. DM the bot or use `/seo <query>` in any group it's added to. In groups it also responds to `@botname <query>`.

#### Microsoft Teams

Uses the Azure Bot Framework. Requires a public HTTPS endpoint.

1. Create an **Azure Bot** resource in the Azure Portal.
2. Messaging endpoint: `https://YOUR_HOST/api/messages`.
3. From **Configuration** copy the Microsoft App ID and generate a client secret.
4. Add to `.env`:
   ```env
   TEAMS_APP_ID=…
   TEAMS_APP_PASSWORD=…
   TEAMS_APP_TYPE=MultiTenant        # or SingleTenant / UserAssignedMSI
   TEAMS_APP_TENANT_ID=…              # only for SingleTenant
   ```
5. Use the **Developer Portal for Teams** or Teams Toolkit to package a manifest and install the bot into a team. Once installed, @mention it.

#### WhatsApp (Twilio)

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

#### Email (SMTP in/out)

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

The bot strips common email quoting (“On … wrote:”, `>` lines), runs the query, and replies with the report in the body + PDF as an attachment.

#### Web widget

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

#### Generic HTTP webhook

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

#### CLI

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

## Endpoints reference

| Route                           | Method | Auth | Purpose                                                      |
|---------------------------------|--------|------|--------------------------------------------------------------|
| `/api/message`                  | POST   | optional | Generic query entry — any client, any platform           |
| `/api/messages`                 | POST   | Bot Framework | Microsoft Teams                                   |
| `/api/webhook/whatsapp`         | POST   | Twilio signature | WhatsApp inbound                               |
| `/api/webhook/whatsapp/pdf/:t`  | GET    | token (time-boxed) | PDF download for WhatsApp users              |
| `/api/webhook/email`            | POST   | (provider) | Inbound-email webhook (SendGrid/Mailgun shape)      |
| `/widget/`                      | GET    | —    | Standalone embeddable chat widget                            |
| `/widget.js`                    | GET    | —    | Floating-button embed script                                 |
| `/admin`                        | GET    | —    | Live HTML dashboard (counters + adapter status + recent log) |
| `/health`                       | GET    | —    | JSON probe for uptime monitoring                             |
| `/api/activity?limit=N`         | GET    | optional | Recent query log (JSON)                                  |

---

## Configuration reference

All env vars live in `.env`. Only fill in what you need — unused platforms self-skip.

```env
# ── Core ──────────────────────────────────────────
SEO_PROVIDER=dataforseo              # dataforseo | semrush | ahrefs
DATAFORSEO_USERNAME=
DATAFORSEO_PASSWORD=
SEMRUSH_API_KEY=
AHREFS_API_TOKEN=

AI_PROVIDER=gemini                   # openai | gemini | anthropic
AI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

CHAT_API_URL=http://localhost:3000/api/chat
PDF_API_URL=                         # defaults to CHAT_API_URL minus /api/chat + /api/export-pdf
CORS_ORIGIN=*

# ── Slack ─────────────────────────────────────────
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_DEFAULT_CHANNEL=seo-reports

# ── Discord ───────────────────────────────────────
DISCORD_BOT_TOKEN=

# ── Telegram ──────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ── Microsoft Teams ───────────────────────────────
TEAMS_APP_ID=
TEAMS_APP_PASSWORD=
TEAMS_APP_TYPE=MultiTenant           # MultiTenant | SingleTenant | UserAssignedMSI
TEAMS_APP_TENANT_ID=

# ── WhatsApp (Twilio) ─────────────────────────────
TWILIO_AUTH_TOKEN=
BOT_PUBLIC_URL=                      # e.g. https://bot.example.com

# ── Email (SMTP outbound) ─────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=                         # 1 for implicit TLS (port 465)
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# ── CLI ───────────────────────────────────────────
BOT_CLI_ENABLED=                     # 1 to enable when `npm start` is used

# ── Bot server ────────────────────────────────────
BOT_SERVER_PORT=4000
BOT_API_KEYS=                        # comma-separated; when set, /api/message requires one
BOT_RATE_LIMIT_MAX=30                # requests
BOT_RATE_LIMIT_WINDOW_SEC=60         # per this window, per key or IP
BOT_ACTIVITY_RING=200                # in-memory recent-query ring size
BOT_ACTIVITY_FILE=                   # e.g. ./logs/activity.jsonl for persistent audit
```

---

## Security

### API key auth

Set `BOT_API_KEYS` to a comma-separated list. `/api/message` and `/api/activity` then require one of those keys via:

- `Authorization: Bearer <key>` *(recommended)*
- `X-API-Key: <key>`
- `?api_key=<key>` *(convenient for widget configs)*

Comparison is constant-time. Unauthenticated requests return `401` / `403`.

When `BOT_API_KEYS` is empty, endpoints are open — fine for local dev or intranet deployments, not recommended for public hosts.

### Rate limiting

Built-in sliding-window limiter: 30 req/min by default, keyed by API key (if present) or IP. Exceeding the limit returns HTTP 429 with a `Retry-After` header.

Tune with `BOT_RATE_LIMIT_MAX` / `BOT_RATE_LIMIT_WINDOW_SEC`. For multi-instance deploys, add a reverse-proxy or CDN rate limiter in front.

### Webhook signature verification

The WhatsApp adapter verifies Twilio's HMAC-SHA1 signature when `TWILIO_AUTH_TOKEN` is set — unsigned requests get rejected with 403. For Slack this is handled natively by Socket Mode (no inbound URL exposed). Teams is signed by the Bot Framework SDK.

---

## Observability

### `GET /health`

```json
{
  "ok": true,
  "ts": "2026-04-18T13:07:45.602Z",
  "version": "2.0.0",
  "auth": "open",
  "adapters": {
    "slack":   { "status": "connected", "startedAt": "…", "lastEvent": "…" },
    "whatsapp":{ "status": "ready",     "startedAt": "…", "lastEvent": null },
    "email":   { "status": "ready (outbound disabled — SMTP_* not set)", … },
    "webhook": { "status": "ready", … }
  },
  "counters": { "total": 12, "success": 11, "failure": 1, "ring": 12 }
}
```

### `GET /admin`

Zero-dep HTML dashboard. Auto-refreshes every 5 s. Shows:

- Counters (total, success, failure)
- Per-adapter status + last event timestamp
- Last 50 queries: time, adapter, user, query, result, duration

### Activity log

Every query flows through [core/activity.js](core/activity.js):

- **In-memory ring** (default: last 200 queries) — exposed via `/api/activity`
- **Optional JSONL file** — set `BOT_ACTIVITY_FILE=./logs/activity.jsonl` for persistent audit. Each line:
  ```json
  {"ts":"2026-04-18T13:10:00Z","kind":"query","adapter":"slack","user":"U123","query":"…","success":true,"pdf":true,"durationMs":4210}
  ```

Pipe that to your log aggregator of choice (Loki, ELK, Datadog, BigQuery).

---

## Deployment

### Vercel (frontend + API)

The frontend and the Next.js API routes (`/api/chat`, `/api/export-pdf`, etc.) deploy cleanly to Vercel's free tier:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/seo-keyword-agent)

Set the env vars from [Configuration reference](#configuration-reference) in the Vercel dashboard.

### Bot server — Docker

The bot server (`bot-server.js`) is a separate long-lived process and doesn't fit Vercel's serverless model. Run it anywhere Node runs:

```bash
docker compose up -d
docker compose logs -f bot
```

The included [Dockerfile](Dockerfile) uses `node:20-alpine`, `npm ci --omit=dev`, and a `HEALTHCHECK` that hits `/health`. [docker-compose.yml](docker-compose.yml) also wires `host.docker.internal` so the bot can reach a Next.js frontend running on your host during local dev.

### Bot server — bare-metal / PaaS

Any Node 18+ host works: Railway, Render, Fly.io, a VPS with `pm2`, a systemd unit, whatever. `npm ci --omit=dev && node bot-server.js` is all you need. The process handles SIGINT/SIGTERM gracefully — it closes the HTTP server before exit so orchestrators can roll restarts cleanly.

---

## Adding a new platform

The whole point of the adapter split is that new platforms are cheap. Template:

```js
// adapters/yourplatform.js
const { handleQuery, humanizeError } = require("../core/handler");
const activity = require("../core/activity");

// Long-lived transports (WebSocket, long-poll, etc.) export start():
function start() {
  if (!process.env.YOURPLATFORM_TOKEN) {
    console.warn("[yourplatform] token not set — skipping.");
    return;
  }
  activity.registerAdapter("yourplatform", "connecting");

  const client = /* your SDK */;
  client.on("message", async (msg) => {
    try {
      const result = await handleQuery(msg.text, {
        adapter: "yourplatform",
        user: msg.from,
      });
      await client.reply(msg, result.report);
      if (result.pdfBuffer) await client.sendFile(msg, result.pdfBuffer, result.filename);
    } catch (err) {
      await client.reply(msg, `⚠️ ${err.userFacing || humanizeError(err.message)}`);
    }
  });

  client.connect().then(() => activity.setAdapterStatus("yourplatform", "connected"));
}

module.exports = { start };

// HTTP-webhook adapters export mount(app) instead — see adapters/teams.js
```

Then in [bot-server.js](bot-server.js):

```js
require("./adapters/yourplatform").start();
```

That's the full integration cost. Look at [adapters/telegram.js](adapters/telegram.js) for a long-poll example or [adapters/whatsapp.js](adapters/whatsapp.js) for an HTTP-webhook one.

---

## Web scraper (internal links)

`/api/internal-links` has a built-in scraper with two modes:

| Mode | How it works | Best for | Deployment |
|---|---|---|---|
| `fetch` *(default)* | HTTP + HTML parsing | Static sites, blogs, docs | Works everywhere |
| `browser` | Playwright + Chromium | SPAs, JS-rendered pages | Local / self-hosted |

Browser mode features: full JS rendering, auto-scroll for lazy content, modal dismissal, resource blocking for speed, anti-detection UA.

Install Chromium when first using browser mode:

```bash
npm run scraper:install
```

---

## Backend API routes

These are the Next.js API routes the bot backend (and frontend) call. They also work standalone — send `POST` JSON from anywhere.

| Route | Method | Purpose |
|---|---|---|
| `/api/keyword-ideas` | POST | Keyword ideas from DataForSEO |
| `/api/serp-search` | POST | Google SERP organic results |
| `/api/related-keywords` | POST | Related keyword variations |
| `/api/competitor-keywords` | POST | Keywords a competitor ranks for |
| `/api/ai-mode` | POST | Enriched search volume data |
| `/api/internal-links` | POST | Scrape internal links |
| `/api/chat` | POST | AI agent orchestrator (what the bot calls) |
| `/api/export-pdf` | POST | Render the styled PDF for a report |

All return structured JSON; see each route's handler in [frontend/app/api/](frontend/app/api/) for the exact shape.

---

## Tech stack

- **Framework**: Next.js 14 (App Router), Node 20+
- **Language**: TypeScript (frontend), JavaScript (bot server)
- **Styling**: Tailwind CSS
- **Data**: DataForSEO
- **Scraping**: built-in fetch + optional Playwright
- **AI**: OpenAI / Gemini / Claude (user's choice)
- **Bot SDKs**: `@slack/socket-mode`, `@slack/web-api`, `discord.js`, `node-telegram-bot-api`, `botbuilder`, `nodemailer`
- **HTTP**: `express`, `cors`
- **Deploy**: Vercel (frontend) + Docker / any Node host (bot server)

---

## Contributing

Contributions welcome — especially new platform adapters, better error messages, or observability upgrades.

1. Fork and clone.
2. `npm install` at the repo root and inside `frontend/`.
3. Run both sides: `npm run dev --prefix frontend` + `npm run dev`.
4. Make your change. The handler in [core/handler.js](core/handler.js) is the only place SEO logic should live — adapters are thin.
5. Add/update docs in this README or [BOT_PLATFORMS.md](BOT_PLATFORMS.md).
6. Open a PR.

### Project layout

```
seo-keyword-agent/
├── core/                    # shared, platform-agnostic modules
│   ├── handler.js           # query → report + PDF
│   ├── activity.js          # in-memory ring + JSONL log
│   ├── auth.js              # API key middleware
│   └── rateLimit.js         # sliding-window limiter
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

MIT — see [LICENSE](./LICENSE). Use it, fork it, ship it, sell services on top of it.

---

> Built because good SEO research tools shouldn't be a $200/mo SaaS subscription and good chat bots shouldn't be locked to a single platform.
