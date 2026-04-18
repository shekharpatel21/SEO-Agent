# Multi-Platform Bot Backend

`bot-server.js` lets users of the SEO Keyword Agent ask questions from **any**
chat platform and get back the same AI-generated SEO report + PDF that the web
UI produces.

One process, many adapters. Each adapter only activates when its env vars are
set, so you can start with Slack only and add more platforms later without
touching the code.

## Supported platforms

| Platform     | Transport        | Credentials                                            |
| ------------ | ---------------- | ------------------------------------------------------ |
| Slack        | WebSocket (Socket Mode) | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`            |
| Discord      | WebSocket (Gateway)     | `DISCORD_BOT_TOKEN`                              |
| Telegram     | Long polling            | `TELEGRAM_BOT_TOKEN`                             |
| MS Teams     | HTTP webhook (Bot Framework) | `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`        |
| WhatsApp     | HTTP webhook (Twilio)   | `TWILIO_AUTH_TOKEN` (optional), `BOT_PUBLIC_URL` |
| Email        | Inbound webhook + SMTP  | `SMTP_HOST`, `SMTP_FROM`, ...                    |
| Web widget   | Embeddable HTML/iframe  | (none)                                           |
| Generic HTTP | `POST /api/message`     | (none, or `BOT_API_KEYS` to require auth)        |
| CLI          | Local REPL              | `BOT_CLI_ENABLED=1`                              |

The **generic HTTP adapter** means any platform not listed above —
Mattermost, Zulip, Rocket.Chat, Zapier, n8n, Make.com, custom apps —
can integrate by POST-ing `{ "query": "..." }` to `/api/message`.

## Architecture

```
+-----------+   +-------------+   +---------------+   +-----------+
|  Slack    |   |  Discord    |   |  Telegram     |   |  Teams    |
+-----+-----+   +------+------+   +-------+-------+   +-----+-----+
      |                |                   |                |
      +--------+-------+--------+---+------+--------+-------+
               |                    |                       |
          +----v----+          +----v-----+          +------v------+
          | slack.js|          | discord  |          | teams.js    |
          +----+----+          +----+-----+          +------+------+
               |                    |                       |
               +----------+---------+-----------+-----------+
                          |                     |
                          v                     v
                  +-------+---------+  +--------+--------+
                  | core/handler.js |  | core/activity.js|
                  +-------+---------+  +-----------------+
                          |
                          v
                  Next.js /api/chat + /api/export-pdf
```

`core/handler.js` does the real work — every adapter calls `handleQuery(q)`
and formats the result for its platform. Add a new platform? Write one file
under `adapters/`, mount it in `bot-server.js`, done.

## Run

```bash
# Install (once)
npm install

# Start the Next.js app (keyword research API)
npm run dev --prefix frontend

# In another terminal: start the bot server
npm start
```

The server auto-enables only the adapters whose env vars are set, and
prints the skipped ones to the console so you know where you stand.

## Endpoints

| Route                        | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `POST /api/message`          | Generic query entry for any platform                      |
| `POST /api/messages`         | Microsoft Teams Bot Framework endpoint                    |
| `POST /api/webhook/whatsapp` | Twilio WhatsApp inbound                                   |
| `POST /api/webhook/email`    | SendGrid/Mailgun inbound-email webhook                    |
| `GET  /widget/`              | Standalone embeddable chat widget                         |
| `GET  /widget.js`            | One-line embed script (adds a floating "Ask SEO" button)  |
| `GET  /admin`                | Read-only dashboard (counters, adapter status, recent log)|
| `GET  /health`               | JSON status probe for uptime monitoring                   |
| `GET  /api/activity`         | Recent query log entries (requires API key if set)        |

## Embedding the widget on any site

```html
<script src="https://your-bot-host/widget.js" defer></script>
```

That's it. A floating **Ask SEO** button appears bottom-right and opens the
widget in an iframe. Or link directly to `/widget/` for a full-page experience.

## Security — public deployments

Set `BOT_API_KEYS=secret1,secret2` to require an API key on
`/api/message` and `/api/activity`. Clients pass it as:

- `Authorization: Bearer <key>` *(recommended)*
- `X-API-Key: <key>`
- `?api_key=<key>` *(for the widget embed)*

Rate limiting is on by default (30 req/min per key or IP); tune via
`BOT_RATE_LIMIT_MAX` / `BOT_RATE_LIMIT_WINDOW_SEC`.

## Adding a new platform

1. Create `adapters/foo.js` exporting `start()` (for long-lived transports)
   or `mount(app)` (for HTTP webhooks).
2. Call `handleQuery(query, { adapter: "foo", user: "..." })` from your
   message handler.
3. Call `activity.registerAdapter("foo", "ready")` so it appears on `/admin`.
4. Wire it into [bot-server.js](bot-server.js).

That's the full integration cost — roughly 30–80 lines per adapter.
