import { getClaudeClient, resolveModel, MAX_TOKENS } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const OPUS = resolveModel("claude-opus-4-6");

function getWeekBounds(weekStart?: string): { start: string; end: string } {
  const now = new Date();
  if (weekStart) {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  // Default: last 7 days
  const end = now;
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let body: { week_start?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine, use defaults
  }

  const { start, end } = getWeekBounds(body.week_start);

  // 1. Fetch all scan results from the past 7 days grouped by competitor
  const { data: scanResults, error: scanError } = await supabase
    .from("competitor_scan_results")
    .select("*, competitor_watch(name, domain)")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (scanError) {
    return Response.json({ error: scanError.message }, { status: 500 });
  }

  // 2. Fetch pricing snapshots with changes
  const { data: pricingChanges } = await supabase
    .from("competitor_pricing_snapshots")
    .select("*, competitor_watch(name)")
    .eq("changes_detected", true)
    .gte("created_at", start)
    .lte("created_at", end);

  // 3. Fetch review tracking changes
  const { data: reviewChanges } = await supabase
    .from("competitor_review_tracking")
    .select("*, competitor_watch(name)")
    .gte("created_at", start)
    .lte("created_at", end);

  // Group scan results by competitor
  const byCompetitor: Record<string, { name: string; results: typeof scanResults }> = {};
  for (const result of scanResults || []) {
    const compName = result.competitor_watch?.name || result.competitor_id;
    if (!byCompetitor[compName]) {
      byCompetitor[compName] = { name: compName, results: [] };
    }
    byCompetitor[compName].results.push(result);
  }

  // Build the context for Claude
  const competitorSummaries = Object.entries(byCompetitor).map(([name, data]) => {
    const highItems = data.results.filter((r: Record<string, unknown>) => r.significance === "high");
    const medItems = data.results.filter((r: Record<string, unknown>) => r.significance === "medium");
    const lowItems = data.results.filter((r: Record<string, unknown>) => r.significance === "low");

    return `## ${name}
HIGH significance (${highItems.length}):
${highItems.map((r: Record<string, unknown>) => `- [${r.scan_type}] ${r.title}: ${r.detail}`).join("\n") || "None"}

MEDIUM significance (${medItems.length}):
${medItems.map((r: Record<string, unknown>) => `- [${r.scan_type}] ${r.title}: ${r.detail}`).join("\n") || "None"}

LOW significance (${lowItems.length}):
${lowItems.map((r: Record<string, unknown>) => `- [${r.scan_type}] ${r.title}`).join("\n") || "None"}`;
  }).join("\n\n");

  const pricingSection = (pricingChanges || []).length > 0
    ? `\n\n## Pricing Changes\n${(pricingChanges || []).map((p: Record<string, unknown>) => `- ${(p.competitor_watch as Record<string, unknown>)?.name}: Changes detected`).join("\n")}`
    : "";

  const reviewSection = (reviewChanges || []).length > 0
    ? `\n\n## Review Tracking\n${(reviewChanges || []).map((r: Record<string, unknown>) => `- ${(r.competitor_watch as Record<string, unknown>)?.name}: ${r.platform} — Rating: ${r.rating}, Reviews: ${r.review_count}`).join("\n")}`
    : "";

  if (Object.keys(byCompetitor).length === 0) {
    return Response.json({
      digest: "No scan results found for the specified period. Run competitor scans first.",
      week_start: start,
      week_end: end,
    });
  }

  // 4. Send to Claude Opus for digest generation
  const claude = getClaudeClient();
  const response = await claude.messages.create({
    model: OPUS,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `You are generating a weekly competitor intelligence digest for the Sequel marketing team.

Period: ${start.split("T")[0]} to ${end.split("T")[0]}

Here are all competitor scan results from this period:

${competitorSummaries}
${pricingSection}
${reviewSection}

Generate a structured weekly digest in this EXACT format:

# Competitor Intelligence Digest
**Week of ${start.split("T")[0]}**

## Executive Summary
(2-3 sentences: biggest moves, what demands attention)

## Critical Alerts (HIGH significance)
(Bulleted list of high-priority items with competitor name, what happened, and recommended action)

## Competitor Movements

### [Competitor Name]
**Overall Threat Level: HIGH/MEDIUM/LOW**
- Hiring: (summary)
- Product: (summary)
- Pricing: (summary)
- Reviews: (summary)
- News: (summary)

(Repeat for each competitor)

## Content Gaps Identified
(List content topics where competitors are active but we are not. Format each as a keyword opportunity.)

## Battle Card Updates Needed
(List which battle cards need refreshing and why)

## Recommended Actions
1. (Specific, actionable items ranked by priority)
2. ...

---
*Auto-generated by Sequel Brand Brain Competitor Watch*

IMPORTANT: For Content Gaps, output them as a JSON block labeled CONTENT_GAPS_JSON:
\`\`\`CONTENT_GAPS_JSON
[{"keyword": "...", "reason": "...", "competitor": "..."}]
\`\`\`

For Battle Card Updates, output them as a JSON block labeled BATTLE_CARDS_JSON:
\`\`\`BATTLE_CARDS_JSON
[{"competitor": "...", "reason": "..."}]
\`\`\``,
      },
    ],
  });

  let digestText = "";
  for (const block of response.content) {
    if (block.type === "text") digestText += block.text;
  }

  // 5. Parse auto-actions from the digest

  // Content gaps -> keyword_opportunities
  const contentGapsMatch = digestText.match(/```CONTENT_GAPS_JSON\s*([\s\S]*?)```/);
  if (contentGapsMatch) {
    try {
      const gaps = JSON.parse(contentGapsMatch[1]);
      if (Array.isArray(gaps) && gaps.length > 0) {
        await supabase.from("keyword_opportunities").insert(
          gaps.map((gap: { keyword: string; reason: string; competitor: string }) => ({
            keyword: gap.keyword,
            source: "competitor_watch",
            notes: `Gap vs ${gap.competitor}: ${gap.reason}`,
          }))
        );
      }
    } catch {
      // Parse failed — non-critical
    }
  }

  // Battle card updates -> battle_cards needs_refresh
  const battleCardsMatch = digestText.match(/```BATTLE_CARDS_JSON\s*([\s\S]*?)```/);
  if (battleCardsMatch) {
    try {
      const updates = JSON.parse(battleCardsMatch[1]);
      if (Array.isArray(updates)) {
        for (const update of updates) {
          await supabase
            .from("battle_cards")
            .update({
              needs_refresh: true,
              refresh_reason: update.reason,
            })
            .ilike("competitor_name", `%${update.competitor}%`);
        }
      }
    } catch {
      // Parse failed — non-critical
    }
  }

  // Clean the digest text (remove JSON blocks for display)
  const cleanDigest = digestText
    .replace(/```CONTENT_GAPS_JSON[\s\S]*?```/g, "")
    .replace(/```BATTLE_CARDS_JSON[\s\S]*?```/g, "")
    .trim();

  // 6. Save digest
  const { data: savedDigest, error: saveError } = await supabase
    .from("competitor_digests")
    .insert({
      week_start: start.split("T")[0],
      week_end: end.split("T")[0],
      digest_markdown: cleanDigest,
      competitor_count: Object.keys(byCompetitor).length,
      high_alerts: (scanResults || []).filter((r) => r.significance === "high").length,
      raw_data: {
        scan_results_count: (scanResults || []).length,
        pricing_changes: (pricingChanges || []).length,
        review_changes: (reviewChanges || []).length,
      },
    })
    .select()
    .single();

  if (saveError) {
    // Still return the digest even if save fails
    console.error("Failed to save digest:", saveError.message);
  }

  return Response.json({
    digest: cleanDigest,
    digest_id: savedDigest?.id || null,
    week_start: start.split("T")[0],
    week_end: end.split("T")[0],
    stats: {
      competitors_analyzed: Object.keys(byCompetitor).length,
      total_findings: (scanResults || []).length,
      high_alerts: (scanResults || []).filter((r) => r.significance === "high").length,
      medium_alerts: (scanResults || []).filter((r) => r.significance === "medium").length,
    },
  });
}
