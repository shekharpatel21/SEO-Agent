"use client";

import { useState, useRef, useEffect } from "react";
import KeywordReport from "./KeywordReport";
import ApiKeySetup from "./ApiKeySetup";
import type { SEOIntent } from "@/types";

const EXAMPLE_PROMPTS = [
  "Keyword research for AI video creator",
  "Analyze top competitors for 'project management software'",
  "Find content gaps for a SaaS landing page",
  "SERP analysis for 'best CRM for small business'",
];

interface Message {
  role: "user" | "assistant";
  content: string;
  query?: string;
  intents?: SEOIntent[];
  domains?: string[];
  keyword?: string;
  filteredData?: Record<string, unknown>;
}

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const stopMessage = () => {
    abortRef.current?.abort();
  };

  const sendMessage = async (text?: string) => {
    const query = text || input;
    if (!query.trim()) return;

    if (loading) {
      if (/^\s*stop\s*[.!]?\s*$/i.test(query)) {
        setInput("");
        stopMessage();
      }
      return;
    }

    const userMsg: Message = { role: "user", content: query };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.success) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.report,
            query,
            intents: data.intents,
            domains: data.domains,
            keyword: data.keyword,
            filteredData: data.filtered_data,
          },
        ]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `Something went wrong: ${data.error || "Unknown error"}. Check your API keys in \`.env.local\`.`,
          },
        ]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "_Stopped._" },
        ]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "Failed to connect. Make sure the app is running and your API keys are configured in `.env.local`.",
          },
        ]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-screen min-h-[100dvh] bg-[#fafaf9] overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-gray-900 leading-tight truncate">
              SEO Keyword Agent
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-400 truncate">
              DataForSEO + AI &middot; Open Source
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <ApiKeySetup />
          <a
            href="https://github.com/shekharpatel21/SEO-Agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </a>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!hasMessages ? (
          /* Landing / Hero State */
          <div className="flex flex-col items-center justify-center min-h-full px-4 sm:px-6">
            <div className="max-w-2xl w-full text-center py-10 sm:py-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
                Keyword research
                <br />
                <span className="text-gray-400">powered by AI</span>
              </h2>
              <p className="mt-4 text-gray-500 text-sm sm:text-base max-w-md mx-auto">
                Get complete SEO reports with keyword ideas, SERP analysis,
                competitor insights, and a domination strategy — all in
                seconds.
              </p>

              {/* Input on hero */}
              <div className="mt-8 sm:mt-10 relative">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl shadow-lg shadow-gray-200/50 px-3 sm:px-4 py-2 focus-within:border-gray-400 transition-colors">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="What do you want to research?"
                    className="flex-1 min-w-0 py-2.5 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                  {loading ? (
                    <button
                      onClick={stopMessage}
                      className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-all"
                      aria-label="Stop"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim()}
                      className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      aria-label="Send"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Example prompts */}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-3.5 py-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-full hover:border-gray-400 hover:text-gray-700 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" ? (
                  <KeywordReport
                    content={msg.content}
                    query={msg.query}
                    intents={msg.intents}
                    domains={msg.domains}
                    keyword={msg.keyword}
                    filteredData={msg.filteredData}
                  />
                ) : (
                  <div className="bg-gray-900 text-white rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 max-w-[85%] sm:max-w-lg text-sm break-words">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-sm text-gray-500">
                      Researching keywords...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom input (visible only when in chat mode) */}
      {hasMessages && (
        <div className="border-t border-gray-100 bg-white/80 backdrop-blur-sm px-3 sm:px-4 py-2 sm:py-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 sm:px-4 py-1 focus-within:border-gray-400 transition-colors">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask for keyword research, competitor analysis, SERP data..."
                className="flex-1 min-w-0 py-2.5 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              {loading ? (
                <button
                  onClick={stopMessage}
                  className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-all"
                  aria-label="Stop"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  aria-label="Send"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
