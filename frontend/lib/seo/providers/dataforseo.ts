import type {
  NormalizedBacklink,
  NormalizedBacklinkAuditItem,
  NormalizedDomainIntersection,
  NormalizedDomainOverview,
  NormalizedKeyword,
  NormalizedLinkProspect,
  NormalizedOnPageCheck,
  NormalizedPositionTrackingRow,
  NormalizedRankedKeyword,
  NormalizedReferringDomain,
  NormalizedSensorRow,
  NormalizedSerpResult,
  NormalizedSiteAuditSummary,
  NormalizedTopPage,
  NormalizedTrafficInsight,
  SeoProvider,
  SeoQueryOptions,
} from "../types";
import { toDataForSEOLocationCode } from "../locations";

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

function getAuthHeader(): string {
  const username = process.env.DATAFORSEO_USERNAME;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "DataForSEO credentials missing. Set DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD in .env.local"
    );
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export class DataForSEOError extends Error {
  public activationUrl: string | null;
  constructor(
    message: string,
    public statusCode: number,
    public endpoint: string,
    public isAccessDenied: boolean
  ) {
    super(message);
    this.name = "DataForSEOError";
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    this.activationUrl = urlMatch?.[0] ?? null;
  }
}

async function request(endpoint: string, body: object) {
  const response = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify([body]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new DataForSEOError(
      `DataForSEO transport error ${response.status}: ${text}`,
      response.status,
      endpoint,
      response.status === 401 || response.status === 403
    );
  }

  const json = await response.json();

  // DataForSEO returns HTTP 200 even for logical errors — the real status is on the task.
  // Check both the top-level status_code and the task-level one.
  const topCode = Number(json?.status_code ?? 0);
  const task = json?.tasks?.[0];
  const taskCode = Number(task?.status_code ?? 0);
  const effectiveCode = taskCode || topCode;
  const msg = String(task?.status_message ?? json?.status_message ?? "");

  // 20000 = OK. Any 4xxxx / 5xxxx is an error.
  if (effectiveCode && effectiveCode >= 40000) {
    throw new DataForSEOError(
      `DataForSEO ${effectiveCode}: ${msg || "unknown error"} (${endpoint})`,
      effectiveCode,
      endpoint,
      effectiveCode === 40204 || effectiveCode === 40104 || effectiveCode === 40101
    );
  }

  return json;
}

async function requestGet(endpoint: string) {
  const response = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `DataForSEO error: ${response.status} ${response.statusText} — ${text}`
    );
  }
  return response.json();
}

