import { NextRequest, NextResponse } from "next/server";
import { getAIResponse } from "@/lib/ai";
import { getSeoProvider } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      keyword,
      location,
      language,
      location_code,
      language_code,
      provider,
    } = await req.json();

    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "keyword is required" },
        { status: 400 }
      );
    }

    const seo = getSeoProvider(provider);
    const [serp, related, overview] = await Promise.all([
      seo
        .serpSearch(keyword, {
          location,
          language,
          location_code,
          language_code,
        })
        .catch(() => []),
      seo
        .relatedKeywords(keyword, {
          location,
          language,
          location_code,
          language_code,
          limit: 30,
        })
        .catch(() => []),
      seo
        .keywordOverview(keyword, {
          location,
          language,
          location_code,
          language_code,
        })
        .catch(() => null),
    ]);

    const titleSuggestions = await getAIResponse({
      system: `You generate 5 concise, compelling SEO title suggestions for a given keyword. Output ONLY a JSON array of strings.`,
      messages: [
        {
          role: "user",
          content: `Keyword: "${keyword}"
Reference titles from top SERP:
${serp.slice(0, 8).map((s, i) => `${i + 1}. ${s.title}`).join("\n")}

Return a JSON array of 5 title suggestions.`,
        },
      ],
      max_tokens: 600,
    }).catch(() => "[]");

    let titles: string[] = [];
    try {
      titles = JSON.parse(titleSuggestions.replace(/```json|```/g, "").trim());
      if (!Array.isArray(titles)) titles = [];
    } catch {
      titles = [];
    }

    const topUrls = serp.slice(0, 10).map((s) => s.url);
    const top3Volumes = serp
      .slice(0, 3)
      .map((_, idx) => overview?.search_volume ?? null)
      .filter((v): v is number => v !== null);
    const avgVolume = top3Volumes.length
      ? top3Volumes.reduce((a, b) => a + b, 0) / top3Volumes.length
      : null;

    // Rough recommended word count heuristic: base 1200 + 100 per listed related keyword
    const recommendedWordCount = Math.min(3000, 1200 + related.length * 40);

    return NextResponse.json({
      success: true,
      provider: seo.name,
      data: {
        target_keyword: keyword,
        recommended_word_count: recommendedWordCount,
        recommended_keywords: related
          .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
          .slice(0, 20)
          .map((r) => r.keyword),
        recommended_backlinks: avgVolume ? Math.ceil(avgVolume / 5000) : null,
        readability_score: null,
        top_serp_urls: topUrls,
        title_suggestions: titles,
        overview,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
