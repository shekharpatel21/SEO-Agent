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
      (p) => p.backlinkAudit(target, { limit }),
      { preferred: provider, intent: "backlink_audit" }
    );
    const items = result.data;
    const toxic = items.filter((i) => (i.spam_score ?? 0) > 50);
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: {
        target,
        summary: {
          total: items.length,
          toxic: toxic.length,
          avg_spam_score: items.length
            ? items.reduce((s, i) => s + (i.spam_score ?? 0), 0) / items.length
            : 0,
        },
        items,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
