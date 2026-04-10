import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "./supabase";

let client: Anthropic | null = null;

/**
 * Return the default Claude client (uses ANTHROPIC_API_KEY env var).
 */
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

/**
 * Return a Claude client for a specific workspace. If the workspace has a
 * custom Anthropic API key stored in `workspace_api_keys`, that key is used.
 * Otherwise falls back to the platform default.
 */
export async function getClaudeClientForWorkspace(workspaceId?: string): Promise<Anthropic> {
  if (!workspaceId) return getClaudeClient();

  const supabase = getSupabaseServerClient();
  if (!supabase) return getClaudeClient();

  try {
    const { data } = await supabase
      .from("workspace_api_keys")
      .select("anthropic_api_key")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (data?.anthropic_api_key) {
      return new Anthropic({
        apiKey: data.anthropic_api_key,
        timeout: 10 * 60 * 1000,
      });
    }
  } catch {
    // fall through to default
  }

  return getClaudeClient();
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
