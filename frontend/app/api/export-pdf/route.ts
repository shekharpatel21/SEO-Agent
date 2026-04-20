import { NextRequest, NextResponse } from "next/server";
import { buildPdfDoc, pdfFilename, type PdfReportInput } from "@/lib/pdf-report";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<PdfReportInput>;

    if (!body.query || !body.report || !Array.isArray(body.intents)) {
      return NextResponse.json(
        { success: false, error: "query, report, and intents are required" },
        { status: 400 }
      );
    }

    const doc = buildPdfDoc({
      query: body.query,
      report: body.report,
      intents: body.intents,
      domains: body.domains ?? [],
      keyword: body.keyword ?? "",
      filteredData: body.filteredData ?? {},
    });

    const buffer = Buffer.from(doc.output("arraybuffer"));
    const filename = pdfFilename(body.query);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
