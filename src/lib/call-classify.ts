/**
 * Shared classification + storage pipeline for Fathom calls.
 *
 * Used by both:
 *   - manual import via /api/brain/calls/fathom/import
 *   - webhook ingestion via /api/fathom/webhook
 *
 * Steps:
 *   1. Classify the call with Claude → strict JSON
 *   2. If classification fails, default to call_type="sales"
 *      with needs_review=true
 *   3. Insert into call_insights with the full transcript as full_content
 *   4. Generate an OpenAI text-embedding-3-small embedding on
 *      full_content; failure does NOT block the save (the hourly
 *      embed-backfill cron will catch it later).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClaudeClient } from "@/lib/claude";
import { embed } from "@/lib/embeddings";
import {
  getCallSummary,
  getCallTranscript,
  getCallMetadata,
  type FathomCall,
} from "@/lib/fathom";

export interface ClassifiedCall {
  call_type: "customer" | "sales" | "closed_won" | "closed_lost" | "open_opp";
  company_name: string | null;
  summary: string;
  objections: string[];
  competitors_mentioned: string[];
  sentiment: "positive" | "neutral" | "negative";
  churn_risk: "low" | "medium" | "high";
}

const CLASSIFY_SYSTEM = `You are analyzing a business call transcript. Based on the summary, title, and participant names, classify this call into exactly one category: customer (existing customer call — onboarding, QBR, check-in, renewal, training, support) or sales (prospect or new business call — discovery, demo, pricing, proposal, follow-up). Also extract: company_name (the prospect or customer company name, not Sequel), a 2-3 sentence summary of what was discussed, an array of objections raised by the prospect or customer, an array of competitor names mentioned, overall sentiment as positive or neutral or negative, and churn_risk as low or medium or high (default low for sales calls). Return only valid JSON with exactly these fields: call_type, company_name, summary, objections, competitors_mentioned, sentiment, churn_risk. No markdown, no explanation, just the JSON object.`;

function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string");
}

function coerceCallType(v: unknown): ClassifiedCall["call_type"] {
  const allowed: ClassifiedCall["call_type"][] = ["customer", "sales", "closed_won", "closed_lost", "open_opp"];
  return (typeof v === "string" && (allowed as string[]).includes(v) ? v : "sales") as ClassifiedCall["call_type"];
}

function coerceSentiment(v: unknown): ClassifiedCall["sentiment"] {
  return v === "positive" || v === "negative" ? v : "neutral";
}

function coerceChurnRisk(v: unknown): ClassifiedCall["churn_risk"] {
  return v === "medium" || v === "high" ? v : "low";
}

export async function classifyTranscript(opts: {
  title: string | null;
  summary: string;
  transcript: string;
  participants: string[];
}): Promise<{ classified: ClassifiedCall; needs_review: boolean; raw: string }> {
  const claude = getClaudeClient();

  const userMessage = `Title: ${opts.title || "(untitled)"}
Participants: ${opts.participants.join(", ") || "(unknown)"}

=== AI SUMMARY ===
${opts.summary || "(no summary)"}

=== TRANSCRIPT (first 30,000 chars) ===
${(opts.transcript || "").slice(0, 30000)}`;

  let raw = "";
  try {
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });
    for (const b of response.content) if (b.type === "text") raw += b.text;
  } catch (err) {
    return {
      classified: fallback(opts.title),
      needs_review: true,
      raw: `error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Strip optional code fences
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { classified: fallback(opts.title), needs_review: true, raw };
  }

  const classified: ClassifiedCall = {
    call_type: coerceCallType(parsed.call_type),
    company_name: typeof parsed.company_name === "string" ? parsed.company_name : null,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    objections: safeArray(parsed.objections),
    competitors_mentioned: safeArray(parsed.competitors_mentioned),
    sentiment: coerceSentiment(parsed.sentiment),
    churn_risk: coerceChurnRisk(parsed.churn_risk),
  };

  // If the model returned an empty summary or no company, mark for review.
  const needs_review = !classified.summary || !classified.company_name;
  return { classified, needs_review, raw };
}

function fallback(title: string | null): ClassifiedCall {
  return {
    call_type: "sales",
    company_name: title || null,
    summary: "",
    objections: [],
    competitors_mentioned: [],
    sentiment: "neutral",
    churn_risk: "low",
  };
}

/**
 * Full ingest: fetch transcript + summary + metadata from Fathom,
 * classify, insert into call_insights, embed.
 *
 * Idempotent on fathom_call_id — re-running on the same call returns
 * { skipped: true } without doing any work.
 */
export async function importFathomCall(opts: {
  supabase: SupabaseClient;
  fathomCallId: string;
  /** Optionally pass metadata you already fetched (avoids a duplicate API call) */
  metadata?: FathomCall | null;
}): Promise<
  | { ok: true; skipped: true; id: string }
  | { ok: true; skipped: false; id: string; classified: ClassifiedCall; needs_review: boolean; embedded: boolean }
  | { ok: false; error: string }
> {
  const { supabase, fathomCallId } = opts;

  // Dedup check
  const { data: existing } = await supabase
    .from("call_insights")
    .select("id")
    .eq("fathom_call_id", fathomCallId)
    .maybeSingle();
  if (existing?.id) return { ok: true, skipped: true, id: existing.id };

  // Fetch detail + (optionally) metadata
  let metadata: FathomCall | null = opts.metadata || null;
  let transcript = "";
  let summary = "";
  try {
    [transcript, summary] = await Promise.all([
      getCallTranscript(fathomCallId),
      getCallSummary(fathomCallId),
    ]);
    if (!metadata) {
      try {
        metadata = await getCallMetadata(fathomCallId);
      } catch { /* metadata is optional */ }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Classify
  const { classified, needs_review } = await classifyTranscript({
    title: metadata?.title || null,
    summary,
    transcript,
    participants: metadata?.participants || [],
  });

  // Insert
  const insertRow = {
    fathom_call_id: fathomCallId,
    call_type: classified.call_type,
    company_name: classified.company_name,
    contact_name: metadata?.participants?.[0] || null,
    call_date: metadata?.date || null,
    summary: classified.summary,
    objections: classified.objections,
    competitors_mentioned: classified.competitors_mentioned,
    sentiment: classified.sentiment,
    churn_risk: classified.churn_risk === "high",
    notable_quotes: null,
    full_content: `${metadata?.title || ""}\n\n${summary}\n\n--- TRANSCRIPT ---\n${transcript}`,
    needs_review,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("call_insights")
    .insert(insertRow)
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    return { ok: false, error: insertErr?.message || "Insert failed" };
  }

  // Embed (best-effort)
  let embedded = false;
  try {
    const v = await embed(insertRow.full_content);
    if (v) {
      await supabase.from("call_insights").update({ embedding: v }).eq("id", inserted.id);
      embedded = true;
    }
  } catch (err) {
    console.error(`[call-classify] embed failed for ${inserted.id}:`, err);
  }

  return { ok: true, skipped: false, id: inserted.id, classified, needs_review, embedded };
}
