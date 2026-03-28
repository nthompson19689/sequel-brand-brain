import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface VoiceProfile {
  hook_styles: string[];
  tone: string[];
  formatting_patterns: string[];
  common_topics: string[];
  signature_phrases: string[];
  closing_style: string;
  post_length: string;
  emoji_usage: string;
  hashtag_usage: string;
  voice_summary: string;
}

const ANALYZE_SYSTEM = `You are a LinkedIn voice analyst. Your job is to analyze a person's LinkedIn posting style by searching for their recent posts.

You will be given a LinkedIn profile URL. Use web search to find their LinkedIn posts and analyze their writing patterns.

You MUST return ONLY valid JSON (no markdown, no code fences, no explanation) in this exact format:
{
  "hook_styles": ["style1", "style2", "style3"],
  "tone": ["descriptor1", "descriptor2", "descriptor3"],
  "formatting_patterns": ["pattern1", "pattern2", "pattern3"],
  "common_topics": ["topic1", "topic2", "topic3"],
  "signature_phrases": ["phrase1", "phrase2"],
  "closing_style": "description of how they typically close posts",
  "post_length": "short/medium/long with approximate word count",
  "emoji_usage": "none/minimal/moderate/heavy with examples",
  "hashtag_usage": "none/minimal/moderate/heavy with examples",
  "voice_summary": "A 2-3 sentence summary of this person's LinkedIn voice and style"
}

Guidelines:
- hook_styles: Identify 2-4 distinct ways they open posts (e.g., "bold contrarian statement", "personal story opener", "surprising statistic", "direct question")
- tone: 3-5 adjectives describing their overall tone (e.g., "conversational", "authoritative", "vulnerable", "witty")
- formatting_patterns: How they structure posts (e.g., "short single-line paragraphs", "uses line breaks heavily", "numbered lists", "uses bold for emphasis")
- common_topics: 3-6 themes they post about most
- signature_phrases: Any recurring phrases or verbal tics
- closing_style: How they typically end posts (e.g., "asks a question to the audience", "ends with a call to action", "summarizes the key takeaway")
- post_length: Typical post length
- emoji_usage: How they use emojis
- hashtag_usage: How they use hashtags
- voice_summary: A concise summary paragraph

If you cannot find enough posts, still provide your best analysis based on what you find. Return ONLY the JSON object.`;

export async function POST(request: Request) {
  try {
    // Authenticate
    const supabaseAuth = createSupabaseServerAuthClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { linkedin_url } = await request.json();
    if (!linkedin_url || typeof linkedin_url !== "string") {
      return Response.json({ error: "linkedin_url is required" }, { status: 400 });
    }

    const claude = getClaudeClient();

    const response = await claude.messages.create({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: ANALYZE_SYSTEM }],
      tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
      messages: [
        {
          role: "user",
          content: `Analyze the LinkedIn voice and posting style of the person at this profile URL: ${linkedin_url}\n\nSearch for their recent LinkedIn posts and analyze their writing patterns. Return ONLY the JSON voice profile.`,
        },
      ],
    });

    // Extract text from response
    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    // Parse the JSON from the response
    let voiceProfile: VoiceProfile;
    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return Response.json({ error: "Failed to parse voice profile from analysis" }, { status: 500 });
      }
      voiceProfile = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: "Failed to parse voice profile JSON" }, { status: 500 });
    }

    // Save to profiles table using service role client
    const supabase = getSupabaseServerClient();
    if (supabase) {
      await supabase
        .from("profiles")
        .update({
          linkedin_voice: voiceProfile,
          linkedin_url: linkedin_url,
        })
        .eq("id", session.user.id);
    }

    return Response.json({ voice_profile: voiceProfile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn analyze error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
