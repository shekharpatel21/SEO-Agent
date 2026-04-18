// Shared, platform-agnostic query handler.
// All platform adapters (Slack, Discord, Telegram, Teams, web widget, …)
// call handleQuery() — they only translate platform-specific message shapes
// and formatting. The SEO pipeline lives in exactly one place.

const activity = require("./activity");

const CHAT_API =
  process.env.CHAT_API_URL || "http://localhost:3000/api/chat";
const PDF_API =
  process.env.PDF_API_URL ||
  CHAT_API.replace(/\/api\/chat\/?$/, "/api/export-pdf");

function humanizeError(errorMessage) {
  const msg = String(errorMessage || "").trim();
  if (!msg) return "The backend returned an empty response. Please retry in a moment.";
  if (/unexpected token|is not valid json|json.parse/i.test(msg))
    return "The backend returned an unexpected non-JSON response — it may be restarting. Please retry.";
  if (/internal server error/i.test(msg))
    return "The backend hit an internal error. Please retry; if it keeps happening, check the server logs.";
  if (/access denied|subscription|40204|40101|40104/i.test(msg))
    return "One of the data-provider subscriptions is not active. Activate it in your DataForSEO account and retry.";
  if (/failed to reach|econnrefused|network|fetch failed/i.test(msg))
    return "Could not reach the backend. Check that the Next.js server is running and `CHAT_API_URL` points to it.";
  if (/timeout|timed out/i.test(msg))
    return "The backend took too long to respond. Please retry.";
  if (/rate limit|429|too many requests/i.test(msg))
    return "The data provider rate-limited this request. Wait a minute and retry.";
  const short = msg.replace(/\s+/g, " ").slice(0, 160);
  return `The backend returned an error: ${short}${msg.length > 160 ? "…" : ""}`;
}

function cleanHtmlSnippet(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

async function postChatWithRetry(body, signal) {
  const attempts = 2;
  let lastProblem = null;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await res.text();
    const looksLikeHtml = raw.trimStart().startsWith("<");
    if (!looksLikeHtml) {
      try {
        return { data: JSON.parse(raw), status: res.status };
      } catch {
        lastProblem = { status: res.status, snippet: raw.replace(/\s+/g, " ").slice(0, 240) };
      }
    } else {
      lastProblem = { status: res.status, snippet: cleanHtmlSnippet(raw) };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  const err = new Error(
    `The backend returned a non-JSON response (HTTP ${lastProblem.status}). Details: ${lastProblem.snippet}`
  );
  err.userFacing = `The backend is temporarily unavailable (HTTP ${lastProblem.status}). Please retry in a moment.`;
  throw err;
}

async function fetchPdfBuffer({ query, report, meta }) {
  const res = await fetch(PDF_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      report,
      intents: meta?.intents ?? [],
      domains: meta?.domains ?? [],
      keyword: meta?.keyword ?? "",
      filteredData: meta?.filteredData ?? {},
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PDF API ${res.status}: ${text.slice(0, 200)}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

function safeFilename(query) {
  return (query || "seo-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "seo-report";
}

// Primary entry used by every adapter.
// Returns { report, meta, pdfBuffer, filename }.
// onStatus(msg) is invoked once before the chat API call so adapters can
// post a "working on it" placeholder the user sees immediately.
// adapter + user are optional identifiers recorded in the activity log.
async function handleQuery(query, { signal, onStatus, adapter, user } = {}) {
  const startedAt = Date.now();
  const logBase = { kind: "query", adapter, user, query: (query || "").slice(0, 200) };

  if (!query || !query.trim()) {
    const err = new Error("Empty query");
    err.userFacing = "Ask me something like: _give me 10 keywords for AI agent automation_";
    activity.record({ ...logBase, success: false, error: "empty_query", durationMs: 0 });
    throw err;
  }
  if (onStatus) {
    try { await onStatus(`Working on: ${query}`); } catch {}
  }

  try {
    const { data } = await postChatWithRetry(
      { message: query, skipSlack: true },
      signal
    );
    if (!data.success) {
      const err = new Error(data.error || "Unknown error");
      err.userFacing = humanizeError(data.error);
      throw err;
    }

    const report = data.report;
    const meta = {
      intents: data.intents,
      domains: data.domains,
      keyword: data.keyword,
      filteredData: data.filtered_data,
    };

    let pdfBuffer = null;
    try {
      pdfBuffer = await fetchPdfBuffer({ query, report, meta });
    } catch (err) {
      console.error("[core] PDF generation failed:", err.message);
    }

    activity.record({
      ...logBase,
      success: true,
      pdf: Boolean(pdfBuffer),
      durationMs: Date.now() - startedAt,
    });

    return {
      report,
      meta,
      pdfBuffer,
      filename: `${safeFilename(query)}.pdf`,
    };
  } catch (err) {
    activity.record({
      ...logBase,
      success: false,
      error: (err.userFacing || err.message || "unknown").slice(0, 240),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

module.exports = {
  handleQuery,
  humanizeError,
  safeFilename,
};
