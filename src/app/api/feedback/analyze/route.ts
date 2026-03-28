import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

/**
 * POST /api/feedback/analyze — Compare original vs edited output, detect patterns.
 */
export async function POST(request: NextRequest) {
  try {
    const { original, edited } = await request.json();
    if (!original || !edited) {
      return NextResponse.json({ error: "Both original and edited required" }, { status: 400 });
    }

    // Skip if no meaningful changes
    const origClean = original.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const editClean = edited.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (origClean === editClean) {
      return NextResponse.json({ patterns: [], no_changes: true });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Compare the original AI output with the user's edited version. Identify the specific patterns the user changed. Be precise — not "made it better" but specific actionable patterns like:
- "removed all emojis"
- "shortened the introduction from 4 sentences to 1"
- "added specific metrics where there were vague claims"
- "changed formal tone to conversational"
- "removed the FAQ section"
- "replaced generic CTAs with specific ones"
- "cut filler phrases and hedge words"
- "added section headers that were missing"
- "removed repetitive sentences"

Return ONLY valid JSON — an array of patterns:
[{"pattern": "description of what was changed", "importance": "high|medium|low"}]

ORIGINAL OUTPUT:
${origClean.slice(0, 6000)}

USER'S EDITED VERSION:
${editClean.slice(0, 6000)}`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ patterns: [{ pattern: "User made edits", importance: "medium" }] });
    }

    const patterns = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ patterns });
  } catch (err) {
    console.error("[Feedback] Analyze error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
