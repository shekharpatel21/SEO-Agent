"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { SEOIntent } from "@/types";

interface KeywordReportProps {
  content: string;
  query?: string;
  intents?: SEOIntent[];
  domains?: string[];
  keyword?: string;
  filteredData?: Record<string, unknown>;
}

export default function KeywordReport({
  content,
  query,
  intents,
  domains,
  keyword,
  filteredData,
}: KeywordReportProps) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = Boolean(query && intents && filteredData);

  const handleDownload = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const { generatePdfReport } = await import("@/lib/pdf-report");
      generatePdfReport({
        query: query!,
        report: content,
        intents: intents!,
        domains: domains ?? [],
        keyword: keyword ?? "",
        filteredData: filteredData!,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full max-w-full sm:max-w-3xl bg-white border border-gray-200 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 shadow-sm overflow-hidden">
      {canDownload && (
        <div className="flex justify-end -mt-1 mb-3">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 rounded-lg px-2.5 sm:px-3 py-1.5 transition-colors disabled:opacity-50"
            aria-label="Download PDF"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="prose prose-sm prose-gray max-w-none break-words
          prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3 prose-headings:first:mt-0
          prose-h1:text-xl sm:prose-h1:text-2xl
          prose-h2:text-base sm:prose-h2:text-lg prose-h2:border-b prose-h2:border-gray-100 prose-h2:pb-2
          prose-p:text-gray-700 prose-p:leading-relaxed prose-p:text-sm sm:prose-p:text-base
          prose-strong:text-gray-900
          prose-ul:my-2 prose-li:my-0.5 prose-li:text-gray-700
          prose-table:text-xs sm:prose-table:text-sm prose-table:block prose-table:w-full prose-table:overflow-x-auto
          prose-th:bg-gray-50 prose-th:px-2 sm:prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-medium prose-th:text-gray-600 prose-th:whitespace-nowrap
          prose-td:px-2 sm:prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-gray-100
          prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:break-words
          prose-pre:overflow-x-auto prose-pre:text-xs
          prose-a:break-words
          prose-img:max-w-full prose-img:h-auto
        ">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
