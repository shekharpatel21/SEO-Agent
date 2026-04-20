import type { AIMessage } from "@/types";

interface AIRequest {
  system: string;
  messages: AIMessage[];
  max_tokens?: number;
}

export async function getAIResponse({
  system,
  messages,
  max_tokens = 4096,
}: AIRequest): Promise<string> {
  const provider = process.env.AI_PROVIDER || "openai";
  const model = process.env.AI_MODEL || "gpt-4o";

  switch (provider) {
    case "openai":
      return callOpenAI(system, messages, model, max_tokens);
    case "gemini":
      return callGemini(system, messages, model, max_tokens);
    case "anthropic":
      return callAnthropic(system, messages, model, max_tokens);
    default:
      throw new Error(
        `Unknown AI provider: "${provider}". Use "openai", "gemini", or "anthropic".`
      );
  }
}

async function callOpenAI(
  system: string,
  messages: AIMessage[],
  model: string,
  max_tokens: number
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.local");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(
  system: string,
  messages: AIMessage[],
  model: string,
  max_tokens: number
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.local");

  const geminiModel = model || "gemini-2.5-flash";
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    generationConfig: { maxOutputTokens: max_tokens },
  });

  // Retry on 503 (model overloaded) with exponential backoff
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );

    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    const text = await res.text();
    const isRetryable = res.status === 503 || res.status === 429;
    if (!isRetryable || attempt === maxAttempts) {
      throw new Error(`Gemini API error: ${res.status} — ${text}`);
    }

    const waitMs = 1000 * 2 ** (attempt - 1);
    console.warn(
      `Gemini ${res.status}, retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new Error("Gemini: retry loop exited unexpectedly");
}

async function callAnthropic(
  system: string,
  messages: AIMessage[],
  model: string,
  max_tokens: number
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.local");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      max_tokens,
      system,
      messages: messages.filter((m) => m.role !== "system"),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error: ${res.status} — ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}
