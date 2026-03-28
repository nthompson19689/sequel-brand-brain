import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

/**
 * POST /api/feedback/apply — Analyze all pending feedback and suggest prompt improvements.
 * Body: { agent_id, current_prompt }
 */
export async function POST(request: NextRequest) {
  try {
    const { agent_id, current_prompt } = await request.json();
    const supabase = getSupabaseServerClient();
    if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

    // Pull pending feedback
    const { data: feedback } = await supabase
      .from("agent_feedback")
      .select("*")
      .eq("agent_id", agent_id)
      .eq("applied_to_prompt", false)
      .order("created_at", { ascending: true });

    if (!feedback || feedback.length === 0) {
      return NextResponse.json({ message: "No pending feedback to apply", changes: [] });
    }

    // Build feedback summary for Claude
    const feedbackSummary = feedback.map((f, i) => {
      const parts = [`Feedback ${i + 1} (${f.feedback_type}):`];
      if (f.feedback_type === "explicit") {
        parts.push(`  User said: "${f.explicit_feedback}"`);
      } else if (f.feedback_type === "thumbs_down") {
        parts.push(`  User rated output negatively. Reason: "${f.explicit_feedback || "not specified"}"`);
      } else if (f.feedback_type === "thumbs_up") {
        parts.push(`  User rated output positively (keep doing what works).`);
      } else if (f.feedback_type === "edit_diff") {
        if (f.patterns_detected && Array.isArray(f.patterns_detected)) {
          parts.push(`  Patterns detected from user edits:`);
          for (const p of f.patterns_detected) {
            parts.push(`    - ${p.pattern} (${p.importance})`);
          }
        } else {
          parts.push(`  User edited the output (no specific patterns extracted).`);
        }
      }
      return parts.join("\n");
    }).join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Here is an AI agent's current system prompt, followed by ${feedback.length} pieces of user feedback.

CURRENT SYSTEM PROMPT:
${current_prompt}

USER FEEDBACK (${feedback.length} items):
${feedbackSummary}

Analyze the feedback for recurring themes. Then produce an UPDATED system prompt that incorporates the feedback as new rules or refinements.

Rules:
- DON'T rewrite the whole prompt — just ADD specific instructions that address the patterns
- If multiple edit diffs show the same pattern (e.g., removing emojis), add a clear rule
- If explicit feedback gives a direct instruction, add it as a rule
- Thumbs up signals = keep those behaviors, don't change them
- Be specific: "Never use emojis" not "Be careful with formatting"
- Add new rules at the END of the prompt in a "## Learned Preferences" section

Return ONLY valid JSON:
{
  "updated_prompt": "the full updated system prompt with new rules added",
  "changes_made": ["Added rule: no emojis", "Added rule: include metrics with sources"],
  "feedback_ids_addressed": ["id1", "id2"]
}`,
      }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse improvement suggestions" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);

    // Include feedback IDs so frontend can mark them as applied
    result.feedback_ids_addressed = result.feedback_ids_addressed || feedback.map((f) => f.id);
    result.total_feedback = feedback.length;

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Feedback] Apply error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH /api/feedback/apply — Mark feedback items as applied
 * Body: { feedback_ids: string[] }
 */
export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { feedback_ids } = await request.json();
  if (!Array.isArray(feedback_ids)) return NextResponse.json({ error: "Missing feedback_ids" }, { status: 400 });

  const { error } = await supabase
    .from("agent_feedback")
    .update({ applied_to_prompt: true })
    .in("id", feedback_ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, marked: feedback_ids.length });
}
