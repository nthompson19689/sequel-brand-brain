import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getClaudeClient } from "@/lib/claude";
import { buildSystemBlocks } from "@/lib/brand-context";
import { loadAgentPrompt, AGENT_FOR_ASSET, type AssetType } from "@/lib/campaign-agents";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ManifestItem {
  asset_type: AssetType;
  agent?: string;
  title?: string;
  audience?: string;
  intent?: string;
  dependencies?: string[];
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns").select("*").eq("id", id).single();
  if (cErr || !campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!campaign.brief) return NextResponse.json({ error: "Campaign has no brief" }, { status: 400 });

  const claude = getClaudeClient();
  const systemPrompt = await loadAgentPrompt("orchestrator-parse");
  const { blocks } = await buildSystemBlocks({
    additionalContext: systemPrompt,
  });

  const start = Date.now();
  let parsed: { parsed_context?: Record<string, unknown>; asset_manifest?: ManifestItem[] } = {};
  let rawText = "";
  let usage: { input_tokens?: number; output_tokens?: number } = {};

  try {
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      messages: [{
        role: "user",
        content: `Campaign name: ${campaign.name}\nLaunch date: ${campaign.launch_date || "TBD"}\n\n=== BRIEF ===\n${campaign.brief}`,
      }],
    });
    usage = response.usage || {};
    for (const b of response.content) if (b.type === "text") rawText += b.text;
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    await supabase.from("campaign_generations").insert({
      campaign_id: id,
      kind: "parse",
      agent: "orchestrator-parse",
      response: rawText,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
    return NextResponse.json({
      error: "Failed to parse brief",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  const manifest: ManifestItem[] = Array.isArray(parsed.asset_manifest) ? parsed.asset_manifest : [];

  // Persist parsed context + manifest on campaign
  await supabase.from("campaigns").update({
    parsed_context: parsed.parsed_context || {},
    asset_manifest: manifest,
    status: "parsed",
  }).eq("id", id);

  // Wipe any prior pending assets so re-parse is idempotent
  await supabase.from("campaign_assets").delete().eq("campaign_id", id).in("status", ["pending", "failed"]);

  // Insert assets
  const rows = manifest.map((m, i) => ({
    campaign_id: id,
    asset_type: m.asset_type,
    agent: m.agent || AGENT_FOR_ASSET[m.asset_type] || "blog-writer",
    title: m.title || null,
    audience: m.audience || null,
    intent: m.intent || null,
    dependencies: m.dependencies || [],
    status: "pending",
    position: i,
  }));

  let insertedAssets: unknown[] = [];
  if (rows.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from("campaign_assets").insert(rows).select();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    insertedAssets = ins || [];
  }

  await supabase.from("campaign_generations").insert({
    campaign_id: id,
    kind: "parse",
    agent: "orchestrator-parse",
    response: rawText,
    input_tokens: usage.input_tokens || null,
    output_tokens: usage.output_tokens || null,
    duration_ms: Date.now() - start,
  });

  return NextResponse.json({
    campaign_id: id,
    parsed_context: parsed.parsed_context || {},
    assets: insertedAssets,
  });
}
