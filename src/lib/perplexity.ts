/**
 * Perplexity Sonar API client for deep web research.
 * Uses the chat completions endpoint with the sonar model.
 * Docs: https://docs.perplexity.ai/api-reference
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface PerplexityCitation {
  url: string;
  title?: string;
}

export interface PerplexityResult {
  content: string;
  citations: PerplexityCitation[];
}

export function getPerplexityApiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) {
    throw new Error(
      "PERPLEXITY_API_KEY not set. Add it to .env.local to enable deep research."
    );
  }
  return key;
}

/**
 * Run a deep research query using Perplexity Sonar.
 * Returns the answer text plus citations.
 */
export async function deepResearch(
  query: string,
  systemPrompt?: string
): Promise<PerplexityResult> {
  const apiKey = getPerplexityApiKey();

  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  } else {
    messages.push({
      role: "system",
      content:
        "You are a thorough research assistant. Provide comprehensive, well-sourced answers with specific data points, statistics, and facts. Always cite your sources.",
    });
  }

  messages.push({ role: "user", content: query });

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages,
      max_tokens: 4096,
      temperature: 0.2,
      return_citations: true,
      search_recency_filter: "month",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Perplexity API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Extract citations from the response
  const citations: PerplexityCitation[] = (data.citations || []).map(
    (url: string) => ({ url, title: url })
  );

  return { content, citations };
}
