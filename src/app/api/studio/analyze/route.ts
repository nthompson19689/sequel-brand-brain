import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const ANALYZE_PROMPT = `You are a content strategist analyzing a transcript to extract the best material for thought leadership content.

Your job:
1. Write a 2-3 sentence topic summary capturing what this conversation was about and why it matters.
2. Extract the 10-15 STRONGEST direct quotes. Prioritize quotes that are: opinionated (the speaker has a clear point of view), specific (includes data, examples, or concrete details), surprising (challenges conventional wisdom or reveals something unexpected), or emotionally resonant. Avoid generic statements like "it's really important" or "we need to think about this."
3. Identify 3-5 key themes that emerged from the conversation.

Return ONLY valid JSON:
{
  "topic_summary": "2-3 sentence summary",
  "key_quotes": [
    { "quote": "exact quote text", "topic_tag": "theme this quote relates to", "strength": "strong|medium" }
  ],
  "key_themes": ["theme 1", "theme 2", "theme 3"]
}

Rules:
- Quotes must be EXACT — do not paraphrase or clean up the speaker's words
- If the transcript has timestamps, include them with the quote
- Rank quotes by impact — strongest first
- Themes should be specific enough to build a blog post around, not generic like "marketing"`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { source_id } = await request.json();
  if (!source_id) return Response.json({ error: "source_id required" }, { status: 400 });

  const { data: source, error: srcErr } = await supabase
    .from("studio_sources")
    .select("id, raw_transcript, speaker_name, speaker_title, speaker_company")
    .eq("id", source_id)
    .single();

  if (srcErr || !source) return Response.json({ error: "Source not found" }, { status: 404 });

  try {
    const claude = getClaudeClient();

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [{ type: "text", text: ANALYZE_PROMPT }],
      messages: [{
        role: "user",
        content: `Analyze this transcript from ${source.speaker_name || "the speaker"} (${source.speaker_title || ""} at ${source.speaker_company || ""}):\n\n${source.raw_transcript}`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let analysis;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      await supabase.from("studio_sources").update({
        topic_summary: rawText, status: "ready", updated_at: new Date().toISOString(),
      }).eq("id", source_id);
      return Response.json({ source_id, raw: rawText, parsed: false });
    }

    await supabase.from("studio_sources").update({
      topic_summary: analysis.topic_summary || null,
      key_quotes: analysis.key_quotes || [],
      key_themes: analysis.key_themes || [],
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", source_id);

    return Response.json({ source_id, analysis, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    console.error("[Studio Analyze]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
