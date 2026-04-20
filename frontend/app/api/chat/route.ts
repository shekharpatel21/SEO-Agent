import { NextRequest, NextResponse } from "next/server";
import { getAIResponse } from "@/lib/ai";
import { SEO_AGENT_SYSTEM_PROMPT } from "@/lib/prompts";
import { applyFilter, type FilterSpec, type IntentFilterSpecs } from "@/lib/filters";
import type { SEOIntent } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { message, history = [], skipSlack = false, provider } = await req.json();

    if (!message) {
      return NextResponse.json(
        { success: false, error: "message is required" },
        { status: 400 }
      );
    }

    let slackRef: { ts: string; channel: string } | null = null;
    if (process.env.SLACK_BOT_TOKEN && !skipSlack) {
      slackRef = await sendSlackStatus(message).catch((err) => {
        console.error("Slack status send failed:", err.message);
        return null;
      });
    }

    // Extract domains first so the intent classifier can bias toward domain-level
    // reports when the message names a site but no topic verb.
    const domains = extractDomains(message);
    let intents = classifyIntent(message, domains.length > 0);

    // If rule-based classification landed on the generic fallback, try AI classification
    // as a second pass — the user may have used wording the rules don't cover.
    const fellBackToDefault =
      (intents.length === 2 &&
        intents.includes("keyword_ideas") &&
        intents.includes("serp_search")) ||
      (intents.length === 4 &&
        intents.includes("domain_overview") &&
        intents.includes("organic_rankings") &&
        intents.includes("top_pages") &&
        intents.includes("backlinks"));

    if (fellBackToDefault) {
      const aiIntents = await classifyIntentWithAI(message, domains.length > 0).catch(
        () => [] as SEOIntent[]
      );
      if (aiIntents.length > 0) intents = aiIntents;
    }

    // Extract primary keyword/topic (may be empty or a domain if message is domain-only)
    const keyword = await extractKeyword(message);
    console.log(
      `[chat] message="${message}" → keyword="${keyword}" domains=[${domains.join(", ")}] intents=[${intents.join(", ")}]`
    );

    const origin =
      req.nextUrl.origin ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";
    const seoData = await gatherSEOData(
      intents,
      message,
      keyword,
      domains,
      origin,
      provider
    );

    // Ask the AI to translate the user's natural-language filters ("only
    // do-follow", "above 30 domain authority", "keywords with volume > 1000")
    // into structured FilterSpecs — one per intent. Applied deterministically.
    const filterSpecs = await extractFilterSpecs(message, intents).catch(() => ({}));
    const { filteredData, filterSummary } = applyFiltersToIntentData(
      seoData,
      filterSpecs
    );

    // Separate successful data from failures so the AI never sees raw error text.
    const { cleanData, failedIntents, failures, emptyIntents } =
      partitionResults(filteredData);

    // Short-circuit: if every intent failed to fetch (or returned empty with no
    // useful payload), produce a deterministic, honest response. Do NOT hand
    // this to the AI — it will confabulate findings about the target site
    // ("no backlinks", "no traffic") based on the absence of data rather than
    // actual measurements.
    let report: string;
    if (Object.keys(cleanData).length === 0 && intents.length > 0) {
      report = buildDataUnavailableReport(
        intents,
        failures,
        emptyIntents,
        domains[0] ?? null,
        keyword
      );
    } else {
      const aiInputPayload = JSON.stringify(cleanData, null, 2).slice(0, 30000);

      const failedNote = failedIntents.length
        ? `\n\n────────────────\nFAILED-TO-FETCH INTENTS (CRITICAL): ${failedIntents.join(
            ", "
          )}\nWe did NOT retrieve data for these intents. DO NOT describe factual findings for them. For each failed intent, write one line: "Data could not be retrieved for this section at this time." Then move on. Never say "the site has no X" or "the site has low Y" for a failed intent — you have no measurement.`
        : "";

      const emptyNote = emptyIntents.length
        ? `\n\n────────────────\nFETCHED-BUT-EMPTY INTENTS: ${emptyIntents.join(
            ", "
          )}\nFor these intents the upstream provider responded successfully but returned ZERO records. This is a real measurement (the dataset truly has nothing for this query) — you may state "the dataset returned no records for this query at this time" but do NOT extrapolate broader claims about the target. Often this means: the site is too new for the index, the location/language filter excluded everything, or the keyword has no detectable demand.`
        : "";

      // Tell the AI exactly which filters were applied so its narration matches
      // the data it's looking at (e.g. "these 8 dofollow links above DR 30…").
      const appliedFilters = Object.entries(filterSpecs).filter(
        ([intent]) =>
          (filterSummary[intent]?.applied ?? false) && intent in cleanData
      );
      const filterNote = appliedFilters.length
        ? `\n\n────────────────\nUSER-REQUESTED FILTERS APPLIED (use these to frame the report):\n${appliedFilters
            .map(([intent, spec]) => {
              const s = filterSummary[intent];
              return `- ${intent}: ${JSON.stringify(spec)} (${s.before} → ${s.after} rows)`;
            })
            .join(
              "\n"
            )}\nOnly discuss the filtered rows. Do not summarize the un-filtered universe. Respect any projected fields; do not mention columns the user excluded.`
        : "";

      report = await getAIResponse({
        system: SEO_AGENT_SYSTEM_PROMPT,
        messages: [
          ...history,
          {
            role: "user" as const,
            content: `User request: ${message}\n\nSuccessfully-fetched intents: ${Object.keys(
              cleanData
            ).join(", ") || "none"}\nPrimary domain (if any): ${
              domains[0] ?? "none"
            }\nPrimary topic (if any): ${
              keyword && !keyword.includes(".") ? keyword : "none"
            }\n\nSEO data gathered:\n${aiInputPayload}${failedNote}${emptyNote}${filterNote}\n\nGenerate a complete, professional, structured report matching the user's intent. If multiple intents were run, integrate them into one cohesive narrative. Never expose internal error messages, parameter names, provider names, or debug text.`,
          },
        ],
      });
    }

    if (process.env.SLACK_BOT_TOKEN && slackRef && !skipSlack) {
      await sendToSlack(report, message, slackRef).catch((err) => {
        console.error("Slack report send failed:", err.message);
      });
    }

    return NextResponse.json({
      success: true,
      intents,
      keyword,
      domains,
      report,
      filters_applied: filterSpecs,
      filter_summary: filterSummary,
      raw_data: seoData,
      filtered_data: filteredData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, report: `Error: ${message}`, raw_data: {} },
      { status: 500 }
    );
  }
}

