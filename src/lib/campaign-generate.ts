/**
 * Single-asset generation used by both /generate (batch SSE) and
 * /assets/[assetId]/regenerate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClaudeClient } from "@/lib/claude";
import { buildSystemBlocks } from "@/lib/brand-context";
import { loadAgentPrompt } from "@/lib/campaign-agents";
import { buildDocumentsContext } from "@/lib/campaign-documents";
import { runEditorPipeline } from "@/lib/content/editor-pipeline";

interface AssetRow {
  id: string;
  campaign_id: string;
  asset_type: string;
  agent: string;
  title: string | null;
  audience: string | null;
  intent: string | null;
  dependencies: string[] | null;
  feedback?: string | null;
  revision_count?: number | null;
  phase?: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  parsed_context: Record<string, unknown> | null;
  event_transcript?: string | null;
}

/**
 * Mandatory citation/sourcing instruction injected into every writer
 * EXCEPT social posts. Whenever the writer references a case study,
 * customer story, blog post, or external claim, it must include a
 * markdown link with relevant anchor text in that sentence.
 */
const CITATION_RULE = `\n\n=== SOURCING & CITATION RULE (MANDATORY) ===
Any time you reference a case study, customer story, blog post, research piece, statistic, or external claim, you MUST include a markdown link in that sentence using relevant anchor text. Examples:
  ✓ "When we worked with [Acme on their event launch](https://example.com/acme-case-study), attendance jumped 3x."
  ✓ "Our [field guide on launch sequencing](https://example.com/field-guide) covers this in depth."
  ✗ "We've helped many customers triple attendance." (no link, not allowed)
  ✗ "Studies show webinars convert better." (vague, no link, not allowed)
If you don't have a specific URL for a claim, REWRITE the sentence as a qualitative observation ("In our experience…", "What we're seeing is…") instead of inventing a link. Never fabricate URLs. This rule applies to the entire body of this asset.`;

