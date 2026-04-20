import { NextRequest, NextResponse } from "next/server";

// Parses raw access-log content (NCSA/Combined or JSON-per-line) and reports bot activity,
// status-code distribution, and most-crawled URLs. No external API calls.

const COMBINED_LOG_REGEX =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d+) (\d+|-) "([^"]*)" "([^"]*)"/;

const BOT_SIGNATURES: Array<{ name: string; match: RegExp }> = [
  { name: "Googlebot", match: /Googlebot/i },
  { name: "Bingbot", match: /bingbot/i },
  { name: "YandexBot", match: /YandexBot/i },
  { name: "Baiduspider", match: /Baiduspider/i },
  { name: "DuckDuckBot", match: /DuckDuckBot/i },
  { name: "AhrefsBot", match: /AhrefsBot/i },
  { name: "SemrushBot", match: /SemrushBot/i },
  { name: "MJ12bot", match: /MJ12bot/i },
  { name: "Other Bot", match: /bot|crawler|spider/i },
];

function classifyBot(ua: string): string | null {
  for (const sig of BOT_SIGNATURES) {
    if (sig.match.test(ua)) return sig.name;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { logs, format = "combined" } = await req.json();
    if (!logs || typeof logs !== "string") {
      return NextResponse.json(
        {
          success: false,
          error:
            "logs (string of log lines) is required. Send raw access-log content in the request body.",
        },
        { status: 400 }
      );
    }

    const lines = logs.split(/\r?\n/).filter(Boolean);
    const botCounts = new Map<string, number>();
    const statusCounts = new Map<number, number>();
    const urlCounts = new Map<string, number>();
    const perBotUrls = new Map<string, Map<string, number>>();
    let totalRequests = 0;
    let botRequests = 0;

    for (const line of lines) {
      let path = "", status = 0, ua = "";
      if (format === "json") {
        try {
          const obj = JSON.parse(line);
          path = String(obj.url ?? obj.path ?? "");
          status = Number(obj.status ?? obj.status_code ?? 0);
          ua = String(obj.user_agent ?? obj.useragent ?? obj["user-agent"] ?? "");
        } catch {
          continue;
        }
      } else {
        const m = line.match(COMBINED_LOG_REGEX);
        if (!m) continue;
        path = m[4];
        status = Number(m[6]);
        ua = m[9];
      }

      totalRequests++;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      urlCounts.set(path, (urlCounts.get(path) ?? 0) + 1);

      const bot = classifyBot(ua);
      if (bot) {
        botRequests++;
        botCounts.set(bot, (botCounts.get(bot) ?? 0) + 1);
        if (!perBotUrls.has(bot)) perBotUrls.set(bot, new Map());
        const bucket = perBotUrls.get(bot)!;
        bucket.set(path, (bucket.get(path) ?? 0) + 1);
      }
    }

    const topUrls = Array.from(urlCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, hits]) => ({ url, hits }));

    const bots = Array.from(botCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, hits]) => {
        const urls = Array.from(perBotUrls.get(name)?.entries() ?? [])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([url, count]) => ({ url, count }));
        return { name, hits, top_urls: urls };
      });

    const statusBreakdown = Array.from(statusCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    return NextResponse.json({
      success: true,
      data: {
        total_requests: totalRequests,
        bot_requests: botRequests,
        human_requests: totalRequests - botRequests,
        bot_share_pct: totalRequests
          ? Math.round((botRequests / totalRequests) * 10000) / 100
          : 0,
        bots,
        status_breakdown: statusBreakdown,
        top_urls: topUrls,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
