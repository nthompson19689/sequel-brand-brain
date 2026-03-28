import { getClaudeClient } from "@/lib/claude";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/brain/classify — Classify a document using Claude.
 * Accepts { text: string } and returns { type: string, name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: string };

    if (!text || text.trim().length < 20) {
      return Response.json(
        { error: "Text must be at least 20 characters" },
        { status: 400 }
      );
    }

    const claude = getClaudeClient();

    // Use first ~1500 words for classification
    const words = text.trim().split(/\s+/);
    const excerpt = words.slice(0, 1500).join(" ");

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: `You classify brand/marketing documents. Respond with ONLY valid JSON, no markdown fences.`,
      messages: [
        {
          role: "user",
          content: `Read this document and classify it as exactly one of these types:
- mission_vision_values (company mission, vision, values, purpose)
- voice_and_tone (brand voice guidelines, tone of voice rules)
- editorial_longform (editorial style guide for long content like blogs, whitepapers)
- editorial_shortform (style guide for short content like social media, emails, ads)
- content_examples (example content pieces, sample writing)
- positioning (market positioning, value propositions, messaging framework)
- icp (ideal customer profile, target audience, buyer personas)
- other (anything that doesn't fit the above)

Also suggest a short descriptive name for this document (max 6 words).

Return ONLY JSON: {"type": "...", "name": "..."}

Document:
${excerpt}`,
        },
      ],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const result = JSON.parse(cleaned);

    // Validate type
    const validTypes = [
      "mission_vision_values",
      "voice_and_tone",
      "editorial_longform",
      "editorial_shortform",
      "content_examples",
      "positioning",
      "icp",
      "other",
    ];

    if (!validTypes.includes(result.type)) {
      result.type = "other";
    }

    return Response.json({
      type: result.type,
      name: result.name || "Untitled Document",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Classification failed";
    console.error("[Classify] Error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
