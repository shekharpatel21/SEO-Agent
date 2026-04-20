import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      keyword,
      location,
      language,
      location_code,
      language_code,
      limit,
      provider,
    } = await req.json();
    if (!keyword) {
      return NextResponse.json(
        { success: false, error: "keyword is required" },
        { status: 400 }
      );
    }
    const result = await callWithFallback(
      (p) =>
        p.keywordMagic(keyword, {
          location,
          language,
          location_code,
          language_code,
          limit,
        }),
      { preferred: provider, intent: "keyword_magic" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: result.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