function classifyIntent(message: string, hasDomain = false): SEOIntent[] {
  // Normalize so "on-page-seo", "on page seo", and "on_page_seo" all match the same patterns.
  const lower = message
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const intents: SEOIntent[] = [];

  const hit = (...patterns: (string | RegExp)[]) =>
    patterns.some((p) => (typeof p === "string" ? lower.includes(p) : p.test(lower)));

  // ── Domain analytics ──────────────────────────────────────────────────
  if (
    hit(
      "domain overview",
      "domain analysis",
      "domain analytics",
      "website overview",
      "website analysis",
      "website analytics",
      "site overview",
      "site analysis",
      "site analytics",
      "analyze this website",
      "analyse this website",
      "analyze this site",
      "analyze this domain",
      "analyze this url",
      "analytics for",
      "analytics of",
      "overview of",
      "info about this website",
      "tell me about this website",
      /\banalytics\b/,
      /\banaly[sz]e\b/
    )
  )
    intents.push("domain_overview");

  if (
    hit(
      "organic ranking",
      "organic rankings",
      "organic keywords",
      "ranked keywords",
      "keywords this site ranks",
      "keywords this website ranks",
      "what keywords does",
      "ranks for",
      "ranking for",
      "ranking keywords"
    )
  )
    intents.push("organic_rankings");

  if (
    hit(
      "top pages",
      "best pages",
      "most visited pages",
      "highest traffic pages",
      "high traffic pages",
      "popular pages",
      "top performing pages"
    )
  )
    intents.push("top_pages");

  if (
    hit(
      "compare domains",
      "compare these sites",
      "compare these websites",
      "compare websites",
      "side by side",
      "head to head",
      "versus",
      " vs ",
      " vs. "
    )
  )
    intents.push("compare_domains");

  if (
    hit(
      "keyword gap",
      "content gap",
      "missing keywords",
      "keywords my competitors",
      "keywords competitors rank",
      "what keywords am i missing"
    )
  )
    intents.push("keyword_gap");

  // ── Backlinks ────────────────────────────────────────────────────────
  if (hit("backlink gap", "link gap", "backlinks gap"))
    intents.push("backlink_gap");

  if (
    hit(
      "backlink audit",
      "backlinks audit",
      "toxic link",
      "toxic backlink",
      "spammy link",
      "spammy backlink",
      "spam score",
      "disavow",
      "bad backlink",
      "harmful backlink"
    )
  )
    intents.push("backlink_audit");

  if (
    hit(
      "referring domain",
      "referring domains",
      "linking domain",
      "linking websites",
      "who links to",
      "who is linking",
      "link sources"
    )
  )
    intents.push("referring_domains");

  if (hit("backlink", "backlinks", "inbound link", "inbound links", "links to ", "links pointing"))
    intents.push("backlinks");

  // ── On-page / audit ──────────────────────────────────────────────────
  if (
    hit(
      "site audit",
      "website audit",
      "crawl issues",
      "crawl errors",
      "technical seo",
      "technical audit",
      "site health",
      "website health",
      "audit my site",
      "audit my website",
      "audit the site"
    )
  )
    intents.push("site_audit");

  if (
    hit(
      "on page seo",
      "page checker",
      "audit this page",
      "audit the page",
      "page audit",
      "seo of this page",
      "seo score of this page",
      "check this page",
      "on page checker",
      "page seo check"
    )
  )
    intents.push("on_page_seo");

  // ── Position / insights ──────────────────────────────────────────────
  if (
    hit(
      "position tracking",
      "track rankings",
      "track ranking",
      "rank tracking",
      "rank tracker",
      "monitor rankings",
      "track my position",
      "track my rank"
    )
  )
    intents.push("position_tracking");

  if (
    hit(
      "traffic insights",
      "traffic analysis",
      "traffic history",
      "traffic trend",
      "historical traffic",
      "organic traffic insights",
      "organic traffic analysis",
      "organic traffic",
      "traffic over time",
      "traffic growth",
      "website traffic"
    )
  )
    intents.push("organic_traffic_insights");

  if (hit("sensor", "serp volatility", "serp weather", "volatility"))
    intents.push("sensor");

  if (
    hit(
      "domain rank",
      "authority score",
      "domain authority",
      "semrush rank",
      "ahrefs rank",
      "domain rating",
      "site rank"
    )
  )
    intents.push("domain_rank");

  // ── Content ──────────────────────────────────────────────────────────
  if (
    hit(
      "writing assistant",
      "audit this content",
      "audit my content",
      "score this content",
      "improve my content",
      "content score",
      "content quality",
      "grade my content"
    )
  )
    intents.push("seo_writing_assistant");

  if (
    hit(
      "content template",
      "content brief",
      "outline for",
      "content plan for",
      "content plan",
      "article template",
      "article brief",
      "blog brief",
      "blog template"
    )
  )
    intents.push("content_template");

  // ── Keyword research extensions ──────────────────────────────────────
  if (
    hit(
      "keyword overview",
      "keyword stats",
      "keyword info",
      "keyword details",
      "details about this keyword",
      "keyword data"
    )
  )
    intents.push("keyword_overview");

  if (
    hit(
      "keyword magic",
      "all keyword suggestions",
      "all keyword ideas",
      "find keywords",
      "long tail keyword",
      "long tail keywords",
      "exhaustive keyword",
      "comprehensive keyword list"
    )
  )
    intents.push("keyword_magic");

  if (
    hit(
      "keyword strategy",
      "keyword cluster",
      "keyword clusters",
      "cluster keywords",
      "group keywords",
      "keyword grouping",
      "keyword map"
    )
  )
    intents.push("keyword_strategy");

  if (
    hit(
      "topic research",
      "topic ideas",
      "content ideas",
      "blog ideas",
      "article ideas",
      "topics to write about",
      "what topics",
      "topics for"
    )
  )
    intents.push("topic_research");

  // ── Link building ────────────────────────────────────────────────────
  if (
    hit(
      "link building",
      "link prospects",
      "link prospecting",
      "outreach target",
      "outreach targets",
      "find websites to get links",
      "find sites to link",
      "link opportunities"
    )
  )
    intents.push("link_prospects");

  // ── Log file ─────────────────────────────────────────────────────────
  if (
    hit(
      "log file",
      "access log",
      "access logs",
      "crawl budget",
      "bot activity",
      "googlebot activity",
      "crawler activity"
    )
  )
    intents.push("log_file_analyzer");

  // ── Original intents ─────────────────────────────────────────────────
  if (hit("serp", "top results", "google results", "search results", /ranking(?!s)/))
    intents.push("serp_search");

  if (hit("related keyword", "similar keyword", "related queries", "related search"))
    intents.push("related_keywords");

  if (hit("competitor") && !intents.includes("keyword_gap"))
    intents.push("competitor_keywords");

  if (hit("internal link", "internal links", "sitemap", "site structure", "site map"))
    intents.push("internal_links");

  if (hit("search volume", "monthly searches"))
    intents.push("ai_mode");

  if (
    hit("keyword", "keywords") &&
    !intents.some((i) =>
      [
        "keyword_overview",
        "keyword_magic",
        "keyword_strategy",
        "keyword_gap",
        "related_keywords",
        "competitor_keywords",
        "organic_rankings",
      ].includes(i)
    )
  )
    intents.push("keyword_ideas");

  // Default fallback
  // If a domain was detected but nothing specific matched, assume the user wants a
  // domain-level report (overview + organic rankings + top pages + backlinks).
  // Otherwise assume topic research → keyword ideas + SERP.
  if (intents.length === 0) {
    if (hasDomain) {
      intents.push("domain_overview", "organic_rankings", "top_pages", "backlinks");
    } else {
      intents.push("keyword_ideas", "serp_search");
    }
  }

  return Array.from(new Set(intents));
}

