"use client";

import { useState } from "react";

export default function ApiKeySetup() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
      >
        Setup Guide
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 sticky top-0 bg-white -mt-2 pt-2 pb-2 -mx-5 sm:-mx-6 px-5 sm:px-6 z-10">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  Setup Guide
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4 text-sm text-gray-700">
                <section>
                  <h3 className="font-medium text-gray-900 mb-1">
                    1. SEO Data Provider (Pick one)
                  </h3>
                  <p className="text-gray-600 mb-1">
                    Set{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
                      SEO_PROVIDER
                    </code>{" "}
                    to <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">dataforseo</code>,{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">semrush</code>, or{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">ahrefs</code>, then fill the matching credentials.
                  </p>
                  <ul className="space-y-1 text-gray-600">
                    <li>
                      <strong>DataForSEO:</strong>{" "}
                      <a href="https://dataforseo.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        dataforseo.com
                      </a>{" "}— username + password
                    </li>
                    <li>
                      <strong>SEMrush:</strong>{" "}
                      <a href="https://www.semrush.com/api-analytics/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        semrush.com/api-analytics
                      </a>{" "}— API key
                    </li>
                    <li>
                      <strong>Ahrefs:</strong>{" "}
                      <a href="https://ahrefs.com/api/v3" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        ahrefs.com/api
                      </a>{" "}— API token
                    </li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-medium text-gray-900 mb-1">
                    2. AI Provider (Pick one)
                  </h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>
                      <strong>OpenAI:</strong>{" "}
                      <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        platform.openai.com
                      </a>
                    </li>
                    <li>
                      <strong>Gemini:</strong>{" "}
                      <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        makersuite.google.com
                      </a>
                    </li>
                    <li>
                      <strong>Claude:</strong>{" "}
                      <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        console.anthropic.com
                      </a>
                    </li>
                  </ul>
                  <p className="mt-1 text-gray-500">
                    Set <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">AI_PROVIDER</code> and the matching API key.
                  </p>
                </section>

                <section>
                  <h3 className="font-medium text-gray-900 mb-1">
                    3. Browser Scraping (Optional)
                  </h3>
                  <p className="text-gray-600">
                    For JS-heavy sites, install Playwright:{" "}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                      npm run scraper:install
                    </code>
                  </p>
                </section>

                <section>
                  <h3 className="font-medium text-gray-900 mb-1">
                    4. Example .env.local
                  </h3>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`# Pick one: dataforseo | semrush | ahrefs
SEO_PROVIDER=dataforseo

# DataForSEO
DATAFORSEO_USERNAME=your_username
DATAFORSEO_PASSWORD=your_password

# SEMrush
SEMRUSH_API_KEY=your_key

# Ahrefs
AHREFS_API_TOKEN=your_token

AI_PROVIDER=openai
AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-...`}
                  </pre>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
