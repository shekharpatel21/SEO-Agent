import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { target, limit, provider } = await req.json();
    if (!target) {
      return NextResponse.json(
        { success: false, error: "target (domain or URL) is required" },
        { status: 400 }
      );
    }
    const result = await callWithFallback(
      (p) => p.referringDomains(target, { limit }),
      { preferred: provider, intent: "referring_domains" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { target, referring_domains: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