const INTENT_LABEL: Record<SEOIntent, string> = {
  keyword_ideas: "Keyword ideas",
  serp_search: "SERP results",
  related_keywords: "Related keywords",
  competitor_keywords: "Competitor keywords",
  keyword_overview: "Keyword overview",
  keyword_magic: "Keyword magic tool",
  keyword_strategy: "Keyword strategy",
  topic_research: "Topic research",
  domain_overview: "Domain overview",
  organic_rankings: "Organic rankings",
  top_pages: "Top pages",
  compare_domains: "Domain comparison",
  keyword_gap: "Keyword gap",
  backlinks: "Backlinks",
  referring_domains: "Referring domains",
  backlink_gap: "Backlink gap",
  backlink_audit: "Backlink audit",
  site_audit: "Site audit",
  on_page_seo: "On-page SEO",
  position_tracking: "Position tracking",
  organic_traffic_insights: "Organic traffic insights",
  sensor: "SERP sensor",
  domain_rank: "Domain rank",
  seo_writing_assistant: "SEO writing assistant",
  content_template: "Content template",
  link_prospects: "Link prospects",
  log_file_analyzer: "Log file analysis",
  internal_links: "Internal links",
  ai_mode: "Search volume",
};

function buildDataUnavailableReport(
  intents: SEOIntent[],
  failures: IntentFailure[],
  emptyIntents: string[],
  domain: string | null,
  keyword: string
): string {
  const target =
    domain ?? (keyword && !keyword.includes(".") ? keyword : "your request");

  const byKind = new Map<IntentFailure["kind"], string[]>();
  for (const f of failures) {
    const labeled = INTENT_LABEL[f.intent as SEOIntent] ?? f.intent;
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind)!.push(labeled);
  }

  const sections: string[] = [];

  const accessDenied = byKind.get("access_denied") ?? [];
  if (accessDenied.length) {
    // Pull activation URLs out of each failure reason string, if present.
    const activationLinks = Array.from(
      new Set(
        failures
          .filter((f) => f.kind === "access_denied")
          .map((f) => {
            const m = f.reason.match(/https?:\/\/[^\s"'<>)]+/);
            return m?.[0] ?? null;
          })
          .filter((u): u is string => Boolean(u))
      )
    );

    const activationBlock = activationLinks.length
      ? `\n\n**Activate here:**\n${activationLinks.map((u) => `- ${u}`).join("\n")}`
      : "";

    sections.push(
      `### Subscription not active\n\nThe provider returned **access denied** for these datasets:\n\n${accessDenied
        .map((i) => `- ${i}`)
        .join(
          "\n"
        )}\n\nOn DataForSEO this is a per-API activation — even on the highest plan each API tier (Keywords, Backlinks, On-Page, etc.) must be individually activated once. The account you are using has not activated the API(s) above.${activationBlock}\n\nOnce activated, retry the same request. You can also verify exactly which APIs your credentials can reach by hitting \`GET /api/diagnostics\`.`
    );
  }

  const badRequest = byKind.get("bad_request") ?? [];
  if (badRequest.length) {
    sections.push(
      `### Request needs more information\n\nThe following requests could not run because the query was missing required input (for example, a topic phrase when only a domain was given, or a domain when only a topic was given):\n\n${badRequest
        .map((i) => `- ${i}`)
        .join("\n")}\n\n**What to do:** include both the target website and the topic you're interested in, e.g. "keyword ideas for ${target}" or "backlinks of ${target}".`
    );
  }

  const transport = byKind.get("transport") ?? [];
  if (transport.length) {
    sections.push(
      `### Temporary connectivity issue\n\nWe could not reach the data source for: ${transport.join(
        ", "
      )}. This is usually transient — retry in a moment.`
    );
  }

  const upstream = byKind.get("upstream") ?? [];
  if (upstream.length) {
    sections.push(
      `### Upstream provider error\n\nThe data provider returned an error for: ${upstream.join(
        ", "
      )}. This is typically a rate limit or transient fault — retry shortly.`
    );
  }

  const unknown = byKind.get("unknown") ?? [];
  if (unknown.length) {
    sections.push(
      `### Other\n\nNo data returned for: ${unknown.join(", ")}.`
    );
  }

  if (emptyIntents.length) {
    const labels = emptyIntents.map((i) => INTENT_LABEL[i as SEOIntent] ?? i);
    sections.push(
      `### Dataset returned no records\n\nThe provider responded successfully for these queries but returned **zero records**:\n\n${labels
        .map((l) => `- ${l}`)
        .join(
          "\n"
        )}\n\nThis is a real measurement, not a failure. Common reasons: the site is too new to be in the index, the location/language filter excluded everything, or the keyword has no detectable demand.`
    );
  }

  // Fallback: if we have no classified failures but still got here, list the intents.
  if (sections.length === 0) {
    const requested = intents.map((i) => `- ${INTENT_LABEL[i] ?? i}`).join("\n");
    sections.push(
      `We attempted to pull the following data for **${target}**, but nothing came back at this time:\n\n${requested}`
    );
  }

  return `## Data Retrieval Update

We attempted to pull data for **${target}**. The result does not indicate anything about the actual state of the site — it only tells us why we couldn't deliver this report.

${sections.join("\n\n")}

## Next Steps

1. If you saw a "subscription required" notice above, activate the missing dataset on your provider, or switch providers by adding \`"provider": "semrush"\` / \`"provider": "ahrefs"\` to the request.
2. Retry the same message in a few minutes — transient provider issues clear on their own.
3. Narrow the request to isolate which dataset is unavailable (e.g. "keyword ideas for ${target}" or "backlinks of ${target}").
4. Confirm that credentials for the chosen provider are present in your environment.`;
}

interface IntentFailure {
  intent: string;
  reason: string;
  // Known structured reasons the caller can group on.
  kind: "access_denied" | "transport" | "bad_request" | "upstream" | "unknown";
}

// ─── Filter pipeline ─────────────────────────────────────────────────
// Fields available per intent — the AI uses this as the menu of valid filter
// field names when translating the user's prompt into a FilterSpec.
const INTENT_FIELDS: Record<string, string[]> = {
  keyword_ideas: ["keyword", "search_volume", "cpc", "difficulty", "competition", "competition_index", "intent"],
  related_keywords: ["keyword", "search_volume", "cpc", "difficulty", "competition", "intent"],
  competitor_keywords: ["keyword", "search_volume", "cpc", "difficulty", "competition", "intent"],
  keyword_overview: ["keyword", "search_volume", "cpc", "difficulty", "competition", "intent"],
  keyword_magic: ["keyword", "search_volume", "cpc", "difficulty", "competition", "intent"],
  search_volume: ["keyword", "search_volume", "cpc", "difficulty"],
  topic_research: ["topic", "keywords"],
  keyword_strategy: ["cluster", "keywords"],
  domain_overview: ["organic_keywords", "organic_traffic", "organic_cost", "paid_keywords", "paid_traffic", "rank", "backlinks", "referring_domains"],
  organic_rankings: ["keyword", "search_volume", "cpc", "difficulty", "position", "url", "traffic", "traffic_cost", "intent"],
  top_pages: ["url", "traffic", "keywords_count", "top_keyword", "top_position"],
  compare_domains: ["keyword", "search_volume", "cpc", "difficulty", "positions"],
  keyword_gap: ["keyword", "search_volume", "cpc", "difficulty", "positions"],
  backlinks: ["source_url", "source_domain", "source_title", "target_url", "anchor", "dofollow", "first_seen", "last_seen", "rank", "domain_authority", "external_links", "internal_links"],
  referring_domains: ["domain", "backlinks", "rank", "first_seen", "dofollow_backlinks"],
  backlink_gap: ["domain", "backlinks", "rank", "first_seen", "dofollow_backlinks"],
  backlink_audit: ["source_url", "source_domain", "spam_score", "toxic_score", "reason"],
  site_audit: ["target", "pages_crawled", "issues", "top_issues"],
  on_page_seo: ["url", "status_code", "title", "meta_description", "word_count", "h1", "load_time_ms", "mobile_friendly"],
  position_tracking: ["keyword", "position", "previous_position", "change", "url", "search_volume", "traffic"],
  organic_traffic_insights: ["month", "year", "organic_traffic", "organic_keywords"],
  link_prospects: ["domain", "url", "rank", "relevance", "reason"],
  serp_search: ["rank", "title", "url", "description", "domain"],
  internal_links: ["url", "status", "title", "depth"],
  ai_mode: ["keyword", "search_volume", "cpc", "difficulty"],
  sensor: ["category", "volatility", "date"],
  domain_rank: ["domain", "rank", "score"],
};

// Path inside the raw intent response where the array of records lives.
// Most intents wrap their array under `data.<key>`. A few return the array
// directly. If neither matches the code falls back to scanning the object
// for any array-valued property.
const INTENT_ARRAY_PATH: Record<string, string[]> = {
  backlinks: ["data", "backlinks"],
  referring_domains: ["data", "referring_domains"],
  backlink_gap: ["data", "opportunities"],
  backlink_audit: ["data", "items"],
  organic_rankings: ["data", "keywords"],
  top_pages: ["data", "pages"],
  compare_domains: ["data", "intersection"],
  keyword_gap: ["data", "keywords"],
  competitor_keywords: ["data", "keywords"],
  position_tracking: ["data", "rankings"],
  organic_traffic_insights: ["data", "history"],
  link_prospects: ["data", "prospects"],
  keyword_strategy: ["data", "clusters"],
  topic_research: ["data", "topics"],
  keyword_ideas: ["data"],
  related_keywords: ["data"],
  keyword_overview: ["data"],
  keyword_magic: ["data"],
  search_volume: ["data"],
  ai_mode: ["data"],
  serp_search: ["data"],
  sensor: ["data"],
  site_audit: ["data", "top_issues"],
  domain_overview: ["data"],
  domain_rank: ["data"],
  on_page_seo: ["data"],
  internal_links: ["data"],
};

function getByPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string[], value: unknown) {
  if (path.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

async function extractFilterSpecs(
  message: string,
  intents: SEOIntent[]
): Promise<IntentFilterSpecs> {
  // Quick heuristic: if the message has no filter/limit cues, skip the AI call.
  const cues =
    /\b(only|just|above|over|at least|at most|below|under|less than|more than|greater than|top \d+|first \d+|limit|dofollow|nofollow|do-follow|no-follow|contains|starts with|ends with|excluding|except|not|without|from \.\w+|volume|difficulty|cpc|authority|rank|traffic|position|sorted|sort by|descending|ascending|highest|lowest)\b/i;
  if (!cues.test(message)) return {};

  const fieldMenu = intents
    .map((i) => `  ${i}: [${(INTENT_FIELDS[i] ?? []).join(", ")}]`)
    .join("\n");

  const raw = await getAIResponse({
    system: `You translate a user's natural-language filter request into a structured FilterSpec per intent, so the system can deterministically slice the fetched data.

OUTPUT FORMAT (strict JSON, no prose):
{
  "<intent_name>": {
    "filters": [{"field":"<field>","op":"<op>","value":<value>}, ...],
    "sort": {"field":"<field>","direction":"asc"|"desc"},
    "limit": <number>,
    "fields": ["<field>", ...]    // optional: columns to project
  },
  ...
}

OPS: "=", "!=", ">", "<", ">=", "<=", "contains", "not_contains", "starts_with", "ends_with", "regex", "in", "not_in", "is_null", "is_not_null", "truthy", "falsy"

RULES:
- Only emit an entry for an intent if the user expressed a filter/limit/sort/field-projection for it.
- Field names MUST come from the allowed list per intent below. If no matching field exists, omit that clause.
- Numbers come through as JSON numbers (not strings).
- For "do-follow only" on backlinks: {"field":"dofollow","op":"=","value":true}.
- For "above 30 domain authority" on backlinks: {"field":"domain_authority","op":">","value":30}.
- For "only .edu sources" on backlinks: {"field":"source_domain","op":"ends_with","value":".edu"}.
- For "first 10" or "top 10": {"limit":10}.
- For "sorted by X descending": {"sort":{"field":"X","direction":"desc"}}.
- For "show only X and Y": {"fields":["X","Y"]}.
- If the user describes no filter at all, return {} (empty object).

ALLOWED FIELDS BY INTENT:
${fieldMenu}

EXAMPLE
Input message: "give me backlinks of example.com, only dofollow links above 30 domain authority, top 10, sorted by rank desc"
Output:
{"backlinks":{"filters":[{"field":"dofollow","op":"=","value":true},{"field":"domain_authority","op":">","value":30}],"sort":{"field":"rank","direction":"desc"},"limit":10}}

EXAMPLE
Input message: "keyword ideas for crm, only keywords with volume above 1000 and difficulty below 40, show 20"
Output:
{"keyword_ideas":{"filters":[{"field":"search_volume","op":">","value":1000},{"field":"difficulty","op":"<","value":40}],"limit":20}}

EXAMPLE
Input message: "show all backlinks"
Output:
{}`,
    messages: [
      { role: "user", content: `Message: ${message}\nReturn the JSON now.` },
    ],
    max_tokens: 600,
  });

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as IntentFilterSpecs;
  } catch {
    return {};
  }
}

function applyFiltersToIntentData(
  raw: Record<string, unknown>,
  specs: IntentFilterSpecs
): {
  filteredData: Record<string, unknown>;
  filterSummary: Record<string, { applied: boolean; before: number; after: number }>;
} {
  const out: Record<string, unknown> = {};
  const summary: Record<string, { applied: boolean; before: number; after: number }> = {};

  for (const [intent, response] of Object.entries(raw)) {
    const spec = specs[intent];
    if (!spec || !response || typeof response !== "object") {
      out[intent] = response;
      continue;
    }
    // Deep-clone the response so we can mutate array paths without affecting
    // the original raw_data that we still expose in the API response.
    const cloned = JSON.parse(JSON.stringify(response)) as Record<string, unknown>;

    const path = INTENT_ARRAY_PATH[intent] ?? ["data"];
    const arr = getByPath(cloned, path);

    if (Array.isArray(arr)) {
      const before = arr.length;
      const filtered = applyFilter(arr as unknown[], spec as FilterSpec);
      setByPath(cloned, path, filtered);
      summary[intent] = { applied: true, before, after: filtered.length };
      out[intent] = cloned;
    } else {
      // No array at the expected path — scan one level for any array field.
      const data = (cloned.data ?? cloned) as Record<string, unknown>;
      let anyApplied = false;
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) {
          const filtered = applyFilter(v as unknown[], spec as FilterSpec);
          (data as Record<string, unknown>)[k] = filtered;
          anyApplied = true;
          summary[intent] = { applied: true, before: v.length, after: filtered.length };
        }
      }
      if (!anyApplied) summary[intent] = { applied: false, before: 0, after: 0 };
      out[intent] = cloned;
    }
  }

  return { filteredData: out, filterSummary: summary };
}

