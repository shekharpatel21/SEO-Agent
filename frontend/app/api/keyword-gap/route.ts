import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      domain,
      competitors,
      location,
      language,
      location_code,
      language_code,
      limit,
      provider,
    } = await req.json();
    if (!domain || !Array.isArray(competitors) || competitors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "domain and competitors (non-empty array) are required",
        },
        { status: 400 }
      );
    }
    const seed = new URL(
      domain.startsWith("http") ? domain : `https://${domain}`
    ).hostname.replace("www.", "");
    const comps = competitors.map((c: string) =>
      new URL(c.startsWith("http") ? c : `https://${c}`).hostname.replace("www.", "")
    );
    const result = await callWithFallback(
      (p) =>
        p.keywordGap(seed, comps, {
          location,
          language,
          location_code,
          language_code,
          limit,
        }),
      { preferred: provider, intent: "keyword_gap" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { seed, competitors: comps, keywords: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
