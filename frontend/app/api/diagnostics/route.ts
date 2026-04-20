import { NextResponse } from "next/server";

// GET /api/diagnostics — probes each provider and each feature so you can see
// exactly which endpoints your credentials can reach. Use this to verify your
// DataForSEO / SEMrush / Ahrefs subscriptions regardless of plan name.

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

interface ProbeResult {
  feature: string;
  endpoint: string;
  ok: boolean;
  status_code: number | null;
  message: string;
  activation_url?: string | null;
}

function dfsAuth(): string | null {
  const u = process.env.DATAFORSEO_USERNAME;
  const p = process.env.DATAFORSEO_PASSWORD;
  if (!u || !p) return null;
  return `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
}

function extractActivationUrl(msg: string): string | null {
  const m = msg.match(/https?:\/\/[^\s]+/);
  return m?.[0] ?? null;
}

async function dfsProbe(
  feature: string,
  endpoint: string,
  body: object
): Promise<ProbeResult> {
  const auth = dfsAuth();
  if (!auth) {
    return {
      feature,
      endpoint,
      ok: false,
      status_code: null,
      message: "Credentials missing in .env",
    };
  }
  try {
    const res = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify([body]),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    const task = (json as { tasks?: Array<Record<string, unknown>> }).tasks?.[0];
    const code = Number(task?.status_code ?? json?.status_code ?? res.status);
    const msg = String(task?.status_message ?? json?.status_message ?? res.statusText ?? "");
    const ok = code === 20000;
    return {
      feature,
      endpoint,
      ok,
      status_code: code,
      message: ok ? "OK" : msg,
      activation_url: !ok ? extractActivationUrl(msg) : null,
    };
  } catch (err) {
    return {
      feature,
      endpoint,
      ok: false,
      status_code: null,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function dfsUserData(): Promise<{
  ok: boolean;
  accessible_apis?: string[];
  limits?: Record<string, unknown>;
  error?: string;
}> {
  const auth = dfsAuth();
  if (!auth) return { ok: false, error: "Credentials missing in .env" };
  try {
    const res = await fetch(`${DATAFORSEO_BASE}/appendix/user_data`, {
      headers: { Authorization: auth },
    });
    const json = await res.json();
    const task = json?.tasks?.[0];
    const code = Number(task?.status_code ?? json?.status_code ?? res.status);
    if (code !== 20000) {
      return { ok: false, error: String(task?.status_message ?? "unknown") };
    }
    const result = (task?.result as Array<Record<string, unknown>>)?.[0] ?? {};
    const priceDetails = result.price as Record<string, unknown> | undefined;
    const accessible = priceDetails ? Object.keys(priceDetails) : [];
    return {
      ok: true,
      accessible_apis: accessible,
      limits: {
        money: { total: result.money, used: result.used },
        rates: result.rates,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function semrushProbe(): Promise<ProbeResult[]> {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) {
    return [
      {
        feature: "semrush",
        endpoint: "*",
        ok: false,
        status_code: null,
        message: "SEMRUSH_API_KEY not set in .env",
      },
    ];
  }
  try {
    const res = await fetch(
      `https://api.semrush.com/?type=phrase_this&phrase=test&database=us&export_columns=Ph,Nq&key=${key}`
    );
    const text = await res.text();
    if (text.startsWith("ERROR")) {
      return [
        {
          feature: "SEMrush base access",
          endpoint: "api.semrush.com",
          ok: false,
          status_code: res.status,
          message: text,
        },
      ];
    }
    return [
      {
        feature: "SEMrush base access",
        endpoint: "api.semrush.com",
        ok: true,
        status_code: 200,
        message: "OK",
      },
    ];
  } catch (err) {
    return [
      {
        feature: "SEMrush base access",
        endpoint: "api.semrush.com",
        ok: false,
        status_code: null,
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

async function ahrefsProbe(): Promise<ProbeResult[]> {
  const token = process.env.AHREFS_API_TOKEN;
  if (!token) {
    return [
      {
        feature: "ahrefs",
        endpoint: "*",
        ok: false,
        status_code: null,
        message: "AHREFS_API_TOKEN not set in .env",
      },
    ];
  }
  try {
    const res = await fetch(
      `https://api.ahrefs.com/v3/subscription-info/limits-and-usage`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json().catch(() => ({}));
    return [
      {
        feature: "Ahrefs base access",
        endpoint: "api.ahrefs.com",
        ok: res.ok,
        status_code: res.status,
        message: res.ok
          ? `OK (units used: ${JSON.stringify(json).slice(0, 200)})`
          : JSON.stringify(json).slice(0, 400),
      },
    ];
  } catch (err) {
    return [
      {
        feature: "Ahrefs base access",
        endpoint: "api.ahrefs.com",
        ok: false,
        status_code: null,
        message: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

export async function GET() {
  const dfsUser = await dfsUserData();

  const dfsProbes = await Promise.all([
    dfsProbe("Keyword ideas (Google Ads)", "/keywords_data/google_ads/keywords_for_keywords/live", {
      keywords: ["coffee"],
      location_code: 2840,
      language_code: "en",
    }),
    dfsProbe("Keyword overview (Labs)", "/dataforseo_labs/google/keyword_overview/live", {
      keywords: ["coffee"],
      location_code: 2840,
      language_code: "en",
    }),
    dfsProbe("Related keywords (Labs)", "/dataforseo_labs/google/related_keywords/live", {
      keyword: "coffee",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    }),
    dfsProbe("Keyword suggestions / Magic (Labs)", "/dataforseo_labs/google/keyword_suggestions/live", {
      keyword: "coffee",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    }),
    dfsProbe("Ranked keywords (Labs)", "/dataforseo_labs/google/ranked_keywords/live", {
      target: "example.com",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    }),
    dfsProbe("Domain rank overview (Labs)", "/dataforseo_labs/google/domain_rank_overview/live", {
      target: "example.com",
      location_code: 2840,
      language_code: "en",
    }),
    dfsProbe("Relevant pages (Labs)", "/dataforseo_labs/google/relevant_pages/live", {
      target: "example.com",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    }),
    dfsProbe("Domain intersection (Labs)", "/dataforseo_labs/google/domain_intersection/live", {
      target1: "example.com",
      target2: "example.org",
      location_code: 2840,
      language_code: "en",
      limit: 1,
    }),
    dfsProbe("Historical rank overview (Labs)", "/dataforseo_labs/google/historical_rank_overview/live", {
      target: "example.com",
      location_code: 2840,
      language_code: "en",
    }),
    dfsProbe("SERP organic (live)", "/serp/google/organic/live/advanced", {
      keyword: "coffee",
      location_code: 2840,
      language_code: "en",
      calculate_rectangles: false,
    }),
    dfsProbe("Backlinks — links", "/backlinks/backlinks/live", {
      target: "example.com",
      limit: 1,
      mode: "as_is",
    }),
    dfsProbe("Backlinks — referring domains", "/backlinks/referring_domains/live", {
      target: "example.com",
      limit: 1,
    }),
    dfsProbe("Backlinks — bulk spam score", "/backlinks/bulk_spam_score/live", {
      targets: ["example.com"],
    }),
    dfsProbe("On-page — instant pages", "/on_page/instant_pages", {
      url: "https://example.com",
      enable_javascript: false,
      enable_browser_rendering: false,
    }),
  ]);

  const semrush = await semrushProbe();
  const ahrefs = await ahrefsProbe();

  const summary = {
    dataforseo: {
      credentials_present: Boolean(process.env.DATAFORSEO_USERNAME),
      user: dfsUser,
      passed: dfsProbes.filter((p) => p.ok).length,
      failed: dfsProbes.filter((p) => !p.ok).length,
      needs_activation: dfsProbes
        .filter((p) => p.activation_url)
        .map((p) => ({
          feature: p.feature,
          activation_url: p.activation_url,
        })),
      probes: dfsProbes,
    },
    semrush: {
      credentials_present: Boolean(process.env.SEMRUSH_API_KEY),
      probes: semrush,
    },
    ahrefs: {
      credentials_present: Boolean(process.env.AHREFS_API_TOKEN),
      probes: ahrefs,
    },
  };

  return NextResponse.json({ success: true, summary });
}
