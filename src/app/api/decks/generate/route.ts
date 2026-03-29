import { NextRequest, NextResponse } from "next/server";
import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const DECK_SYSTEM = `You are a presentation architect for Sequel. You create professional slide decks grounded in real brand data and competitive intelligence.

=== OUTPUT FORMAT ===
Return ONLY valid JSON with this exact structure:
{
  "title": "Deck Title",
  "slides": [
    {
      "layout": "title_slide",
      "title": "Deck Title",
      "subtitle": "Optional subtitle",
      "body": "",
      "speakerNotes": "What to say when presenting this slide"
    }
  ]
}

=== AVAILABLE LAYOUTS ===
- title_slide: Opening slide. Large title, optional subtitle.
- bullets: Standard content slide with bullet points. Most common.
- two_column: Split layout. body = left column text, subtitle = right column text.
- three_cards: Three content cards. Include a "cards" array: [{"icon": "emoji", "title": "...", "body": "..."}]
- comparison_table: Versus/comparison. Include "columns": [{"header": "Us", "rows": ["row1", "row2"]}, {"header": "Them", "rows": ["row1", "row2"]}]
- stats_callout: Big numbers. Include "stats": [{"value": "47%", "label": "Growth rate"}]
- image_left / image_right: Slide with image placeholder. body = text content.
- quote: Customer quote or insight. body = quote text, subtitle = attribution.
- closing: Final slide. title = CTA or thank you, subtitle = contact info.

=== GUIDELINES ===
- Always start with title_slide and end with closing
- Use variety of layouts — don't repeat the same layout 3+ times in a row
- Keep slide text concise — 3-5 bullets max per slide
- Include speaker notes for every slide with real talking points
- 8-15 slides is ideal for most presentations
- Use concrete data/numbers from the brand context when available
- Each bullet point starts with "• "
- For comparison_table, use 3-5 rows per column
- Use Sequel's actual messaging, positioning, and competitive intel — never generic filler`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, mode } = await request.json();

    // Build brand context (same as chat, content, agents)
    let additionalContext = DECK_SYSTEM;

    // For battle card mode, fetch competitive intel
    if (mode === "battle_card") {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data: battleCards } = await supabase
          .from("battle_cards")
          .select("competitor_name, strengths, weaknesses, positioning, objection_handling, win_strategy")
          .limit(10);

        if (battleCards && battleCards.length > 0) {
          const bcContext = battleCards.map((bc) => {
            const parts = [`### ${bc.competitor_name}`];
            if (bc.strengths) parts.push(`Strengths: ${bc.strengths}`);
            if (bc.weaknesses) parts.push(`Weaknesses: ${bc.weaknesses}`);
            if (bc.positioning) parts.push(`Our positioning: ${bc.positioning}`);
            if (bc.objection_handling) parts.push(`Objection handling: ${bc.objection_handling}`);
            if (bc.win_strategy) parts.push(`Win strategy: ${bc.win_strategy}`);
            return parts.join("\n");
          }).join("\n\n");
          additionalContext += `\n\n=== COMPETITIVE INTELLIGENCE ===\nUse this real data in the deck:\n\n${bcContext}`;
        }
      }
    }

    // For sales deck mode, fetch call insights for common objections/wins
    if (mode === "sales_deck") {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data: insights } = await supabase
          .from("call_insights")
          .select("insight_type, content, sentiment")
          .limit(10);

        if (insights && insights.length > 0) {
          const insightContext = insights.map((i) =>
            `[${i.insight_type}] ${i.content}`
          ).join("\n");
          additionalContext += `\n\n=== CALL INSIGHTS ===\nReal objections, signals, and wins from sales calls:\n\n${insightContext}`;
        }
      }
    }

    const { blocks: systemBlocks } = await buildSystemBlocks({
      additionalContext,
    });

    let enrichedPrompt = prompt;
    if (mode === "battle_card") {
      enrichedPrompt = `Create a competitive battle card presentation about: ${prompt}. Include slides for: company overview, their strengths and weaknesses, our advantages (use comparison_table), head-to-head feature comparison, objection handling responses, customer proof points (use stats_callout or quote), and win strategy. Use the competitive intelligence and brand docs provided — no generic filler.`;
    } else if (mode === "sales_deck") {
      enrichedPrompt = `Create a sales pitch deck for: ${prompt}. Include slides for: attention-grabbing opening with a bold claim, the problem/pain point (use stats_callout with real numbers), our solution, key differentiators (use three_cards), social proof (use quote layout with real customer insight if available), comparison with alternatives (use comparison_table), ROI/impact, and a strong closing CTA. Ground everything in the brand context and call insights provided.`;
    }

    const claude = getClaudeClient();

    const response = await claude.messages.create({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      messages: [{ role: "user", content: enrichedPrompt }],
    });

    logCachePerformance("/api/decks/generate", response.usage);

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse deck structure" }, { status: 500 });
    }

    const deck = JSON.parse(jsonMatch[0]);

    // Ensure all slides have IDs
    deck.slides = (deck.slides || []).map((s: Record<string, unknown>) => ({
      ...s,
      id: crypto.randomUUID(),
    }));

    return NextResponse.json({ deck });
  } catch (err) {
    console.error("[Decks] Generate error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
