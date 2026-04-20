import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      domain,
      location,
      language,
      location_code,
      language_code,
      limit,
      provider,
    } = await req.json();
    if (!domain) {
      return NextResponse.json(
        { success: false, error: "domain is required" },
        { status: 400 }
      );
    }
    const hostname = new URL(
      domain.startsWith("http") ? domain : `https://${domain}`
    ).hostname.replace("www.", "");
    const result = await callWithFallback(
      (p) =>
        p.topPages(hostname, {
          location,
          language,
          location_code,
          language_code,
          limit,
        }),
      { preferred: provider, intent: "top_pages" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { domain: hostname, pages: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