function partitionResults(raw: Record<string, unknown>): {
  cleanData: Record<string, unknown>;
  failedIntents: string[];
  failures: IntentFailure[];
  emptyIntents: string[];
} {
  const cleanData: Record<string, unknown> = {};
  const failedIntents: string[] = [];
  const failures: IntentFailure[] = [];
  const emptyIntents: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (v.success === false) {
        failedIntents.push(key);
        const errText = String(v.error ?? "");
        failures.push({
          intent: key,
          reason: errText,
          kind: classifyFailure(errText),
        });
        continue;
      }
      let payload: unknown;
      if ("data" in v) {
        payload = v.data;
      } else {
        const { success: _s, error: _e, provider: _p, tried: _t, ...rest } = v;
        payload = rest;
      }
      if (isEmptyPayload(payload)) {
        emptyIntents.push(key);
      } else {
        cleanData[key] = payload;
      }
    } else if (value !== undefined && value !== null) {
      cleanData[key] = value;
    }
  }

  return { cleanData, failedIntents, failures, emptyIntents };
}

function isEmptyPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return true;
  if (Array.isArray(payload)) return payload.length === 0;
  if (typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  // Common shape: { domain/seed/target, <items-key>: [] }. Empty if every array
  // value in the object is length-0 and there are no informative scalars left.
  const arrayValues = Object.values(obj).filter((v) => Array.isArray(v));
  if (arrayValues.length > 0 && arrayValues.every((arr) => (arr as unknown[]).length === 0)) {
    // Are the remaining non-array values just identifier echoes (domain/seed/target)?
    const informativeScalars = Object.entries(obj).filter(([k, v]) => {
      if (Array.isArray(v)) return false;
      if (["domain", "seed", "target", "competitors", "domains"].includes(k)) return false;
      return v !== null && v !== undefined && v !== "";
    });
    if (informativeScalars.length === 0) return true;
  }
  return false;
}

