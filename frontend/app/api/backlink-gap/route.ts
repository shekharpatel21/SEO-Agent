import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { domain, competitors, limit, provider } = await req.json();
    if (!domain || !Array.isArray(competitors) || competitors.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "domain and competitors (non-empty array) are required",
        },
        { status: 400 }
      );
    }
    const result = await callWithFallback(
      (p) => p.backlinkGap(domain, competitors, { limit }),
      { preferred: provider, intent: "backlink_gap" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { seed: domain, competitors, opportunities: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
