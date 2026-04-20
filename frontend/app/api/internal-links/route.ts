import { NextRequest, NextResponse } from "next/server";

interface ScrapeResult {
  success: boolean;
  markdown: string | null;
  html: string | null;
  processingTime: number;
  error?: string;
  enhancedError?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const {
      url,
      mode = "beast",
      query = "",
    } = await req.json();

    if (!url) {
      return NextResponse.json(
        { success: false, error: "url is required" },
        { status: 400 }
      );
    }

    // Import the scraper dynamically (uses Playwright, server-only)
    const { scrapeWithStreaming } = await import("@/lib/scraper/WebScraper.js");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: ScrapeResult = await (scrapeWithStreaming as any)(
      url,
      undefined,
      query,
      mode,
      undefined
    );

    if (!result || !result.success) {
      return NextResponse.json(
        { success: false, error: result?.error || "Scraping failed" },
        { status: 500 }
      );
    }

    // Extract internal links from the markdown content
    const markdown = result.markdown || "";
    const links: { text: string; url: string }[] = [];
    const seen = new Set<string>();

    // Parse base domain
    let baseDomain: string;
    try {
      baseDomain = new URL(url).hostname.replace("www.", "");
    } catch {
      baseDomain = "";
    }

    // Extract links from markdown [text](url) format
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(markdown)) !== null) {
      const linkUrl = match[2];
      try {
        const linkDomain = new URL(linkUrl).hostname.replace("www.", "");
        if (linkDomain === baseDomain && !seen.has(linkUrl)) {
          seen.add(linkUrl);
          links.push({ text: match[1], url: linkUrl });
        }
      } catch {
        // skip malformed URLs
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        scraped_url: url,
        content_length: markdown.length,
        internal_links: links,
        content: markdown,
        processing_time: result.processingTime,
        mode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
