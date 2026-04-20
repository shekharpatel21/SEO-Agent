import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { seed, limit, provider } = await req.json();
    if (!seed) {
      return NextResponse.json(
        { success: false, error: "seed (domain) is required" },
        { status: 400 }
      );
    }
    const result = await callWithFallback(
      (p) => p.linkProspects(seed, { limit }),
      { preferred: provider, intent: "link_prospects" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { seed, prospects: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
