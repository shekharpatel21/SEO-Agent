import { NextRequest, NextResponse } from "next/server";
import { getAIResponse } from "@/lib/ai";
import { getSeoProvider } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      content,
      target_keyword,
      location,
      language,
      location_code,
      language_code,
      provider,
    } = await req.json();

    if (!content || !target_keyword) {
      return NextResponse.json(
        { success: false, error: "content and target_keyword are required" },
        { status: 400 }
      );
    }

    const seo = getSeoProvider(provider);
    const [related, serp] = await Promise.all([
      seo
        .relatedKeywords(target_keyword, {
          location,
          language,
          location_code,
          language_code,
          limit: 20,
        })
        .catch(() => []),
      seo
        .serpSearch(target_keyword, {
          location,
          language,
          location_code,
          language_code,
        })
        .catch(() => []),
    ]);

    const analysis = await getAIResponse({
      system: `You are an SEO content auditor. Score the content from 0-100 across three dimensions (overall, readability, SEO), identify tone, and surface issues with concrete fixes.

OUTPUT FORMAT (strict JSON, no preamble):
{"overall_score": <0-100>, "readability_score": <0-100>, "seo_score": <0-100>, "tone": "<formal|casual|technical|...>", "issues": [{"type": "<readability|keyword|structure|meta>", "message": "<brief>", "suggestion": "<concrete fix>"}]}`,
      messages: [
        {
          role: "user",
          content: `Target keyword: ${target_keyword}

Related keywords (for semantic coverage): ${related
            .slice(0, 15)
            .map((r) => r.keyword)
            .join(", ")}

Top SERP competitors: ${serp
            .slice(0, 5)
            .map((s) => `${s.domain} - ${s.title}`)
            .join("\n")}

Content to audit:
"""
${content.slice(0, 8000)}
"""

Return ONLY the JSON object.`,
        },
      ],
      max_tokens: 1500,
    });

    let parsed: Record<string, unknown>;
    try {
      const cleaned = analysis.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        overall_score: 50,
        readability_score: 50,
        seo_score: 50,
        tone: null,
        issues: [{ type: "parse", message: "AI returned non-JSON", suggestion: analysis.slice(0, 200) }],
      };
    }

    return NextResponse.json({
      success: true,
      provider: seo.name,
      data: {
        content,
        target_keyword,
        ...parsed,
        related_keywords: related.slice(0, 15).map((r) => r.keyword),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
