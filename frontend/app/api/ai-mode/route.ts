import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      keywords,
      location,
      language,
      location_code,
      language_code,
      provider,
    } = await req.json();

    if (!keywords) {
      return NextResponse.json(
        { success: false, error: "keywords is required" },
        { status: 400 }
      );
    }

    const list = Array.isArray(keywords) ? keywords : [keywords];

    const result = await callWithFallback(
      (p) =>
        p.searchVolume(list, {
          location,
          language,
          location_code,
          language_code,
        }),
      { preferred: provider, intent: "search_volume" }
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
