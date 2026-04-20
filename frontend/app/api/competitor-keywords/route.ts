import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      competitor_url,
      location,
      language,
      location_code,
      language_code,
      provider,
    } = await req.json();

    if (!competitor_url) {
      return NextResponse.json(
        { success: false, error: "competitor_url is required" },
        { status: 400 }
      );
    }

    const domain = new URL(
      competitor_url.startsWith("http") ? competitor_url : `https://${competitor_url}`
    ).hostname.replace("www.", "");

    const result = await callWithFallback(
      (p) =>
        p.competitorKeywords(domain, {
          location,
          language,
          location_code,
          language_code,
          limit: 50,
        }),
      { preferred: provider, intent: "competitor_keywords" }
    );

    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { domain, keywords: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
