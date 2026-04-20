export type SeoProviderName = "dataforseo" | "semrush" | "ahrefs";

export interface SeoQueryOptions {
  location?: string;
  language?: string;
  location_code?: number;
  language_code?: string;
  limit?: number;
}

// ─── Keyword shapes ────────────────────────────────────────
export interface NormalizedKeyword {
  keyword: string;
  search_volume: number | null;
  competition: string | number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
  monthly_searches?: Array<{ month: number; year: number; search_volume: number }> | null;
  competition_index?: number | null;
}

export interface NormalizedSerpResult {
  rank: number;
  title: string;
  url: string;
  description: string;
  domain: string;
}

// ─── Domain analytics ──────────────────────────────────────
export interface NormalizedDomainOverview {
  domain: string;
  organic_keywords: number | null;
  organic_traffic: number | null;
  organic_cost: number | null;
  paid_keywords: number | null;
  paid_traffic: number | null;
  paid_cost: number | null;
  rank: number | null;
  backlinks: number | null;
  referring_domains: number | null;
}

export interface NormalizedRankedKeyword extends NormalizedKeyword {
  position: number | null;
  url: string | null;
  traffic: number | null;
  traffic_cost: number | null;
}

export interface NormalizedTopPage {
  url: string;
  traffic: number | null;
  keywords_count: number | null;
  top_keyword: string | null;
  top_position: number | null;
}

export interface NormalizedDomainIntersection {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  positions: Record<string, number | null>; // domain → position
}

// ─── Backlinks ─────────────────────────────────────────────
export interface NormalizedBacklink {
  source_url: string;
  source_domain: string;
  source_title: string | null;
  target_url: string;
  anchor: string | null;
  dofollow: boolean | null;
  first_seen: string | null;
  last_seen: string | null;
  rank: number | null;
  // Domain-level authority of the source domain (0-100 scale if provider gives it).
  domain_authority: number | null;
  // Count of external links on the source page.
  external_links: number | null;
  // Count of internal links on the source page.
  internal_links: number | null;
}

export interface NormalizedReferringDomain {
  domain: string;
  backlinks: number | null;
  rank: number | null;
  first_seen: string | null;
  dofollow_backlinks: number | null;
}

export interface NormalizedBacklinkAuditItem {
  source_url: string;
  source_domain: string;
  spam_score: number | null;
  toxic_score: number | null;
  reason: string | null;
}

// ─── On-page / audit ───────────────────────────────────────
export interface NormalizedSiteAuditSummary {
  target: string;
  pages_crawled: number | null;
  issues: {
    critical: number | null;
    warnings: number | null;
    notices: number | null;
  };
  top_issues: Array<{ code: string; title: string; count: number }>;
}

export interface NormalizedOnPageCheck {
  url: string;
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  word_count: number | null;
  h1: string[];
  checks: Record<string, boolean | number | string | null>;
  load_time_ms: number | null;
  mobile_friendly: boolean | null;
}

// ─── Position tracking / insights ──────────────────────────
export interface NormalizedPositionTrackingRow {
  keyword: string;
  position: number | null;
  previous_position: number | null;
  change: number | null;
  url: string | null;
  search_volume: number | null;
  traffic: number | null;
}

export interface NormalizedTrafficInsight {
  month: number;
  year: number;
  organic_traffic: number | null;
  organic_keywords: number | null;
}

export interface NormalizedSensorRow {
  category: string;
  volatility: number | null;
  date: string;
}

// ─── Content ───────────────────────────────────────────────
export interface NormalizedContentTemplate {
  target_keyword: string;
  recommended_word_count: number | null;
  recommended_keywords: string[];
  recommended_backlinks: number | null;
  readability_score: number | null;
  top_serp_urls: string[];
  title_suggestions: string[];
}

export interface NormalizedWritingScore {
  content: string;
  overall_score: number;
  readability_score: number;
  seo_score: number;
  tone: string | null;
  issues: Array<{ type: string; message: string; suggestion: string }>;
}

// ─── Link building ─────────────────────────────────────────
export interface NormalizedLinkProspect {
  domain: string;
  url: string;
  rank: number | null;
  relevance: number | null;
  contact: string | null;
  reason: string | null;
}

// ─── Provider interface ────────────────────────────────────
export interface SeoProvider {
  readonly name: SeoProviderName;

  // Keyword research (existing + new)
  keywordIdeas(keyword: string, opts?: SeoQueryOptions): Promise<NormalizedKeyword[]>;
  relatedKeywords(keyword: string, opts?: SeoQueryOptions): Promise<NormalizedKeyword[]>;
  competitorKeywords(domain: string, opts?: SeoQueryOptions): Promise<NormalizedKeyword[]>;
  serpSearch(keyword: string, opts?: SeoQueryOptions): Promise<NormalizedSerpResult[]>;
  searchVolume(keywords: string[], opts?: SeoQueryOptions): Promise<NormalizedKeyword[]>;
  keywordOverview(keyword: string, opts?: SeoQueryOptions): Promise<NormalizedKeyword | null>;
  keywordMagic(keyword: string, opts?: SeoQueryOptions): Promise<NormalizedKeyword[]>;
  keywordStrategy(keyword: string, opts?: SeoQueryOptions): Promise<Array<{ cluster: string; keywords: NormalizedKeyword[] }>>;
  topicResearch(keyword: string, opts?: SeoQueryOptions): Promise<Array<{ topic: string; keywords: NormalizedKeyword[] }>>;

  // Domain analytics
  domainOverview(domain: string, opts?: SeoQueryOptions): Promise<NormalizedDomainOverview>;
  organicRankings(domain: string, opts?: SeoQueryOptions): Promise<NormalizedRankedKeyword[]>;
  topPages(domain: string, opts?: SeoQueryOptions): Promise<NormalizedTopPage[]>;
  compareDomains(domains: string[], opts?: SeoQueryOptions): Promise<NormalizedDomainIntersection[]>;
  keywordGap(seed: string, competitors: string[], opts?: SeoQueryOptions): Promise<NormalizedDomainIntersection[]>;

  // Backlinks
  backlinks(target: string, opts?: SeoQueryOptions): Promise<NormalizedBacklink[]>;
  referringDomains(target: string, opts?: SeoQueryOptions): Promise<NormalizedReferringDomain[]>;
  backlinkGap(seed: string, competitors: string[], opts?: SeoQueryOptions): Promise<NormalizedReferringDomain[]>;
  backlinkAudit(target: string, opts?: SeoQueryOptions): Promise<NormalizedBacklinkAuditItem[]>;

  // On-page / audit
  siteAudit(target: string, opts?: SeoQueryOptions): Promise<NormalizedSiteAuditSummary>;
  onPageSeoCheck(url: string, opts?: SeoQueryOptions): Promise<NormalizedOnPageCheck>;

  // Position tracking / insights
  positionTracking(domain: string, keywords: string[], opts?: SeoQueryOptions): Promise<NormalizedPositionTrackingRow[]>;
  organicTrafficInsights(domain: string, opts?: SeoQueryOptions): Promise<NormalizedTrafficInsight[]>;
  sensor(category?: string, opts?: SeoQueryOptions): Promise<NormalizedSensorRow[]>;
  domainRank(domain: string, opts?: SeoQueryOptions): Promise<{ domain: string; rank: number | null; score: number | null }>;

  // Link building
  linkProspects(seed: string, opts?: SeoQueryOptions): Promise<NormalizedLinkProspect[]>;
}
