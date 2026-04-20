import { NextRequest, NextResponse } from "next/server";
import { callWithFallback } from "@/lib/seo";

export async function POST(req: NextRequest) {
  try {
    const { domain, location, language, location_code, language_code, provider } =
      await req.json();
    if (!domain) {
      return NextResponse.json(
        { success: false, error: "domain is required" },
        { status: 400 }
      );
    }
    const hostname = normalizeDomain(domain);
    const result = await callWithFallback(
      (p) =>
        p.domainOverview(hostname, {
          location,
          language,
          location_code,
          language_code,
        }),
      { preferred: provider, intent: "domain_overview" }
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

function normalizeDomain(input: string): string {
  try {
    return new URL(
      input.startsWith("http") ? input : `https://${input}`
    ).hostname.replace("www.", "");
  } catch {
    return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}
