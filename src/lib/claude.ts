import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    client = new Anthropic({
      apiKey,
      timeout: 10 * 60 * 1000, // 10 minutes — prevents premature timeout on long operations
    });
  }
  return client;
}

export const CHAT_MODEL = "claude-sonnet-4-20250514";
export const MAX_TOKENS = 4096;

// Model map — user-facing IDs to API model strings
export const MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-20250514",
  "claude-opus-4-6": "claude-opus-4-20250514",
};

export const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", desc: "Fast & efficient", badge: "⚡" },
  { value: "claude-opus-4-6", label: "Opus 4.6", desc: "Maximum quality", badge: "✨" },
] as const;

/** Resolve a user-facing model ID to an API model string */
export function resolveModel(modelId?: string): string {
  if (!modelId) return CHAT_MODEL;
  return MODEL_MAP[modelId] || CHAT_MODEL;
}
