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
import { toSemrushDb } from "../locations";

const SEMRUSH_BASE = "https://api.semrush.com/";
const SEMRUSH_ANALYTICS = "https://api.semrush.com/analytics/v1/";

function getKey(): string {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) {
    throw new Error(
      "SEMrush credentials missing. Set SEMRUSH_API_KEY in .env.local"
    );
  }
  return key;
}

async function semrushRequest(
  type: string,
  params: Record<string, string | number | undefined>,
  base = SEMRUSH_BASE
): Promise<Record<string, string>[]> {
  const qs = new URLSearchParams({
    type,
    key: getKey(),
    export_columns: String(params.export_columns ?? ""),
  });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || k === "export_columns") continue;
    qs.set(k, String(v));
  }

  const res = await fetch(`${base}?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `SEMrush error: ${res.status} ${res.statusText} — ${text}`
    );
  }

  const text = await res.text();
  if (text.startsWith("ERROR")) {
    if (text.includes("NOTHING FOUND")) return [];
    throw new Error(`SEMrush error: ${text}`);
  }

  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapOverviewRow(row: Record<string, string>): NormalizedKeyword {
  return {
    keyword: row["Keyword"] ?? row["Ph"] ?? "",
    search_volume: num(row["Search Volume"] ?? row["Nq"]),
    competition: num(row["Competition"] ?? row["Co"]),
    cpc: num(row["CPC"] ?? row["Cp"]),
    difficulty: num(row["Keyword Difficulty Index"] ?? row["Kd"]),
    intent: row["Intent"] ?? null,
    monthly_searches: null,
    competition_index: num(row["Competition"] ?? row["Co"]),
  };
}

export const semrushProvider: SeoProvider = {
  name: "semrush",

  async keywordIdeas(keyword, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 50;
    const rows = await semrushRequest("phrase_related", {
      phrase: keyword,
      database,
      display_limit: limit,
      export_columns: "Ph,Nq,Cp,Co,Nr,Td",
    });
    return rows.map(mapOverviewRow);
  },

  async relatedKeywords(keyword, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 30;
    const rows = await semrushRequest("phrase_related", {
      phrase: keyword,
      database,
      display_limit: limit,
      export_columns: "Ph,Nq,Cp,Co,Nr,Td",
    });
    return rows.map(mapOverviewRow);
  },

  async competitorKeywords(domain, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 50;
    const rows = await semrushRequest("domain_organic", {
      domain,
      database,
      display_limit: limit,
      export_columns: "Ph,Po,Nq,Cp,Co,Nr,Td,Ur",
    });
    return rows.map(mapOverviewRow);
  },

  async serpSearch(keyword, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 20;
    const rows = await semrushRequest("phrase_organic", {
      phrase: keyword,
      database,
      display_limit: limit,
      export_columns: "Dn,Ur",
    });
    return rows.map((row, idx) => ({
      rank: idx + 1,
      title: "",
      url: row["Url"] ?? row["Ur"] ?? "",
      description: "",
      domain: row["Domain"] ?? row["Dn"] ?? "",
    })) as NormalizedSerpResult[];
  },

  async searchVolume(keywords, opts) {
    const database = toSemrushDb(opts?.location);
    const results = await Promise.all(
      keywords.map(async (phrase) => {
        const rows = await semrushRequest("phrase_this", {
          phrase,
          database,
          export_columns: "Ph,Nq,Cp,Co,Nr,Td",
        });
        return rows[0] ? mapOverviewRow(rows[0]) : null;
      })
    );
    return results.filter((r): r is NormalizedKeyword => r !== null);
  },

  async keywordOverview(keyword, opts) {
    const database = toSemrushDb(opts?.location);
    const rows = await semrushRequest("phrase_this", {
      phrase: keyword,
      database,
      export_columns: "Ph,Nq,Cp,Co,Nr,Td,Kd",
    });
    return rows[0] ? mapOverviewRow(rows[0]) : null;
  },

  async keywordMagic(keyword, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest("phrase_fullsearch", {
      phrase: keyword,
      database,
      display_limit: limit,
      export_columns: "Ph,Nq,Cp,Co,Nr,Td,Kd",
    });
    return rows.map(mapOverviewRow);
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

  async domainOverview(domain, opts) {
    const database = toSemrushDb(opts?.location);
    const rows = await semrushRequest("domain_ranks", {
      domain,
      database,
      export_columns: "Dn,Rk,Or,Ot,Oc,Ad,At,Ac",
    });
    const row = rows[0] ?? {};
    return {
      domain,
      organic_keywords: num(row["Or"]),
      organic_traffic: num(row["Ot"]),
      organic_cost: num(row["Oc"]),
      paid_keywords: num(row["Ad"]),
      paid_traffic: num(row["At"]),
      paid_cost: num(row["Ac"]),
      rank: num(row["Rk"]),
      backlinks: null,
      referring_domains: null,
    };
  },

  async organicRankings(domain, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest("domain_organic", {
      domain,
      database,
      display_limit: limit,
      export_columns: "Ph,Po,Nq,Cp,Co,Tr,Tc,Ur,Kd",
    });
    return rows.map((row) => ({
      ...mapOverviewRow(row),
      position: num(row["Po"]),
      url: row["Ur"] || null,
      traffic: num(row["Tr"]),
      traffic_cost: num(row["Tc"]),
    })) as NormalizedRankedKeyword[];
  },

  async topPages(domain, opts) {
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 50;
    const rows = await semrushRequest("domain_organic_pages", {
      domain,
      database,
      display_limit: limit,
      export_columns: "Ur,Pc,Tr",
    });
    return rows.map((row) => ({
      url: row["Ur"] ?? "",
      traffic: num(row["Tr"]),
      keywords_count: num(row["Pc"]),
      top_keyword: null,
      top_position: null,
    })) as NormalizedTopPage[];
  },

  async compareDomains(domains, opts) {
    if (domains.length < 2) return [];
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest("domain_domains", {
      domains: domains.map((d, i) => `*|${i === 0 ? "or" : "or"}|${d}`).join("|"),
      database,
      display_limit: limit,
      export_columns: "Ph,Nq,Cp,Co,Kd,P0,P1,P2,P3,P4",
    });
    return rows.map((row) => {
      const positions: Record<string, number | null> = {};
      domains.forEach((d, i) => {
        positions[d] = num(row[`P${i}`]);
      });
      return {
        keyword: row["Ph"] ?? "",
        search_volume: num(row["Nq"]),
        cpc: num(row["Cp"]),
        difficulty: num(row["Kd"]),
        positions,
      } as NormalizedDomainIntersection;
    });
  },

  async keywordGap(seed, competitors, opts) {
    if (!competitors.length) return [];
    const database = toSemrushDb(opts?.location);
    const limit = opts?.limit ?? 100;
    // Keywords the competitor ranks for but seed does not: "*|-|seed|*|or|competitor"
    const rows = await semrushRequest("domain_domains", {
      domains: [`*|-|${seed}`, ...competitors.map((c) => `*|or|${c}`)].join("|"),
      database,
      display_limit: limit,
      export_columns: "Ph,Nq,Cp,Co,Kd,P0,P1,P2",
    });
    return rows.map((row) => {
      const positions: Record<string, number | null> = { [seed]: null };
      competitors.forEach((c, i) => {
        positions[c] = num(row[`P${i + 1}`]);
      });
      return {
        keyword: row["Ph"] ?? "",
        search_volume: num(row["Nq"]),
        cpc: num(row["Cp"]),
        difficulty: num(row["Kd"]),
        positions,
      } as NormalizedDomainIntersection;
    });
  },

  async backlinks(target, opts) {
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest(
      "backlinks",
      {
        target,
        target_type: target.includes("/") ? "url" : "root_domain",
        display_limit: limit,
        export_columns:
          "source_url,source_title,target_url,anchor,nofollow,first_seen,last_seen,page_ascore,source_size,external_num,internal_num,domain_ascore",
      },
      SEMRUSH_ANALYTICS
    );
    return rows.map((row) => {
      let sourceDomain = "";
      try {
        sourceDomain = new URL(row["source_url"] ?? "").hostname;
      } catch {}
      return {
        source_url: row["source_url"] ?? "",
        source_domain: sourceDomain,
        source_title: row["source_title"] ?? null,
        target_url: row["target_url"] ?? "",
        anchor: row["anchor"] ?? null,
        dofollow: row["nofollow"] ? row["nofollow"] !== "true" : null,
        first_seen: row["first_seen"] ?? null,
        last_seen: row["last_seen"] ?? null,
        rank: num(row["page_ascore"]),
        domain_authority: num(row["domain_ascore"]),
        external_links: num(row["external_num"]),
        internal_links: num(row["internal_num"]),
      } as NormalizedBacklink;
    });
  },

  async referringDomains(target, opts) {
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest(
      "backlinks_refdomains",
      {
        target,
        target_type: target.includes("/") ? "url" : "root_domain",
        display_limit: limit,
        export_columns: "domain,backlinks_num,domain_ascore,first_seen,backlinks_nofollow",
      },
      SEMRUSH_ANALYTICS
    );
    return rows.map((row) => ({
      domain: row["domain"] ?? "",
      backlinks: num(row["backlinks_num"]),
      rank: num(row["domain_ascore"]),
      first_seen: row["first_seen"] ?? null,
      dofollow_backlinks:
        num(row["backlinks_num"]) !== null && num(row["backlinks_nofollow"]) !== null
          ? (num(row["backlinks_num"]) as number) - (num(row["backlinks_nofollow"]) as number)
          : null,
    })) as NormalizedReferringDomain[];
  },

  async backlinkGap(seed, competitors, opts) {
    const limit = opts?.limit ?? 100;
    // SEMrush exposes this as 'backlinks_competitors' / 'backlinks_comparison'
    const rows = await semrushRequest(
      "backlinks_competitors",
      {
        target: seed,
        target_type: "root_domain",
        display_limit: limit,
        export_columns: "neighbour,similarity,common_refdomains,domains_num,backlinks_num",
      },
      SEMRUSH_ANALYTICS
    );
    return rows
      .filter((r) => !competitors.length || competitors.includes(r["neighbour"] ?? ""))
      .map((row) => ({
        domain: row["neighbour"] ?? "",
        backlinks: num(row["backlinks_num"]),
        rank: num(row["similarity"]),
        first_seen: null,
        dofollow_backlinks: null,
      })) as NormalizedReferringDomain[];
  },

  async backlinkAudit(target, opts) {
    const limit = opts?.limit ?? 100;
    const rows = await semrushRequest(
      "backlinks",
      {
        target,
        target_type: target.includes("/") ? "url" : "root_domain",
        display_limit: limit,
        export_columns: "source_url,source_title,anchor,page_ascore,source_size,external_num",
      },
      SEMRUSH_ANALYTICS
    );
    return rows.map((row) => {
      const ascore = num(row["page_ascore"]) ?? 0;
      const externals = num(row["external_num"]) ?? 0;
      const spam = ascore < 15 ? 80 : ascore < 30 ? 50 : ascore < 50 ? 25 : 5;
      let sourceDomain = "";
      try {
        sourceDomain = new URL(row["source_url"] ?? "").hostname;
      } catch {}
      return {
        source_url: row["source_url"] ?? "",
        source_domain: sourceDomain,
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
    // SEMrush Site Audit requires a Projects API + async polling — not worth emulating
    // without that infrastructure. Return a placeholder the caller can render.
    return {
      target,
      pages_crawled: null,
      issues: { critical: null, warnings: null, notices: null },
      top_issues: [
        {
          code: "semrush_site_audit_requires_project",
          title:
            "SEMrush Site Audit requires Projects API setup. Use DataForSEO or Ahrefs provider for on-demand audits.",
          count: 0,
        },
      ],
    };
  },

  async onPageSeoCheck(url, _opts): Promise<NormalizedOnPageCheck> {
    return {
      url,
      status_code: null,
      title: null,
      meta_description: null,
      word_count: null,
      h1: [],
      checks: {
        note: "SEMrush On Page SEO Checker requires a project. Use DataForSEO for on-demand checks.",
      },
      load_time_ms: null,
      mobile_friendly: null,
    };
  },

  async positionTracking(domain, keywords, opts) {
    const database = toSemrushDb(opts?.location);
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        try {
          const rows = await semrushRequest("phrase_organic", {
            phrase: keyword,
            database,
            display_limit: 50,
            export_columns: "Dn,Ur,Po",
          });
          const hit = rows.find((r) =>
            (r["Dn"] ?? "").toLowerCase().includes(domain.toLowerCase())
          );
          return {
            keyword,
            position: num(hit?.["Po"]),
            previous_position: null,
            change: null,
            url: hit?.["Ur"] ?? null,
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
    const database = toSemrushDb(opts?.location);
    const rows = await semrushRequest("domain_rank_history", {
      domain,
      database,
      export_columns: "Dt,Rk,Or,Ot,Oc",
    });
    return rows.map((row) => {
      const d = row["Dt"] ?? "";
      const year = num(d.slice(0, 4)) ?? 0;
      const month = num(d.slice(4, 6)) ?? 0;
      return {
        month,
        year,
        organic_traffic: num(row["Ot"]),
        organic_keywords: num(row["Or"]),
      } as NormalizedTrafficInsight;
    });
  },

  async sensor(category, _opts): Promise<NormalizedSensorRow[]> {
    // SEMrush Sensor score exists on their UI but not as a generic API endpoint in their public analytics API.
    // Return a sentinel row so downstream rendering still works.
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

  async linkProspects(seed, opts) {
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
