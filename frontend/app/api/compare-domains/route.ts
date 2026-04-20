import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const {
      domains,
      location,
      language,
      location_code,
      language_code,
      limit,
      provider,
    } = await req.json();
    if (!Array.isArray(domains) || domains.length < 2) {
      return NextResponse.json(
        { success: false, error: "domains (array of >= 2 entries) is required" },
        { status: 400 }
      );
    }
    const normalized = domains.map((d: string) =>
      new URL(d.startsWith("http") ? d : `https://${d}`).hostname.replace("www.", "")
    );
    const result = await callWithFallback(
      (p) =>
        p.compareDomains(normalized, {
          location,
          language,
          location_code,
          language_code,
          limit,
        }),
      { preferred: provider, intent: "compare_domains" }
    );
    return NextResponse.json({
      success: true,
      provider: result.provider,
      tried: result.tried,
      data: { domains: normalized, intersection: result.data },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
