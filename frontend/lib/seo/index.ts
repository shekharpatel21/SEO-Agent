import type { SeoProvider, SeoProviderName } from "./types";
import { dataForSEOProvider } from "./providers/dataforseo";
import { semrushProvider } from "./providers/semrush";
import { ahrefsProvider } from "./providers/ahrefs";

export * from "./types";

const providers: Record<SeoProviderName, SeoProvider> = {
  dataforseo: dataForSEOProvider,
  semrush: semrushProvider,
  ahrefs: ahrefsProvider,
};

export function getSeoProvider(override?: string): SeoProvider {
  const name = (override ?? process.env.SEO_PROVIDER ?? "dataforseo")
    .toLowerCase()
    .trim() as SeoProviderName;

  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Unknown SEO_PROVIDER "${name}". Supported: ${Object.keys(providers).join(", ")}`
    );
  }
  return provider;
}

export function hasCredentials(name: SeoProviderName): boolean {
  switch (name) {
    case "dataforseo":
      return Boolean(
        process.env.DATAFORSEO_USERNAME && process.env.DATAFORSEO_PASSWORD
      );
    case "semrush":
      return Boolean(process.env.SEMRUSH_API_KEY);
    case "ahrefs":
      return Boolean(process.env.AHREFS_API_TOKEN);
  }
}

const DEFAULT_FALLBACK: SeoProviderName[] = ["dataforseo", "semrush", "ahrefs"];

// Per-intent preferred provider order. When the request doesn't pin a provider,
// the system will try the listed providers in order and return the first success.
// This means a user with subscriptions across DataForSEO + Ahrefs + SEMrush gets
// the best-fit provider automatically for each feature, and a feature that lacks
// access on one provider transparently falls back to another.
export const INTENT_PROVIDER_ORDER: Record<string, SeoProviderName[]> = {
  // Backlinks API is sold separately on DataForSEO; Ahrefs is the gold standard.
  backlinks: ["ahrefs", "semrush", "dataforseo"],
  referring_domains: ["ahrefs", "semrush", "dataforseo"],
  backlink_gap: ["ahrefs", "semrush", "dataforseo"],
  backlink_audit: ["ahrefs", "semrush", "dataforseo"],
  link_prospects: ["ahrefs", "semrush", "dataforseo"],
  // Keyword research — DataForSEO Google Ads is cheap and reliable.
  keyword_ideas: ["dataforseo", "semrush", "ahrefs"],
  related_keywords: ["dataforseo", "semrush", "ahrefs"],
  search_volume: ["dataforseo", "semrush", "ahrefs"],
  keyword_overview: ["dataforseo", "semrush", "ahrefs"],
  keyword_magic: ["dataforseo", "semrush", "ahrefs"],
  keyword_strategy: ["dataforseo", "semrush", "ahrefs"],
  topic_research: ["dataforseo", "semrush", "ahrefs"],
  // Domain analytics — Ahrefs site-explorer + SEMrush domain_organic both excellent.
  domain_overview: ["ahrefs", "semrush", "dataforseo"],
  organic_rankings: ["semrush", "ahrefs", "dataforseo"],
  top_pages: ["ahrefs", "semrush", "dataforseo"],
  compare_domains: ["semrush", "ahrefs", "dataforseo"],
  keyword_gap: ["semrush", "ahrefs", "dataforseo"],
  competitor_keywords: ["semrush", "ahrefs", "dataforseo"],
  // SERP & on-page — DataForSEO is strong here.
  serp_search: ["dataforseo", "ahrefs", "semrush"],
  on_page_seo: ["dataforseo", "ahrefs", "semrush"],
  site_audit: ["dataforseo", "ahrefs", "semrush"],
  position_tracking: ["dataforseo", "semrush", "ahrefs"],
  organic_traffic_insights: ["semrush", "ahrefs", "dataforseo"],
  domain_rank: ["ahrefs", "semrush", "dataforseo"],
  sensor: ["dataforseo", "semrush", "ahrefs"],
};

export interface FallbackResult<T> {
  data: T;
  provider: SeoProviderName;
  tried: SeoProviderName[];
}

/**
 * Call an SEO provider method with automatic fallback.
 *
 * - If `preferred` is set explicitly, only that provider is tried.
 * - Otherwise, tries providers in `intent`-specific order (or default order),
 *   skipping providers whose credentials are not configured, until one succeeds.
 * - Throws the LAST error encountered if every available provider fails.
 */
export async function callWithFallback<T>(
  call: (provider: SeoProvider) => Promise<T>,
  options: {
    preferred?: string;
    intent?: string;
  } = {}
): Promise<FallbackResult<T>> {
  const { preferred, intent } = options;

  // Explicit provider request: no fallback, surface the error if it fails.
  if (preferred) {
    const provider = getSeoProvider(preferred);
    const data = await call(provider);
    return { data, provider: provider.name, tried: [provider.name] };
  }

  const order =
    (intent && INTENT_PROVIDER_ORDER[intent]) || DEFAULT_FALLBACK;

  const tried: SeoProviderName[] = [];
  let lastError: unknown = null;

  for (const name of order) {
    if (!hasCredentials(name)) continue;
    tried.push(name);
    try {
      const data = await call(providers[name]);
      return { data, provider: name, tried };
    } catch (err) {
      lastError = err;
      // Keep trying other providers.
    }
  }

  if (tried.length === 0) {
    throw new Error(
      "No SEO provider has credentials configured. Set DATAFORSEO_USERNAME+DATAFORSEO_PASSWORD, SEMRUSH_API_KEY, or AHREFS_API_TOKEN."
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`All providers failed (tried: ${tried.join(", ")})`);
}