function classifyFailure(err: string): IntentFailure["kind"] {
  const lower = err.toLowerCase();
  if (
    lower.includes("access denied") ||
    lower.includes("40204") ||
    lower.includes("40101") ||
    lower.includes("40104") ||
    lower.includes("subscription") ||
    lower.includes("401") ||
    lower.includes("403")
  )
    return "access_denied";
  if (lower.includes("failed to reach") || lower.includes("fetch"))
    return "transport";
  if (
    lower.includes("40506") ||
    lower.includes("unknown fields") ||
    lower.includes("required") ||
    lower.includes("bad request") ||
    lower.includes("400")
  )
    return "bad_request";
  if (err) return "upstream";
  return "unknown";
}

const ALL_INTENTS: SEOIntent[] = [
  "keyword_ideas",
  "serp_search",
  "related_keywords",
  "competitor_keywords",
  "keyword_overview",
  "keyword_magic",
  "keyword_strategy",
  "topic_research",
  "domain_overview",
  "organic_rankings",
  "top_pages",
  "compare_domains",
  "keyword_gap",
  "backlinks",
  "referring_domains",
  "backlink_gap",
  "backlink_audit",
  "site_audit",
  "on_page_seo",
  "position_tracking",
  "organic_traffic_insights",
  "sensor",
  "domain_rank",
  "seo_writing_assistant",
  "content_template",
  "link_prospects",
  "log_file_analyzer",
  "internal_links",
  "ai_mode",
];

