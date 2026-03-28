import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const SYSTEM_PROMPT = `You are a presentation architect. Given a description, generate a professional slide deck.

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
    },
    {
      "layout": "bullets",
      "title": "Slide Heading",
      "body": "• Point 1\\n• Point 2\\n• Point 3",
      "speakerNotes": "Key talking points"
    }
  ]
}

Available layouts and when to use them:
- title_slide: Opening slide. Large title, optional subtitle.
- bullets: Standard content slide with bullet points. Most common.
- two_column: Split layout. body = left column text, subtitle = right column text.
- three_cards: Three content cards. Include a "cards" array: [{"icon": "emoji", "title": "...", "body": "..."}]
- comparison_table: Versus/comparison. Include "columns": [{"header": "Us", "rows": ["row1", "row2"]}, {"header": "Them", "rows": ["row1", "row2"]}]
- stats_callout: Big numbers. Include "stats": [{"value": "47%", "label": "Growth rate"}]
- image_left / image_right: Slide with image placeholder. body = text content.
- quote: Inspirational or customer quote. title = quote text, subtitle = attribution.
- closing: Final slide. title = CTA or thank you, subtitle = contact info.

Guidelines:
- Always start with title_slide and end with closing
- Use variety of layouts — don't repeat the same layout 3+ times in a row
- Keep slide text concise — 3-5 bullets max per slide
- Include speaker notes for every slide
- 8-15 slides is ideal for most presentations
- Use concrete data/numbers when possible
- Each bullet point starts with "• "
- For comparison_table, use 3-5 rows per column`;

export async function POST(request: NextRequest) {
  try {
    const { prompt, mode } = await request.json();

    let enrichedPrompt = prompt;
    if (mode === "battle_card") {
      enrichedPrompt = `Create a competitive battle card presentation about: ${prompt}. Include slides for: company overview, their strengths, their weaknesses, our advantages, head-to-head comparison table, objection handling, and win strategy.`;
    } else if (mode === "sales_deck") {
      enrichedPrompt = `Create a sales pitch deck for: ${prompt}. Include slides for: attention-grabbing opening, the problem/pain point, our solution, key features (use three_cards), social proof/stats, comparison with alternatives, pricing/ROI, and a strong closing CTA.`;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: enrichedPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

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