export async function generateAsset(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  asset: AssetRow,
): Promise<{ ok: true; body: string; metadata: Record<string, unknown> } | { ok: false; error: string }> {
  const claude = getClaudeClient();

  // Build dependency context (titles + bodies, abbreviated)
  let depContext = "";
  if (Array.isArray(asset.dependencies) && asset.dependencies.length > 0) {
    const { data: deps } = await supabase
      .from("campaign_assets")
      .select("id, asset_type, title, body")
      .in("id", asset.dependencies);
    if (deps && deps.length) {
      depContext = "\n\n=== DEPENDENCY ASSETS (already generated) ===\n" +
        deps.map((d: { asset_type: string; title: string | null; body: string | null }) =>
          `### ${d.asset_type}: ${d.title || "(untitled)"}\n${(d.body || "").slice(0, 4000)}`,
        ).join("\n\n");
    }
  }

  const basePrompt = await loadAgentPrompt(asset.agent);
  const docsContext = await buildDocumentsContext(supabase, campaign.id, "writers");

  // Per-asset-type Sequel override (appended to base prompt)
  let override = "";
  try {
    const { data: ovr } = await supabase
      .from("campaign_writer_overrides")
      .select("prompt, enabled")
      .eq("asset_type", asset.asset_type)
      .maybeSingle();
    if (ovr && ovr.enabled && ovr.prompt && ovr.prompt.trim()) {
      override = `\n\n=== SEQUEL ${asset.asset_type.toUpperCase()} GUIDELINES (priority over base instructions) ===\n${ovr.prompt}`;
    }
  } catch { /* ignore */ }

  // Citation requirement for every asset type EXCEPT social.
  const citationBlock = asset.asset_type === "social" ? "" : CITATION_RULE;

  const systemPrompt = basePrompt + override + citationBlock;

  // For post-event assets, inject the event transcript as primary context.
  const transcriptBlock = (asset.phase === "post" && campaign.event_transcript && campaign.event_transcript.trim())
    ? `\n=== EVENT TRANSCRIPT / THOUGHT-LEADER NOTES (primary source for this asset) ===
This asset is a follow-up to the live event. Pull specific quotes, arguments, examples, and insights from the transcript below — do NOT generalize or paraphrase into corporate fluff. The whole point of this piece is that it reflects what actually happened.

${campaign.event_transcript.trim().slice(0, 30000)}
=== END TRANSCRIPT ===\n`
    : "";

  // Human-in-the-loop feedback from a prior revision (if any).
  const feedbackBlock = (asset.feedback && asset.feedback.trim())
    ? `\n\n=== HUMAN FEEDBACK FROM PRIOR REVISION (HIGHEST PRIORITY) ===
The reviewer read the previous version and left these notes. Apply ALL of them. They override generic style instructions when in conflict, because they reflect what this specific reader wants:

${asset.feedback.trim()}

This is revision #${(asset.revision_count || 0) + 1}. The previous version missed the mark in the ways above — do not repeat those mistakes.`
    : "";

  const userMessage = `Campaign: ${campaign.name}

=== CAMPAIGN CONTEXT (parsed from brief) ===
${JSON.stringify(campaign.parsed_context || {}, null, 2)}
${docsContext ? "\n" + docsContext + "\n" : ""}${transcriptBlock}
=== THIS ASSET ===
Type: ${asset.asset_type}
Working title: ${asset.title || "(none)"}
Audience: ${asset.audience || "(unspecified)"}
Intent: ${asset.intent || "(unspecified)"}
${depContext}${feedbackBlock}

Generate this asset now. Return only the JSON specified in your instructions.`;

  const isBlog = asset.asset_type === "blog" || asset.asset_type === "thought_leadership";
  const { blocks } = await buildSystemBlocks({
    includeWritingStandards: isBlog,
    additionalContext: systemPrompt,
  });

  const start = Date.now();
  let rawText = "";
  let usage: { input_tokens?: number; output_tokens?: number } = {};

  try {
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: isBlog ? 8192 : 4096,
      system: blocks,
      messages: [{ role: "user", content: userMessage }],
    });
    usage = response.usage || {};
    for (const b of response.content) if (b.type === "text") rawText += b.text;
  } catch (err) {
    await supabase.from("campaign_generations").insert({
      campaign_id: campaign.id,
      asset_id: asset.id,
      kind: "generate",
      agent: asset.agent,
      response: rawText,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let parsed: Record<string, unknown>;
  try {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { title: asset.title || asset.asset_type, body: rawText };
  }

  let body = typeof parsed.body === "string"
    ? parsed.body
    : JSON.stringify(parsed, null, 2);
  const title = typeof parsed.title === "string" ? parsed.title : asset.title;
  const { body: _b, title: _t, ...metadata } = parsed as Record<string, unknown>;
  void _b; void _t;

  // ── Long-form editor pass ────────────────────────────────────────────
  // Run blog + thought-leadership drafts through the same editor used
  // for our long-form articles (kill-list, structural variety, source
  // checks, etc). Skipped on failure so a bad editor pass never blocks
  // the asset from saving.
  if (isBlog) {
    try {
      const wordCountTarget = body.split(/\s+/).filter(Boolean).length || 1500;
      const editResult = await runEditorPipeline({
        claude,
        draft: body,
        wordCount: wordCountTarget,
      });
      if (editResult.cleanDraft && editResult.cleanDraft.trim().length > 200) {
        body = editResult.cleanDraft;
        (metadata as Record<string, unknown>).editor_review_notes = editResult.reviewNotes;
        (metadata as Record<string, unknown>).editor_gates_passed = `${editResult.gatesPassed}/${editResult.gatesTotal}`;
      }
    } catch (err) {
      (metadata as Record<string, unknown>).editor_error =
        err instanceof Error ? err.message : String(err);
    }
  }

  await supabase.from("campaign_generations").insert({
    campaign_id: campaign.id,
    asset_id: asset.id,
    kind: "generate",
    agent: asset.agent,
    response: rawText,
    input_tokens: usage.input_tokens || null,
    output_tokens: usage.output_tokens || null,
    duration_ms: Date.now() - start,
  });

  await supabase.from("campaign_assets").update({
    title,
    body,
    metadata,
    status: "ready",
    error: null,
    revision_count: (asset.revision_count || 0) + 1,
  }).eq("id", asset.id);

  return { ok: true, body, metadata };
}
