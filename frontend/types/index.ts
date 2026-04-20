// ─── DataForSEO Types ───────────────────────────────────

export interface KeywordData {
  keyword: string;
  search_volume: number | null;
  competition: string | null;
  cpc: number | null;
  intent: string | null;
  difficulty: number | null;
}

export interface SerpResult {
  rank: number;
  title: string;
  url: string;
  description: string;
  domain: string;
}

export interface RelatedKeyword {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: string | null;
}

export interface CompetitorKeyword {
  keyword: string;
  search_volume: number | null;
  competition: string | null;
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
}

export interface AIEnrichedKeyword {
  keyword: string;
  search_volume: number | null;
  monthly_searches: Array<{ month: number; year: number; search_volume: number }> | null;
  cpc: number | null;
  competition_index: number | null;
  difficulty: number | null;
  intent: string | null;
}

// ─── AI Types ───────────────────────────────────────────

export type AIProvider = "openai" | "gemini" | "anthropic";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  max_tokens?: number;
}

// ─── API Route Types ────────────────────────────────────

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ChatRequest {
  message: string;
  history?: AIMessage[];
}

export interface ChatResponse {
  success: boolean;
  report: string;
  raw_data: Record<string, unknown>;
}

// ─── SEO Data Gathering ─────────────────────────────────

export type SEOIntent =
  // Keyword research
  | "keyword_ideas"
  | "serp_search"
  | "related_keywords"
  | "competitor_keywords"
  | "keyword_overview"
  | "keyword_magic"
  | "keyword_strategy"
  | "topic_research"
  // Domain analytics
  | "domain_overview"
  | "organic_rankings"
  | "top_pages"
  | "compare_domains"
  | "keyword_gap"
  // Backlinks
  | "backlinks"
  | "referring_domains"
  | "backlink_gap"
  | "backlink_audit"
  // On-page / audit
  | "site_audit"
  | "on_page_seo"
  // Position / insights
  | "position_tracking"
  | "organic_traffic_insights"
  | "sensor"
  | "domain_rank"
  // Content
  | "seo_writing_assistant"
  | "content_template"
  // Link building
  | "link_prospects"
  // Misc
  | "log_file_analyzer"
  | "internal_links"
  | "ai_mode";
