// Backwards-compat shim. Prefer `import { getSeoProvider } from "@/lib/seo"`.
// This keeps raw DataForSEO access available for code that needs a direct endpoint.

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

function getAuthHeader(): string {
  const username = process.env.DATAFORSEO_USERNAME;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "DataForSEO credentials missing. Set DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD in .env.local"
    );
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function dataForSEORequest(endpoint: string, body: object) {
  const response = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify([body]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `DataForSEO error: ${response.status} ${response.statusText} — ${text}`
    );
  }

  return response.json();
}