async function classifyIntentWithAI(
  message: string,
  hasDomain: boolean
): Promise<SEOIntent[]> {
  const raw = await getAIResponse({
    system: `You are an SEO intent router. Given a user's request, pick the best matching intents from the allowed list. Return ONLY a JSON array of intent strings — no prose, no markdown.

ALLOWED INTENTS (must use these exact strings):
${ALL_INTENTS.join(", ")}

Guidance:
- If the user names a website/domain and asks for analysis or overview, use domain_overview (+ organic_rankings, top_pages, backlinks when broad).
- If they ask about keywords for a topic, use keyword_ideas or keyword_magic.
- If they mention "competitors", use competitor_keywords or keyword_gap.
- If they want a content outline/brief, use content_template.
- If they ask to score or audit content they provide, use seo_writing_assistant.
- If they ask about toxic/spammy links, use backlink_audit.
- If they mention traffic over time, use organic_traffic_insights.
- Output 1–4 intents. Smaller is better when the request is focused.

Example input: "give me backlinks list provided by xyz.com"
Example output: ["backlinks"]

Example input: "analytics for example.com"
Example output: ["domain_overview","organic_rankings","top_pages","backlinks"]

Example input: "what's the on page seo of https://foo.com/page"
Example output: ["on_page_seo"]`,
    messages: [
      {
        role: "user",
        content: `Message: ${message}\nDomain(s) detected in message: ${hasDomain ? "yes" : "no"}\nReturn the JSON array now.`,
      },
    ],
    max_tokens: 200,
  });

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is SEOIntent =>
      typeof x === "string" && (ALL_INTENTS as string[]).includes(x)
    );
  } catch {
    return [];
  }
}

