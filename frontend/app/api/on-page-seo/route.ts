import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { url, provider } = await req.json();
    if (!url) {
      return NextResponse.json(
        { success: false, error: "url is required" },
        { status: 400 }
      );
    }
    const cleaned = url.startsWith("http") ? url : `https://${url}`;
    const result = await callWithFallback(
      (p) => p.onPageSeoCheck(cleaned),
      { preferred: provider, intent: "on_page_seo" }
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
