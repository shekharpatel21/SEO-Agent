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
} from "../types";
import { toAhrefsCountry } from "../locations";

const AHREFS_BASE = "https://api.ahrefs.com/v3";

function getToken(): string {
  const token = process.env.AHREFS_API_TOKEN;
  if (!token) {
    throw new Error(
      "Ahrefs credentials missing. Set AHREFS_API_TOKEN in .env.local"
    );
  }
  return token;
}

async function ahrefsGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    qs.set(k, String(v));
  }

  const res = await fetch(`${AHREFS_BASE}${path}?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Ahrefs error: ${res.status} ${res.statusText} — ${text}`
    );
  }
  return res.json() as Promise<T>;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function mapKeywordRow(row: Record<string, unknown>): NormalizedKeyword {
  return {
    keyword: str(row.keyword ?? row.term),
    search_volume: toNum(row.volume ?? row.search_volume),
    competition: toNum(row.traffic_potential ?? row.competition),
    cpc: toNum(row.cpc),
    difficulty: toNum(row.difficulty ?? row.keyword_difficulty ?? row.kd),
    intent: (row.intent as string) ?? null,
    monthly_searches: null,
    competition_index: toNum(row.competition),
  };
}

export const ahrefsProvider: SeoProvider = {
  name: "ahrefs",

  async keywordIdeas(keyword, opts) {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 50;
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/keywords-explorer/matching-terms",
      {
        keywords: keyword,
        country,
        limit,
        select: "keyword,volume,cpc,difficulty,intent,traffic_potential",
        match_mode: "terms",
      }
    );
    return (data.keywords ?? []).map(mapKeywordRow);
  },

  async relatedKeywords(keyword, opts) {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 30;
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/keywords-explorer/related-terms",
      {
        keywords: keyword,
        country,
        limit,
        select: "keyword,volume,cpc,difficulty,intent",
      }
    );
    return (data.keywords ?? []).map(mapKeywordRow);
  },

  async competitorKeywords(domain, opts) {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 50;
    const data = await ahrefsGet<{
      organic_keywords?: Record<string, unknown>[];
    }>("/site-explorer/organic-keywords", {
      target: domain,
      country,
      limit,
      mode: "domain",
      select: "keyword,volume,cpc,difficulty,intent,position,url",
    });
    return (data.organic_keywords ?? []).map(mapKeywordRow);
  },

  async serpSearch(keyword, opts) {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 20;
    const data = await ahrefsGet<{
      positions?: Record<string, unknown>[];
      serp_overview?: Record<string, unknown>[];
    }>("/serp-overview/serp-overview", {
      keyword,
      country,
      limit,
      select: "position,title,url,description,domain",
    });
    const items = data.positions ?? data.serp_overview ?? [];
    return items.map((row, idx) => ({
      rank: toNum(row.position) ?? idx + 1,
      title: str(row.title),
      url: str(row.url),
      description: str(row.description),
      domain: str(row.domain),
    })) as NormalizedSerpResult[];
  },

  async searchVolume(keywords, opts) {
    const country = toAhrefsCountry(opts?.location);
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/keywords-explorer/overview",
      {
        keywords: keywords.join(","),
        country,
        select: "keyword,volume,cpc,difficulty,intent",
      }
    );
    return (data.keywords ?? []).map(mapKeywordRow);
  },

  async keywordOverview(keyword, opts) {
    const country = toAhrefsCountry(opts?.location);
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/keywords-explorer/overview",
      {
        keywords: keyword,
        country,
        select: "keyword,volume,cpc,difficulty,intent,traffic_potential",
      }
    );
    const row = (data.keywords ?? [])[0];
    return row ? mapKeywordRow(row) : null;
  },

  async keywordMagic(keyword, opts) {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/keywords-explorer/matching-terms",
      {
        keywords: keyword,
        country,
        limit,
        select: "keyword,volume,cpc,difficulty,intent,traffic_potential",
        match_mode: "terms",
      }
    );
    return (data.keywords ?? []).map(mapKeywordRow);
  },

  async keywordStrategy(keyword, opts) {
    const all = await this.keywordMagic(keyword, { ...opts, limit: opts?.limit ?? 80 });
    const stop = new Set(["the", "a", "an", "of", "for", "in", "to", "and", "on", "with"]);
    const clusters = new Map<string, NormalizedKeyword[]>();
    for (const kw of all) {
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
    const all = await this.keywordMagic(keyword, { ...opts, limit: opts?.limit ?? 50 });
    const groups = new Map<string, NormalizedKeyword[]>();
    for (const kw of all) {
      const topic = kw.keyword.split(/\s+/).slice(0, 2).join(" ") || "general";
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic)!.push(kw);
    }
    return Array.from(groups.entries()).map(([topic, keywords]) => ({ topic, keywords }));
  },

  async domainOverview(domain, opts): Promise<NormalizedDomainOverview> {
    const country = toAhrefsCountry(opts?.location);
    const data = await ahrefsGet<Record<string, unknown>>(
      "/site-explorer/overview",
      { target: domain, country, mode: "domain" }
    );
    const metrics = (data.metrics as Record<string, unknown>) || data;
    const organic = (metrics.organic as Record<string, unknown>) || {};
    const paid = (metrics.paid as Record<string, unknown>) || {};
    return {
      domain,
      organic_keywords: toNum(organic.keywords ?? metrics.organic_keywords),
      organic_traffic: toNum(organic.traffic ?? metrics.organic_traffic),
      organic_cost: toNum(organic.traffic_value ?? metrics.traffic_value),
      paid_keywords: toNum(paid.keywords ?? metrics.paid_keywords),
      paid_traffic: toNum(paid.traffic ?? metrics.paid_traffic),
      paid_cost: toNum(paid.traffic_value),
      rank: toNum(metrics.ahrefs_rank ?? metrics.domain_rating),
      backlinks: toNum(metrics.backlinks),
      referring_domains: toNum(metrics.referring_domains),
    };
  },

  async organicRankings(domain, opts): Promise<NormalizedRankedKeyword[]> {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ organic_keywords?: Record<string, unknown>[] }>(
      "/site-explorer/organic-keywords",
      {
        target: domain,
        country,
        limit,
        mode: "domain",
        select: "keyword,volume,cpc,difficulty,intent,position,url,traffic",
      }
    );
    return (data.organic_keywords ?? []).map((row) => ({
      ...mapKeywordRow(row),
      position: toNum(row.position),
      url: str(row.url) || null,
      traffic: toNum(row.traffic),
      traffic_cost: toNum(row.traffic_value),
    })) as NormalizedRankedKeyword[];
  },

  async topPages(domain, opts): Promise<NormalizedTopPage[]> {
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 50;
    const data = await ahrefsGet<{ pages?: Record<string, unknown>[] }>(
      "/site-explorer/top-pages",
      {
        target: domain,
        country,
        limit,
        mode: "domain",
        select: "url,traffic,keywords,top_keyword,top_keyword_position",
      }
    );
    return (data.pages ?? []).map((row) => ({
      url: str(row.url),
      traffic: toNum(row.traffic),
      keywords_count: toNum(row.keywords),
      top_keyword: (row.top_keyword as string) ?? null,
      top_position: toNum(row.top_keyword_position),
    })) as NormalizedTopPage[];
  },

  async compareDomains(domains, opts): Promise<NormalizedDomainIntersection[]> {
    if (domains.length < 2) return [];
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/site-explorer/competitors-intersection",
      {
        targets: domains.join(","),
        country,
        limit,
        select: "keyword,volume,cpc,difficulty,positions",
      }
    );
    return (data.keywords ?? []).map((row) => {
      const positions: Record<string, number | null> = {};
      const posMap = (row.positions as Record<string, unknown>) || {};
      for (const d of domains) positions[d] = toNum(posMap[d]);
      return {
        keyword: str(row.keyword),
        search_volume: toNum(row.volume),
        cpc: toNum(row.cpc),
        difficulty: toNum(row.difficulty),
        positions,
      } as NormalizedDomainIntersection;
    });
  },

  async keywordGap(seed, competitors, opts): Promise<NormalizedDomainIntersection[]> {
    if (!competitors.length) return [];
    const country = toAhrefsCountry(opts?.location);
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ keywords?: Record<string, unknown>[] }>(
      "/site-explorer/content-gap",
      {
        target: seed,
        competitors: competitors.join(","),
        country,
        limit,
        select: "keyword,volume,cpc,difficulty,positions",
      }
    );
    return (data.keywords ?? []).map((row) => {
      const positions: Record<string, number | null> = { [seed]: null };
      const posMap = (row.positions as Record<string, unknown>) || {};
      for (const c of competitors) positions[c] = toNum(posMap[c]);
      return {
        keyword: str(row.keyword),
        search_volume: toNum(row.volume),
        cpc: toNum(row.cpc),
        difficulty: toNum(row.difficulty),
        positions,
      } as NormalizedDomainIntersection;
    });
  },

  async backlinks(target, opts): Promise<NormalizedBacklink[]> {
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ backlinks?: Record<string, unknown>[] }>(
      "/site-explorer/all-backlinks",
      {
        target,
        limit,
        mode: target.includes("/") ? "exact" : "domain",
        select:
          "url_from,domain_from,url_from_title,url_to,anchor,is_dofollow,first_seen,last_visited,domain_rating,url_rating,external_links,links_internal",
      }
    );
    return (data.backlinks ?? []).map((row) => ({
      source_url: str(row.url_from),
      source_domain: str(row.domain_from),
      source_title: (row.url_from_title as string) ?? null,
      target_url: str(row.url_to),
      anchor: (row.anchor as string) ?? null,
      dofollow: (row.is_dofollow as boolean) ?? null,
      first_seen: (row.first_seen as string) ?? null,
      last_seen: (row.last_visited as string) ?? null,
      rank: toNum(row.url_rating ?? row.domain_rating),
      domain_authority: toNum(row.domain_rating),
      external_links: toNum(row.external_links),
      internal_links: toNum(row.links_internal),
    })) as NormalizedBacklink[];
  },

  async referringDomains(target, opts): Promise<NormalizedReferringDomain[]> {
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ referring_domains?: Record<string, unknown>[] }>(
      "/site-explorer/refdomains",
      {
        target,
        limit,
        mode: target.includes("/") ? "exact" : "domain",
        select:
          "domain,backlinks,domain_rating,first_seen,dofollow_backlinks",
      }
    );
    return (data.referring_domains ?? []).map((row) => ({
      domain: str(row.domain),
      backlinks: toNum(row.backlinks),
      rank: toNum(row.domain_rating),
      first_seen: (row.first_seen as string) ?? null,
      dofollow_backlinks: toNum(row.dofollow_backlinks),
    })) as NormalizedReferringDomain[];
  },

  async backlinkGap(seed, competitors, opts): Promise<NormalizedReferringDomain[]> {
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ referring_domains?: Record<string, unknown>[] }>(
      "/site-explorer/link-intersect",
      {
        target: seed,
        competitors: competitors.join(","),
        limit,
        select: "domain,backlinks,domain_rating,first_seen,dofollow_backlinks",
      }
    );
    return (data.referring_domains ?? []).map((row) => ({
      domain: str(row.domain),
      backlinks: toNum(row.backlinks),
      rank: toNum(row.domain_rating),
      first_seen: (row.first_seen as string) ?? null,
      dofollow_backlinks: toNum(row.dofollow_backlinks),
    })) as NormalizedReferringDomain[];
  },

  async backlinkAudit(target, opts): Promise<NormalizedBacklinkAuditItem[]> {
    const limit = opts?.limit ?? 100;
    const data = await ahrefsGet<{ backlinks?: Record<string, unknown>[] }>(
      "/site-explorer/all-backlinks",
      {
        target,
        limit,
        mode: target.includes("/") ? "exact" : "domain",
        select:
          "url_from,domain_from,domain_rating,page_rating,external_links",
      }
    );
    return (data.backlinks ?? []).map((row) => {
      const dr = toNum(row.domain_rating) ?? 0;
      const spam = dr < 15 ? 80 : dr < 30 ? 50 : dr < 50 ? 25 : 5;
      const externals = toNum(row.external_links) ?? 0;
      return {
        source_url: str(row.url_from),
        source_domain: str(row.domain_from),
        spam_score: spam,
        toxic_score: spam,
        reason:
          spam > 50
            ? "Low authority source"
            : externals > 200
              ? "Excessive outbound links"
              : null,
      } as NormalizedBacklinkAuditItem;
    });
  },

  async siteAudit(target, _opts): Promise<NormalizedSiteAuditSummary> {
    const data = await ahrefsGet<Record<string, unknown>>(
      "/site-audit/overview",
      { target, mode: "domain" }
    ).catch(() => ({} as Record<string, unknown>));
    const issues = (data.issues as Record<string, unknown>) || {};
    return {
      target,
      pages_crawled: toNum(data.pages_crawled ?? data.crawled_pages),
      issues: {
        critical: toNum(issues.errors ?? issues.critical),
        warnings: toNum(issues.warnings),
        notices: toNum(issues.notices),
      },
      top_issues: Array.isArray(issues.top)
        ? (issues.top as Array<Record<string, unknown>>).slice(0, 10).map((i) => ({
            code: str(i.code ?? i.name),
            title: str(i.title ?? i.name),
            count: toNum(i.count) ?? 0,
          }))
        : [],
    };
  },

  async onPageSeoCheck(url, _opts): Promise<NormalizedOnPageCheck> {
    const data = await ahrefsGet<Record<string, unknown>>(
      "/site-audit/page",
      { url }
    ).catch(() => ({} as Record<string, unknown>));
    const meta = (data.meta as Record<string, unknown>) || {};
    return {
      url,
      status_code: toNum(data.status_code),
      title: (meta.title as string) ?? null,
      meta_description: (meta.description as string) ?? null,
      word_count: toNum(data.word_count),
      h1: Array.isArray(meta.h1) ? (meta.h1 as string[]) : [],
      checks: (data.checks as Record<string, boolean>) || {},
      load_time_ms: toNum(data.load_time_ms),
      mobile_friendly: (data.mobile_friendly as boolean) ?? null,
    };
  },

  async positionTracking(domain, keywords, opts): Promise<NormalizedPositionTrackingRow[]> {
    const country = toAhrefsCountry(opts?.location);
    const data = await ahrefsGet<{ positions?: Record<string, unknown>[] }>(
      "/rank-tracker/overview",
      {
        target: domain,
        country,
        keywords: keywords.join(","),
        select: "keyword,position,previous_position,url,volume,traffic",
      }
    ).catch(() => ({ positions: [] as Record<string, unknown>[] }));
    return (data.positions ?? []).map((row) => {
      const pos = toNum(row.position);
      const prev = toNum(row.previous_position);
      return {
        keyword: str(row.keyword),
        position: pos,
        previous_position: prev,
        change: pos !== null && prev !== null ? prev - pos : null,
        url: str(row.url) || null,
        search_volume: toNum(row.volume),
        traffic: toNum(row.traffic),
      } as NormalizedPositionTrackingRow;
    });
  },

  async organicTrafficInsights(domain, opts): Promise<NormalizedTrafficInsight[]> {
    const country = toAhrefsCountry(opts?.location);
    const data = await ahrefsGet<{ history?: Record<string, unknown>[] }>(
      "/site-explorer/metrics-history",
      {
        target: domain,
        country,
        mode: "domain",
        select: "date,organic_traffic,organic_keywords",
      }
    ).catch(() => ({ history: [] as Record<string, unknown>[] }));
    return (data.history ?? []).map((row) => {
      const d = str(row.date);
      return {
        month: toNum(d.slice(5, 7)) ?? 0,
        year: toNum(d.slice(0, 4)) ?? 0,
        organic_traffic: toNum(row.organic_traffic),
        organic_keywords: toNum(row.organic_keywords),
      } as NormalizedTrafficInsight;
    });
  },

  async sensor(category, _opts): Promise<NormalizedSensorRow[]> {
    return [
      {
        category: category ?? "all",
        volatility: null,
        date: new Date().toISOString().slice(0, 10),
      },
    ];
  },

  async domainRank(domain, opts) {
    const overview = await this.domainOverview(domain, opts);
    return { domain, rank: overview.rank, score: overview.organic_traffic };
  },

  async linkProspects(seed, opts): Promise<NormalizedLinkProspect[]> {
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
