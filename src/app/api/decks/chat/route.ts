import { NextRequest } from "next/server";
import { getClaudeClient, resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const DECK_CHAT_CONTEXT = `You are a presentation editor AI for Sequel. The user has a slide deck and wants to modify it.
You can see the full deck content. When the user asks for changes, return the COMPLETE updated slides array as JSON.

Use the brand context above to ensure all content matches Sequel's voice, messaging, and positioning.

IMPORTANT: Always return ONLY a JSON object with this structure:
{"slides": [...]}

Each slide has: id, layout, title, subtitle, body, speakerNotes, and optionally cards/columns/stats.

Available layouts: title_slide, bullets, two_column, three_cards, comparison_table, stats_callout, image_left, image_right, quote, closing

When adding slides, generate a new random ID (use a UUID-like string).
When modifying, keep existing IDs.
When removing, omit the slide from the array.

If the user asks something that doesn't require changing slides (like a question), respond with:
{"message": "your response here", "slides": null}`;

export async function POST(request: NextRequest) {
  try {
    const { message, slides } = await request.json();

    const { blocks: systemBlocks } = await buildSystemBlocks({
      additionalContext: DECK_CHAT_CONTEXT,
    });

    const deckContext = `Current deck (${slides.length} slides):\n${JSON.stringify(slides, null, 2)}`;

    const claude = getClaudeClient();
    const response = await claude.messages.create({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: 8192,
      system: systemBlocks,
      messages: [
        { role: "user", content: `${deckContext}\n\nUser request: ${message}` },
      ],
    });

    logCachePerformance("/api/decks/chat", response.usage);

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ message: text, slides: null });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json(parsed);
  } catch (err) {
    console.error("[DeckChat] Error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