async function extractKeyword(message: string): Promise<string> {
  // Strip Slack link wrappers before sending to the AI so the model isn't confused
  // by the <url|display> syntax.
  const sanitized = message
    .replace(/<(https?:\/\/[^|>\s]+)\|[^>]+>/gi, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/gi, "$1");

  const extracted = await getAIResponse({
    system: `Your only job is to extract the core SEO topic from a user's request, so it can be sent to a keyword research API.

RULES:
- Output ONLY the topic phrase, nothing else.
- Keep it 2-5 words typically. Preserve meaningful nouns and adjectives.
- Do NOT shorten words. Do NOT substitute different words.
- Remove filler like "give me", "help me with", "research", "analyze", "please", numbers, quotes, punctuation.
- If the message is only about a domain/URL (no topic), output the domain (lowercase, no scheme, no trailing punctuation).
- Lowercase the output.

EXAMPLES:
Input: Give 10 keywords list of "Create website"
Output: create website
Input: keyword research for email marketing tools
Output: email marketing tools
Input: give me backlinks list of xyz.com website
Output: xyz.com
Input: Analyze this xyz.com website & give me all the competitors list
Output: xyz.com
Input: SEO writing assistant for "best CRM for small business"
Output: best crm for small business
Input: keyword overview of project management software
Output: project management software`,
    messages: [{ role: "user", content: `Input: ${sanitized}\nOutput:` }],
    max_tokens: 50,
  });
  return extracted
    .trim()
    .replace(/^output:\s*/i, "")
    .replace(/^["'`]+|["'`.!?]+$/g, "")
    .toLowerCase()
    .trim();
}

function extractDomains(message: string): string[] {
  const found = new Set<string>();

  // First pre-process Slack's link format <url|display> and <url> → just the URL.
  // This avoids the pipe/angle-bracket characters confusing URL parsing.
  const cleaned = message
    .replace(/<(https?:\/\/[^|>\s]+)\|[^>]+>/gi, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/gi, "$1")
    // Strip trailing punctuation that often glues to the end of bare domains
    // ("foo.com." / "foo.com," / "foo.com)" etc.) before regex matching.
    .replace(/([a-z0-9])[)\]>,;:!?'"]+(\s|$)/gi, "$1$2");

  const urlRe = /https?:\/\/[^\s'"<>)]+/gi;
  const bareRe = /\b((?:[a-z0-9][a-z0-9-]{0,62}\.)+[a-z]{2,24})\b/gi;

  for (const m of cleaned.match(urlRe) ?? []) {
    try {
      found.add(new URL(m).hostname.replace(/^www\./, "").toLowerCase());
    } catch {}
  }

  // Recognized TLDs (broad enough for the common cases users actually use).
  const tldRe =
    /\.(com|net|org|io|co|ai|dev|app|in|uk|us|me|biz|info|edu|gov|tv|store|shop|xyz|cloud|tech|online|site|live|page|blog|art|news|world|club|life|travel)$/i;

  for (const m of cleaned.match(bareRe) ?? []) {
    const candidate = m.toLowerCase().replace(/^www\./, "");
    if (!tldRe.test(candidate)) continue;
    // Skip e-mail-like prefixes (e.g. user@example.com would have caught example.com which is fine,
    // but skip things like "next.config.mjs" — exclude when last segment is too long to be a TLD).
    if (candidate.split(".").pop()!.length > 24) continue;
    found.add(candidate);
  }
  return Array.from(found);
}

async function gatherSEOData(
  intents: SEOIntent[],
  message: string,
  keyword: string,
  domains: string[],
  origin: string,
  provider?: string
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const baseBody = provider ? { provider } : {};

  const fetchRoute = async (route: string, body: object) => {
    const url = `${origin}/api/${route}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody, ...body }),
      });
      const data = await res.json();
      if (!data.success)
        console.error(`[chat] ${url} returned error:`, data.error);
      return data;
    } catch (err) {
      console.error(`[chat] failed to reach ${url}:`, err);
      return {
        success: false,
        error: `Failed to reach ${route} (origin=${origin})`,
      };
    }
  };

  const primaryDomain =
    domains[0] ||
    (keyword.includes(".") ? keyword : null);

  const competitorDomains = domains.slice(1);

  // A "keyword" that contains a dot is a domain the user named — not a topic phrase.
  // Keyword-based endpoints need a topic, so treat it as absent for those cases.
  const hasTopicKeyword = Boolean(keyword) && !keyword.includes(".");
  const topicKeyword = hasTopicKeyword ? keyword : "";

  await Promise.all(
    intents.map(async (intent) => {
      switch (intent) {
        case "keyword_ideas":
          if (hasTopicKeyword)
            results.keyword_ideas = await fetchRoute("keyword-ideas", { keyword: topicKeyword });
          break;
        case "serp_search":
          if (hasTopicKeyword)
            results.serp_search = await fetchRoute("serp-search", { keyword: topicKeyword });
          break;
        case "related_keywords":
          if (hasTopicKeyword)
            results.related_keywords = await fetchRoute("related-keywords", { keyword: topicKeyword });
          break;
        case "keyword_overview":
          if (hasTopicKeyword)
            results.keyword_overview = await fetchRoute("keyword-overview", { keyword: topicKeyword });
          break;
        case "keyword_magic":
          if (hasTopicKeyword)
            results.keyword_magic = await fetchRoute("keyword-magic", { keyword: topicKeyword });
          break;
        case "keyword_strategy":
          if (hasTopicKeyword)
            results.keyword_strategy = await fetchRoute("keyword-strategy", { keyword: topicKeyword });
          break;
        case "topic_research":
          if (hasTopicKeyword)
            results.topic_research = await fetchRoute("topic-research", { keyword: topicKeyword });
          break;
        case "competitor_keywords": {
          const target =
            primaryDomain ||
            `https://${keyword.split(" ").join("")}.com`;
          results.competitor_keywords = await fetchRoute("competitor-keywords", {
            competitor_url: target.startsWith("http") ? target : `https://${target}`,
          });
          break;
        }
        case "domain_overview":
          if (primaryDomain)
            results.domain_overview = await fetchRoute("domain-overview", {
              domain: primaryDomain,
            });
          break;
        case "organic_rankings":
          if (primaryDomain)
            results.organic_rankings = await fetchRoute("organic-rankings", {
              domain: primaryDomain,
            });
          break;
        case "top_pages":
          if (primaryDomain)
            results.top_pages = await fetchRoute("top-pages", { domain: primaryDomain });
          break;
        case "compare_domains":
          if (domains.length >= 2)
            results.compare_domains = await fetchRoute("compare-domains", { domains });
          break;
        case "keyword_gap":
          if (primaryDomain && competitorDomains.length)
            results.keyword_gap = await fetchRoute("keyword-gap", {
              domain: primaryDomain,
              competitors: competitorDomains,
            });
          break;
        case "backlinks":
          if (primaryDomain)
            results.backlinks = await fetchRoute("backlinks", { target: primaryDomain });
          break;
        case "referring_domains":
          if (primaryDomain)
            results.referring_domains = await fetchRoute("referring-domains", {
              target: primaryDomain,
            });
          break;
        case "backlink_gap":
          if (primaryDomain && competitorDomains.length)
            results.backlink_gap = await fetchRoute("backlink-gap", {
              domain: primaryDomain,
              competitors: competitorDomains,
            });
          break;
        case "backlink_audit":
          if (primaryDomain)
            results.backlink_audit = await fetchRoute("backlink-audit", {
              target: primaryDomain,
            });
          break;
        case "site_audit":
          if (primaryDomain)
            results.site_audit = await fetchRoute("site-audit", {
              target: primaryDomain.startsWith("http") ? primaryDomain : `https://${primaryDomain}`,
            });
          break;
        case "on_page_seo": {
          const urlMatch = message.match(/https?:\/\/[^\s'"]+/);
          const url = urlMatch?.[0] || (primaryDomain ? `https://${primaryDomain}` : null);
          if (url) results.on_page_seo = await fetchRoute("on-page-seo", { url });
          break;
        }
        case "position_tracking":
          if (primaryDomain && hasTopicKeyword)
            results.position_tracking = await fetchRoute("position-tracking", {
              domain: primaryDomain,
              keywords: [topicKeyword],
            });
          break;
        case "organic_traffic_insights":
          if (primaryDomain)
            results.organic_traffic_insights = await fetchRoute("organic-traffic-insights", {
              domain: primaryDomain,
            });
          break;
        case "sensor":
          results.sensor = await fetchRoute("sensor", {});
          break;
        case "domain_rank":
          if (primaryDomain)
            results.domain_rank = await fetchRoute("domain-rank", { domain: primaryDomain });
          break;
        case "seo_writing_assistant":
          // Requires explicit content passed via a different entrypoint; skip here
          break;
        case "content_template":
          if (hasTopicKeyword)
            results.content_template = await fetchRoute("content-template", { keyword: topicKeyword });
          break;
        case "link_prospects":
          if (primaryDomain)
            results.link_prospects = await fetchRoute("link-prospects", { seed: primaryDomain });
          break;
        case "log_file_analyzer":
          // Requires uploaded log content; skip from chat flow
          break;
        case "internal_links": {
          const targetUrl = primaryDomain
            ? primaryDomain.startsWith("http")
              ? primaryDomain
              : `https://${primaryDomain}`
            : hasTopicKeyword
              ? `https://${topicKeyword.replace(/\s+/g, "")}`
              : null;
          if (targetUrl)
            results.internal_links = await fetchRoute("internal-links", { url: targetUrl });
          break;
        }
        case "ai_mode":
          if (hasTopicKeyword)
            results.ai_mode = await fetchRoute("ai-mode", { keywords: [topicKeyword] });
          break;
      }
    })
  );

  return results;
}

async function slackAPI(method: string, body: object) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return null;

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`Slack API error (${method}):`, data.error, data);
    throw new Error(`Slack ${method} failed: ${data.error}`);
  }
  return data;
}

