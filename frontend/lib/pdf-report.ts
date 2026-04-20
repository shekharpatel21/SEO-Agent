import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import type { SEOIntent } from "@/types";

// ─── Color palette ──────────────────────────────────────
// Calm, professional palette picked for screen + print readability.
// A single accent is reused so the document feels cohesive instead of rainbowed.
const COLOR = {
  accent: [79, 70, 229] as [number, number, number],       // indigo-600
  accentLight: [238, 242, 255] as [number, number, number],// indigo-50
  ink: [17, 24, 39] as [number, number, number],           // gray-900
  body: [55, 65, 81] as [number, number, number],          // gray-700
  muted: [107, 114, 128] as [number, number, number],      // gray-500
  divider: [229, 231, 235] as [number, number, number],    // gray-200
  good: [16, 185, 129] as [number, number, number],        // emerald-500
  warn: [245, 158, 11] as [number, number, number],        // amber-500
  bad: [239, 68, 68] as [number, number, number],          // red-500
  white: [255, 255, 255] as [number, number, number],
};

const INTENT_LABEL: Record<SEOIntent, string> = {
  keyword_ideas: "Keyword Ideas",
  serp_search: "SERP Results",
  related_keywords: "Related Keywords",
  competitor_keywords: "Competitor Keywords",
  keyword_overview: "Keyword Overview",
  keyword_magic: "Keyword Magic",
  keyword_strategy: "Keyword Strategy",
  topic_research: "Topic Research",
  domain_overview: "Domain Overview",
  organic_rankings: "Organic Rankings",
  top_pages: "Top Pages",
  compare_domains: "Domain Comparison",
  keyword_gap: "Keyword Gap",
  backlinks: "Backlinks",
  referring_domains: "Referring Domains",
  backlink_gap: "Backlink Gap",
  backlink_audit: "Backlink Audit",
  site_audit: "Site Audit",
  on_page_seo: "On-Page SEO",
  position_tracking: "Position Tracking",
  organic_traffic_insights: "Organic Traffic Insights",
  sensor: "SERP Sensor",
  domain_rank: "Domain Rank",
  seo_writing_assistant: "SEO Writing Assistant",
  content_template: "Content Template",
  link_prospects: "Link Prospects",
  log_file_analyzer: "Log File Analysis",
  internal_links: "Internal Links",
  ai_mode: "Search Volume",
};

// Per-intent table shape: which columns to show and where to find them in the
// records array buried in raw_data[intent]. Keys not found become "—".
const TABLE_CONFIG: Partial<
  Record<
    SEOIntent,
    {
      path: string[];                 // path from intent root to the array
      columns: Array<{ header: string; field: string; align?: "left" | "right" }>;
    }
  >
> = {
  keyword_ideas: {
    path: ["data"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "CPC", field: "cpc", align: "right" },
      { header: "Difficulty", field: "difficulty", align: "right" },
      { header: "Intent", field: "intent" },
    ],
  },
  related_keywords: {
    path: ["data"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "CPC", field: "cpc", align: "right" },
      { header: "Competition", field: "competition" },
    ],
  },
  competitor_keywords: {
    path: ["data", "keywords"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "Difficulty", field: "difficulty", align: "right" },
      { header: "Intent", field: "intent" },
    ],
  },
  keyword_magic: {
    path: ["data"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "Difficulty", field: "difficulty", align: "right" },
      { header: "Intent", field: "intent" },
    ],
  },
  serp_search: {
    path: ["data"],
    columns: [
      { header: "#", field: "rank", align: "right" },
      { header: "Title", field: "title" },
      { header: "Domain", field: "domain" },
    ],
  },
  organic_rankings: {
    path: ["data", "keywords"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Pos", field: "position", align: "right" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "Traffic", field: "traffic", align: "right" },
      { header: "URL", field: "url" },
    ],
  },
  top_pages: {
    path: ["data", "pages"],
    columns: [
      { header: "URL", field: "url" },
      { header: "Traffic", field: "traffic", align: "right" },
      { header: "Keywords", field: "keywords_count", align: "right" },
      { header: "Top KW", field: "top_keyword" },
    ],
  },
  backlinks: {
    path: ["data", "backlinks"],
    columns: [
      { header: "Source Domain", field: "source_domain" },
      { header: "Anchor", field: "anchor" },
      { header: "Dofollow", field: "dofollow" },
      { header: "DR", field: "rank", align: "right" },
    ],
  },
  referring_domains: {
    path: ["data", "referring_domains"],
    columns: [
      { header: "Domain", field: "domain" },
      { header: "Backlinks", field: "backlinks", align: "right" },
      { header: "Rank", field: "rank", align: "right" },
      { header: "First Seen", field: "first_seen" },
    ],
  },
  backlink_audit: {
    path: ["data", "items"],
    columns: [
      { header: "Source", field: "source_domain" },
      { header: "Spam", field: "spam_score", align: "right" },
      { header: "Toxic", field: "toxic_score", align: "right" },
      { header: "Reason", field: "reason" },
    ],
  },
  keyword_gap: {
    path: ["data", "keywords"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Volume", field: "search_volume", align: "right" },
      { header: "Difficulty", field: "difficulty", align: "right" },
    ],
  },
  position_tracking: {
    path: ["data", "rankings"],
    columns: [
      { header: "Keyword", field: "keyword" },
      { header: "Pos", field: "position", align: "right" },
      { header: "Δ", field: "change", align: "right" },
      { header: "URL", field: "url" },
    ],
  },
  topic_research: {
    path: ["data", "topics"],
    columns: [
      { header: "Topic", field: "topic" },
      { header: "Keywords", field: "keywords" },
    ],
  },
  keyword_strategy: {
    path: ["data", "clusters"],
    columns: [
      { header: "Cluster", field: "cluster" },
      { header: "Keywords", field: "keywords" },
    ],
  },
  link_prospects: {
    path: ["data", "prospects"],
    columns: [
      { header: "Domain", field: "domain" },
      { header: "Rank", field: "rank", align: "right" },
      { header: "Relevance", field: "relevance", align: "right" },
    ],
  },
};

function getByPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.slice(0, 4).map((v) => String(v)).join(", ") +
      (value.length > 4 ? `, +${value.length - 4} more` : "");
  }
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  const s = String(value);
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}

export interface PdfReportInput {
  query: string;
  report: string;                              // markdown
  intents: SEOIntent[];
  domains: string[];
  keyword: string;
  filteredData: Record<string, unknown>;       // from chat API
}

export function buildPdfDoc(input: PdfReportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;

  drawCoverHeader(doc, input, pageW);

  let y = 190;

  y = drawSummaryCard(doc, input, margin, y, pageW);
  y += 18;

  y = drawMarkdownBody(doc, input.report, margin, y, pageW);

  // One table per intent that has tabular data in filteredData.
  for (const intent of input.intents) {
    const cfg = TABLE_CONFIG[intent];
    if (!cfg) continue;
    const intentRoot = (input.filteredData as Record<string, unknown>)[intent];
    if (!intentRoot) continue;
    const rows = getByPath(intentRoot, cfg.path);
    if (!Array.isArray(rows) || rows.length === 0) continue;

    y = ensureSpace(doc, y, 120, pageW);
    y = drawSectionHeading(doc, INTENT_LABEL[intent] ?? intent, margin, y, pageW);

    autoTable(doc, {
      startY: y,
      head: [cfg.columns.map((c) => c.header)],
      body: rows.slice(0, 50).map((row) =>
        cfg.columns.map((c) => formatCell((row as Record<string, unknown>)[c.field]))
      ) as RowInput[],
      theme: "grid",
      margin: { left: margin, right: margin },
      tableWidth: "auto",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6,
        textColor: COLOR.body,
        lineColor: COLOR.divider,
        lineWidth: 0.5,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: COLOR.accent,
        textColor: COLOR.white,
        fontStyle: "bold",
        fontSize: 9,
        halign: "left",
      },
      alternateRowStyles: { fillColor: COLOR.accentLight },
      // Numeric columns (right-aligned) get a fixed narrow width so text columns
      // like "Keyword" don't get squeezed and wrap their header into "Keywo rd".
      columnStyles: Object.fromEntries(
        cfg.columns.map((c, i) => [
          i,
          c.align === "right"
            ? { halign: "right", cellWidth: 52 }
            : { halign: "left", cellWidth: "auto", minCellWidth: 60 },
        ])
      ),
      didDrawPage: () => drawFooter(doc, pageW, pageH),
    });

    // @ts-expect-error - autoTable attaches lastAutoTable at runtime
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  }

  drawFooter(doc, pageW, pageH);

  return doc;
}

export function pdfFilename(query: string): string {
  const safe = (query || "seo-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${safe || "seo-report"}.pdf`;
}

export function generatePdfReport(input: PdfReportInput) {
  const doc = buildPdfDoc(input);
  doc.save(pdfFilename(input.query));
}

function drawCoverHeader(
  doc: jsPDF,
  input: PdfReportInput,
  pageW: number
) {
  // Solid accent band across the top — gives the doc a branded feel.
  doc.setFillColor(...COLOR.accent);
  doc.rect(0, 0, pageW, 150, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.white);
  doc.text("SEO AGENT", 48, 48);

  doc.setFontSize(22);
  doc.text("SEO Research Report", 48, 84);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const subtitle = input.query.length > 90
    ? input.query.slice(0, 87) + "…"
    : input.query;
  doc.text(subtitle, 48, 108);

  doc.setFontSize(9);
  doc.setTextColor(220, 220, 255);
  doc.text(
    `Generated ${new Date().toLocaleString()}`,
    48,
    132
  );
}

function drawSummaryCard(
  doc: jsPDF,
  input: PdfReportInput,
  x: number,
  y: number,
  pageW: number
): number {
  const w = pageW - x * 2;
  const h = 70;

  doc.setFillColor(...COLOR.accentLight);
  doc.setDrawColor(...COLOR.divider);
  doc.roundedRect(x, y, w, h, 6, 6, "FD");

  const cellW = w / 3;
  const items: Array<[string, string]> = [
    ["Target", input.domains[0] || (input.keyword && !input.keyword.includes(".") ? input.keyword : "—")],
    ["Sections", String(input.intents.length)],
    ["Data rows", String(countRows(input.filteredData))],
  ];

  items.forEach(([label, value], i) => {
    const cx = x + cellW * i + 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.muted);
    doc.text(label.toUpperCase(), cx, y + 24);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLOR.ink);
    const truncated = value.length > 28 ? value.slice(0, 25) + "…" : value;
    doc.text(truncated, cx, y + 48);
  });

  return y + h;
}

