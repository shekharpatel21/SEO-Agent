import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { target, provider } = await req.json();
    if (!target) {
      return NextResponse.json(
        { success: false, error: "target (URL or domain) is required" },
        { status: 400 }
      );
    }
    const url = target.startsWith("http") ? target : `https://${target}`;
    const result = await callWithFallback(
      (p) => p.siteAudit(url),
      { preferred: provider, intent: "site_audit" }
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