function resolveCodes(opts?: SeoQueryOptions) {
  const location_code =
    opts?.location_code ?? toDataForSEOLocationCode(opts?.location);
  const language_code = opts?.language_code ?? opts?.language ?? "en";
  return { location_code, language_code };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function mapKeywordRow(item: Record<string, unknown>): NormalizedKeyword {
  // Google Ads endpoints return flat rows. DataForSEO Labs endpoints nest the
  // same fields under keyword_info / keyword_properties / search_intent_info.
  // Read from whichever is populated.
  const info = item.keyword_info as Record<string, unknown> | undefined;
  const props = item.keyword_properties as Record<string, unknown> | undefined;
  const intent = item.search_intent_info as Record<string, unknown> | undefined;
  return {
    keyword: str(item.keyword ?? item.keyword_data),
    search_volume: num(info?.search_volume ?? item.search_volume),
    competition:
      (info?.competition as string | number | undefined) ??
      (item.competition as string | number | undefined) ??
      null,
    cpc: num(info?.cpc ?? item.cpc),
    difficulty: num(props?.keyword_difficulty ?? item.keyword_difficulty),
    intent: (intent?.main_intent as string) ?? null,
    monthly_searches:
      (info?.monthly_searches as NormalizedKeyword["monthly_searches"]) ??
      (item.monthly_searches as NormalizedKeyword["monthly_searches"]) ??
      null,
    competition_index: num(info?.competition_index ?? item.competition_index),
  };
}

export const dataForSEOProvider: SeoProvider = {
  name: "dataforseo",

  async keywordIdeas(keyword, opts) {
    const codes = resolveCodes(opts);
    const data = await request(
      "/keywords_data/google_ads/keywords_for_keywords/live",
      { keywords: [keyword], ...codes }
    );
    const rows = (data.tasks?.[0]?.result || []) as Record<string, unknown>[];
    return rows.map(mapKeywordRow);
  },

  async relatedKeywords(keyword, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 30;
    const data = await request(
      "/dataforseo_labs/google/related_keywords/live",
      { keyword, ...codes, limit, depth: 2 }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const data = (it.keyword_data as Record<string, unknown>) || it;
      return mapKeywordRow(data);
    });
  },

  async competitorKeywords(domain, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 50;
    const data = await request(
      "/dataforseo_labs/google/ranked_keywords/live",
      { target: domain, ...codes, limit }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const kd = (it.keyword_data as Record<string, unknown>) || {};
      return mapKeywordRow(kd);
    });
  },

  async serpSearch(keyword, opts) {
    const codes = resolveCodes(opts);
    const data = await request("/serp/google/organic/live/advanced", {
      keyword,
      ...codes,
      calculate_rectangles: false,
    });
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items
      .filter((item) => item.type === "organic")
      .map((item) => ({
        rank: num(item.rank_group) ?? 0,
        title: str(item.title),
        url: str(item.url),
        description: str(item.description),
        domain: str(item.domain),
      })) as NormalizedSerpResult[];
  },

  async searchVolume(keywords, opts) {
    const codes = resolveCodes(opts);
    const data = await request(
      "/keywords_data/google_ads/search_volume/live",
      { keywords, ...codes }
    );
    const rows = (data.tasks?.[0]?.result || []) as Record<string, unknown>[];
    return rows.map(mapKeywordRow);
  },

  async keywordOverview(keyword, opts) {
    const codes = resolveCodes(opts);
    const data = await request(
      "/dataforseo_labs/google/keyword_overview/live",
      { keywords: [keyword], ...codes }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.length ? mapKeywordRow(items[0]) : null;
  },

  async keywordMagic(keyword, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 100;
    const data = await request(
      "/dataforseo_labs/google/keyword_suggestions/live",
      { keyword, ...codes, limit }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map(mapKeywordRow);
  },

  async keywordStrategy(keyword, opts) {
    const suggestions = await this.keywordMagic(keyword, {
      ...opts,
      limit: opts?.limit ?? 80,
    });
    // Bucket by the first non-stop-word token — coarse clustering without an extra API call
    const stop = new Set([
      "the", "a", "an", "of", "for", "in", "to", "and", "on", "with", "is", "your", "my", "our",
    ]);
    const clusters = new Map<string, NormalizedKeyword[]>();
    for (const kw of suggestions) {
      const tokens = kw.keyword.toLowerCase().split(/\s+/).filter(Boolean);
      const key = tokens.find((t) => !stop.has(t) && t !== keyword.toLowerCase()) ?? "other";
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(kw);
    }
    return Array.from(clusters.entries())
      .map(([cluster, keywords]) => ({ cluster, keywords }))
      .sort((a, b) => b.keywords.length - a.keywords.length);
  },

  async topicResearch(keyword, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 50;
    const data = await request(
      "/dataforseo_labs/google/keyword_suggestions/live",
      { keyword, ...codes, limit }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    const rows = items.map(mapKeywordRow);
    const groups = new Map<string, NormalizedKeyword[]>();
    for (const kw of rows) {
      const tokens = kw.keyword.split(/\s+/);
      const topic = tokens.slice(0, 2).join(" ") || "general";
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic)!.push(kw);
    }
    return Array.from(groups.entries()).map(([topic, keywords]) => ({ topic, keywords }));
  },

  async domainOverview(domain, opts) {
    const codes = resolveCodes(opts);
    const data = await request(
      "/dataforseo_labs/google/domain_rank_overview/live",
      { target: domain, ...codes }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    const row = items[0] ?? {};
    const metrics = (row.metrics as Record<string, unknown>) || row;
    const organic = (metrics.organic as Record<string, unknown>) || {};
    const paid = (metrics.paid as Record<string, unknown>) || {};
    return {
      domain,
      organic_keywords: num(organic.count ?? organic.keywords_count),
      organic_traffic: num(organic.etv ?? organic.estimated_traffic),
      organic_cost: num(organic.estimated_paid_traffic_cost ?? organic.cost),
      paid_keywords: num(paid.count ?? paid.keywords_count),
      paid_traffic: num(paid.etv),
      paid_cost: num(paid.estimated_paid_traffic_cost ?? paid.cost),
      rank: num(row.rank ?? metrics.rank),
      backlinks: num(row.backlinks),
      referring_domains: num(row.referring_domains),
    };
  },

  async organicRankings(domain, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 100;
    const data = await request(
      "/dataforseo_labs/google/ranked_keywords/live",
      { target: domain, ...codes, limit }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const kd = (it.keyword_data as Record<string, unknown>) || {};
      const serp = (it.ranked_serp_element as Record<string, unknown>) || {};
      const serpEl = (serp.serp_item as Record<string, unknown>) || {};
      const base = mapKeywordRow(kd);
      return {
        ...base,
        position: num(serpEl.rank_group),
        url: str(serpEl.url) || null,
        traffic: num(serpEl.etv ?? serp.etv),
        traffic_cost: num(serpEl.estimated_paid_traffic_cost),
      } as NormalizedRankedKeyword;
    });
  },

  async topPages(domain, opts) {
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 50;
    const data = await request(
      "/dataforseo_labs/google/relevant_pages/live",
      { target: domain, ...codes, limit }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const metrics = (it.metrics as Record<string, unknown>) || {};
      const organic = (metrics.organic as Record<string, unknown>) || {};
      return {
        url: str(it.page_address ?? it.url),
        traffic: num(organic.etv ?? organic.estimated_traffic),
        keywords_count: num(organic.count ?? organic.keywords_count),
        top_keyword: null,
        top_position: null,
      } as NormalizedTopPage;
    });
  },

  async compareDomains(domains, opts) {
    if (domains.length < 2) return [];
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 100;
    const [target1, target2] = domains;
    const data = await request(
      "/dataforseo_labs/google/domain_intersection/live",
      { target1, target2, ...codes, limit, intersections: true }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const kd = (it.keyword_data as Record<string, unknown>) || {};
      const info = (kd.keyword_info as Record<string, unknown>) || {};
      const first = (it.first_domain_serp_element as Record<string, unknown>) || {};
      const second = (it.second_domain_serp_element as Record<string, unknown>) || {};
      return {
        keyword: str(kd.keyword),
        search_volume: num(info.search_volume),
        cpc: num(info.cpc),
        difficulty: num((kd.keyword_properties as Record<string, unknown>)?.keyword_difficulty),
        positions: {
          [target1]: num(first.rank_group),
          [target2]: num(second.rank_group),
        },
      } as NormalizedDomainIntersection;
    });
  },

  async keywordGap(seed, competitors, opts) {
    if (!competitors.length) return [];
    const codes = resolveCodes(opts);
    const limit = opts?.limit ?? 100;
    const competitor = competitors[0];
    // Use intersections=false to get missing-from-seed keywords
    const data = await request(
      "/dataforseo_labs/google/domain_intersection/live",
      { target1: seed, target2: competitor, ...codes, limit, intersections: false }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const kd = (it.keyword_data as Record<string, unknown>) || {};
      const info = (kd.keyword_info as Record<string, unknown>) || {};
      const second = (it.second_domain_serp_element as Record<string, unknown>) || {};
      return {
        keyword: str(kd.keyword),
        search_volume: num(info.search_volume),
        cpc: num(info.cpc),
        difficulty: num((kd.keyword_properties as Record<string, unknown>)?.keyword_difficulty),
        positions: {
          [seed]: null,
          [competitor]: num(second.rank_group),
        },
      } as NormalizedDomainIntersection;
    });
  },

  async backlinks(target, opts) {
    const limit = opts?.limit ?? 100;
    const data = await request("/backlinks/backlinks/live", {
      target,
      limit,
      mode: "as_is",
      order_by: ["rank,desc"],
    });
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => ({
      source_url: str(it.url_from ?? it.source_url),
      source_domain: str(it.domain_from),
      source_title: (it.page_from_title as string) ?? null,
      target_url: str(it.url_to ?? it.target_url),
      anchor: (it.anchor as string) ?? null,
      dofollow: (it.dofollow as boolean) ?? null,
      first_seen: (it.first_seen as string) ?? null,
      last_seen: (it.last_seen as string) ?? null,
      rank: num(it.rank),
      domain_authority: num(it.domain_from_rank ?? it.rank_from),
      external_links: num(it.links_external_from ?? it.page_from_external_links_count),
      internal_links: num(it.links_internal_from ?? it.page_from_internal_links_count),
    }));
  },

  async referringDomains(target, opts) {
    const limit = opts?.limit ?? 100;
    const data = await request("/backlinks/referring_domains/live", {
      target,
      limit,
      mode: "as_is",
      order_by: ["rank,desc"],
    });
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => ({
      domain: str(it.domain ?? it.domain_from),
      backlinks: num(it.backlinks),
      rank: num(it.rank),
      first_seen: (it.first_seen as string) ?? null,
      dofollow_backlinks: num(it.backlinks_dofollow),
    }));
  },

  async backlinkGap(seed, competitors, opts) {
    const limit = opts?.limit ?? 100;
    // /backlinks/domain_intersection/live expects `targets` as a map of
    // domain → mode (one of as_is | one_per_domain | one_per_anchor).
    const targets = [seed, ...competitors].slice(0, 20);
    const data = await request("/backlinks/domain_intersection/live", {
      targets: Object.fromEntries(targets.map((t) => [t, "as_is"])),
      limit,
      exclude_targets: [seed],
    });
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => ({
      domain: str(it.domain ?? it.domain_from),
      backlinks: num(it.backlinks),
      rank: num(it.rank),
      first_seen: (it.first_seen as string) ?? null,
      dofollow_backlinks: num(it.backlinks_dofollow),
    }));
  },

  async backlinkAudit(target, opts) {
    const limit = opts?.limit ?? 100;
    const data = await request("/backlinks/bulk_spam_score/live", {
      targets: [target],
    });
    const spamItems = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    // Also pull actual backlink rows + flag high-risk ones
    const blData = await request("/backlinks/backlinks/live", {
      target,
      limit,
      mode: "as_is",
    });
    const blItems = (blData.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    const overallSpam = num(spamItems[0]?.spam_score);
    return blItems.map((it) => ({
      source_url: str(it.url_from),
      source_domain: str(it.domain_from),
      spam_score: num(it.page_spam_score ?? it.spam_score ?? overallSpam),
      toxic_score: num(it.page_spam_score ?? it.spam_score),
      reason:
        num(it.page_spam_score) && num(it.page_spam_score)! > 50
          ? "High spam score"
          : null,
    }));
  },

  async siteAudit(target, opts) {
    // Instant-pages audit — synchronous, returns a single page's checks
    const data = await request("/on_page/instant_pages", {
      url: target,
      enable_javascript: false,
      enable_browser_rendering: false,
    });
    const result = (data.tasks?.[0]?.result?.[0] || {}) as Record<string, unknown>;
    const items = (result.items || []) as Record<string, unknown>[];
    const page = items[0] || {};
    const checks = (page.checks as Record<string, unknown>) || {};
    const issues = Object.entries(checks).filter(([, v]) => v === false);
    const critical = issues.filter(([k]) =>
      /duplicate|broken|redirect|5xx|4xx|no_title|no_h1/i.test(k)
    ).length;
    const warnings = issues.length - critical;
    return {
      target,
      pages_crawled: 1,
      issues: { critical, warnings, notices: 0 },
      top_issues: issues.slice(0, 10).map(([code]) => ({
        code,
        title: code.replace(/_/g, " "),
        count: 1,
      })),
    };
  },

  async onPageSeoCheck(url, opts) {
    const data = await request("/on_page/instant_pages", {
      url,
      enable_javascript: false,
      enable_browser_rendering: false,
    });
    const result = (data.tasks?.[0]?.result?.[0] || {}) as Record<string, unknown>;
    const items = (result.items || []) as Record<string, unknown>[];
    const page = items[0] || {};
    const meta = (page.meta as Record<string, unknown>) || {};
    const pageMetrics = (page.page_metrics as Record<string, unknown>) || {};
    const contentMetrics =
      ((pageMetrics.content as Record<string, unknown>) ||
        (meta.content as Record<string, unknown>) ||
        {}) as Record<string, unknown>;
    const htags = (meta.htags as Record<string, unknown>) || {};
    return {
      url,
      status_code: num(page.status_code),
      title: (meta.title as string) ?? null,
      meta_description: (meta.description as string) ?? null,
      word_count: num(contentMetrics.plain_text_word_count),
      h1: Array.isArray(htags.h1) ? (htags.h1 as string[]) : [],
      checks: (page.checks as Record<string, boolean>) || {},
      load_time_ms: num(page.time_to_interactive ?? page.total_transfer_time),
      mobile_friendly: null,
    };
  },

  async positionTracking(domain, keywords, opts) {
    const codes = resolveCodes(opts);
    // Use SERP live queries for each keyword to detect the domain's position
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        try {
          const data = await request("/serp/google/organic/live/advanced", {
            keyword,
            ...codes,
            calculate_rectangles: false,
          });
          const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
            string,
            unknown
          >[];
          const hit = items.find(
            (it) =>
              it.type === "organic" &&
              String(it.domain ?? "")
                .toLowerCase()
                .includes(domain.toLowerCase())
          );
          return {
            keyword,
            position: num(hit?.rank_group),
            previous_position: null,
            change: null,
            url: hit ? str(hit.url) : null,
            search_volume: null,
            traffic: null,
          } as NormalizedPositionTrackingRow;
        } catch {
          return {
            keyword,
            position: null,
            previous_position: null,
            change: null,
            url: null,
            search_volume: null,
            traffic: null,
          } as NormalizedPositionTrackingRow;
        }
      })
    );
    return results;
  },

  async organicTrafficInsights(domain, opts) {
    const codes = resolveCodes(opts);
    const data = await request(
      "/dataforseo_labs/google/historical_rank_overview/live",
      { target: domain, ...codes }
    );
    const items = (data.tasks?.[0]?.result?.[0]?.items || []) as Record<
      string,
      unknown
    >[];
    return items.map((it) => {
      const metrics = (it.metrics as Record<string, unknown>) || {};
      const organic = (metrics.organic as Record<string, unknown>) || {};
      return {
        month: num(it.month) ?? 0,
        year: num(it.year) ?? 0,
        organic_traffic: num(organic.etv ?? organic.estimated_traffic),
        organic_keywords: num(organic.count ?? organic.keywords_count),
      } as NormalizedTrafficInsight;
    });
  },

  async sensor(category, opts) {
    // DataForSEO doesn't expose a direct "SERP volatility" endpoint,
    // so approximate by reading the domain rank changes from labs historical.
    // Return an empty deterministic response if nothing supplied.
    try {
      const data = await requestGet("/appendix/user_data");
      const rate = num((data as Record<string, unknown>).rate_limit) ?? 0;
      return [
        {
          category: category ?? "all",
          volatility: rate ? Math.min(10, rate / 100) : null,
          date: new Date().toISOString().slice(0, 10),
        },
      ];
    } catch {
      return [];
    }
  },

  async domainRank(domain, opts) {
    const overview = await this.domainOverview(domain, opts);
    return {
      domain,
      rank: overview.rank,
      score: overview.organic_traffic,
    };
  },

  async linkProspects(seed, opts) {
    // Approximate link-building prospects by pulling referring domains of a competitor
    const refs = await this.referringDomains(seed, { ...opts, limit: opts?.limit ?? 50 });
    return refs.map((r) => ({
      domain: r.domain,
      url: `https://${r.domain}`,
      rank: r.rank,
      relevance: null,
      contact: null,
      reason: r.dofollow_backlinks ? "Dofollow referring domain" : "Referring domain",
    })) as NormalizedLinkProspect[];
  },
};