function countRows(data: Record<string, unknown>): number {
  let total = 0;
  for (const v of Object.values(data)) {
    if (!v || typeof v !== "object") continue;
    const inner = (v as Record<string, unknown>).data ?? v;
    if (Array.isArray(inner)) { total += inner.length; continue; }
    if (inner && typeof inner === "object") {
      for (const nested of Object.values(inner)) {
        if (Array.isArray(nested)) total += nested.length;
      }
    }
  }
  return total;
}

function drawSectionHeading(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  pageW: number
): number {
  // Left accent bar + heading text, gives a clear visual anchor.
  doc.setFillColor(...COLOR.accent);
  doc.rect(x, y - 2, 3, 18, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLOR.ink);
  doc.text(text, x + 12, y + 12);

  // Soft divider under it
  doc.setDrawColor(...COLOR.divider);
  doc.setLineWidth(0.5);
  doc.line(x, y + 22, pageW - x, y + 22);

  return y + 34;
}

// Minimal markdown renderer — handles headings (#/##/###), bullets (-,*,+),
// bold (**x**), and paragraphs. Tables in markdown are skipped on purpose —
// structured data is rendered via autoTable from filteredData instead.
function drawMarkdownBody(
  doc: jsPDF,
  md: string,
  x: number,
  y: number,
  pageW: number
): number {
  const maxW = pageW - x * 2;
  const lines = md.split("\n");
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");

    // Skip markdown tables — the structured tables render them cleaner.
    if (/^\s*\|/.test(line)) { inTable = true; continue; }
    if (inTable && line.trim() === "") { inTable = false; continue; }
    if (inTable) continue;

    if (line.trim() === "") { y += 6; continue; }

    // Headings
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    if (h1 || h2 || h3) {
      y = ensureSpace(doc, y, 40, pageW);
      if (h1) {
        y = drawSectionHeading(doc, h1[1], x, y + 6, pageW);
      } else if (h2) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...COLOR.ink);
        doc.text(h2[1], x, y + 14);
        y += 22;
      } else if (h3) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR.accent);
        doc.text(h3[1], x, y + 12);
        y += 18;
      }
      continue;
    }

    // Bullets
    const bullet = line.match(/^\s*[-*+]\s+(.*)/);
    if (bullet) {
      y = writeBullet(doc, bullet[1], x, y, maxW, pageW);
      continue;
    }

    // Numbered list
    const numbered = line.match(/^\s*\d+\.\s+(.*)/);
    if (numbered) {
      y = writeBullet(doc, numbered[1], x, y, maxW, pageW, true);
      continue;
    }

    // Paragraph
    y = writeParagraph(doc, line, x, y, maxW, pageW);
  }

  return y;
}

function writeBullet(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  pageW: number,
  numbered = false
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.body);

  const stripped = stripInline(text);
  const indent = 16;
  const lines = doc.splitTextToSize(stripped, maxW - indent) as string[];

  y = ensureSpace(doc, y, 16 + (lines.length - 1) * 14, pageW);

  // Accent-colored bullet
  doc.setFillColor(...COLOR.accent);
  if (numbered) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR.accent);
    doc.text("•", x + 2, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLOR.body);
  } else {
    doc.circle(x + 4, y + 7, 2, "F");
  }

  doc.text(lines, x + indent, y + 11);
  return y + 6 + lines.length * 14;
}

function writeParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  pageW: number
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.body);

  const stripped = stripInline(text);
  const lines = doc.splitTextToSize(stripped, maxW) as string[];
  y = ensureSpace(doc, y, lines.length * 14, pageW);
  doc.text(lines, x, y + 11);
  return y + 4 + lines.length * 14;
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  pageW: number
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 60) {
    drawFooter(doc, pageW, pageH);
    doc.addPage();
    return 56;
  }
  return y;
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number) {
  doc.setDrawColor(...COLOR.divider);
  doc.setLineWidth(0.5);
  doc.line(48, pageH - 36, pageW - 48, pageH - 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.muted);
  doc.text("SEO Agent", 48, pageH - 20);

  const pageNum = doc.getCurrentPageInfo().pageNumber;
  const pageCount = doc.getNumberOfPages();
  const label = `Page ${pageNum} of ${pageCount}`;
  doc.text(label, pageW - 48, pageH - 20, { align: "right" });
}