async function sendSlackStatus(
  query: string
): Promise<{ ts: string; channel: string } | null> {
  const channelName = process.env.SLACK_DEFAULT_CHANNEL || "seo-reports";

  const res = await slackAPI("chat.postMessage", {
    channel: channelName,
    text: `:hourglass_flowing_sand: Working on: ${query}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:hourglass_flowing_sand:  *Processing your request...*\n>${query.slice(0, 200)}`,
        },
      },
    ],
  });

  if (!res?.ts || !res?.channel) return null;
  const channelId = res.channel;

  await slackAPI("reactions.add", {
    channel: channelId,
    timestamp: res.ts,
    name: "mag",
  }).catch(() => {});

  return { ts: res.ts, channel: channelId };
}

async function sendToSlack(
  report: string,
  query: string,
  slackRef: { ts: string; channel: string }
) {
  const { ts, channel } = slackRef;

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `SEO Report: ${query.slice(0, 100)}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: report.slice(0, 2900),
      },
    },
  ];

  await slackAPI("chat.update", {
    channel,
    ts,
    text: `*SEO Report for:* ${query}`,
    blocks,
  });

  await slackAPI("reactions.remove", {
    channel,
    timestamp: ts,
    name: "mag",
  }).catch(() => {});

  await slackAPI("reactions.add", {
    channel,
    timestamp: ts,
    name: "white_check_mark",
  });
}
