import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const SYSTEM = `You are a presentation editor AI. The user has a slide deck and wants to modify it.
You can see the full deck content. When the user asks for changes, return the COMPLETE updated slides array as JSON.

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

    const deckContext = `Current deck (${slides.length} slides):\n${JSON.stringify(slides, null, 2)}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM,
      messages: [
        { role: "user", content: `${deckContext}\n\nUser request: ${message}` },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

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
