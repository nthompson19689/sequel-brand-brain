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

const SCRAPE_SYSTEM = `You are a LinkedIn post researcher. Your job is to find a person's actual LinkedIn posts using web search.

You will be given a LinkedIn profile URL and optionally a person's name. Use web search to find their LinkedIn posts.

Search strategies (try ALL of these):
1. Search "site:linkedin.com/posts [person name]"
2. Search "[person name] linkedin posts"
3. Search "site:linkedin.com [profile_url]"
4. Search "[person name] site:linkedin.com"

CRITICAL ANTI-HALLUCINATION RULES:
- ONLY return text you can see VERBATIM in the search results or on a page you visited.
- Every post MUST include a "source_url" — the actual URL where you found it. If you cannot provide a real URL, do NOT include the post.
- NEVER invent, imagine, reconstruct, or "fill in" post content. If you can only see a snippet, return ONLY that snippet — do NOT expand it.
- It is MUCH better to return 1-2 real posts (or even zero) than to return fake ones.
- If a search result only shows a preview/snippet of a post, set "partial" to true and return ONLY the visible text.
- If you find ZERO verifiable posts, return { "posts": [] }. This is a completely valid outcome.
- Do NOT apologize or explain if you find nothing — just return the empty array.

You MUST return ONLY valid JSON (no markdown, no code fences, no explanation) in this format:
{
  "posts": [
    {
      "text": "ONLY the exact text you can see — never fabricated or expanded",
      "source_url": "https://linkedin.com/posts/... the actual URL",
      "partial": false,
      "preview": "First 100 characters..."
    }
  ]
}

Return ONLY the JSON object.`;

const ANALYZE_SYSTEM = `You are a LinkedIn voice analyst. Your job is to analyze a set of LinkedIn posts and extract the writer's voice profile.

You will be given actual LinkedIn posts written by a person. Analyze their writing patterns carefully.

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
- closing_style: How they typically end posts (e.g., "asks a question to the audience", "ends with a call to action")
- post_length: Typical post length
- emoji_usage: How they use emojis
- hashtag_usage: How they use hashtags
- voice_summary: A concise summary paragraph

Analyze ONLY the posts provided. Base your analysis entirely on these specific examples. Return ONLY the JSON object.`;

export async function POST(request: Request) {
  try {
    // Authenticate
    const supabaseAuth = createSupabaseServerAuthClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return Response.json({ error: "action is required" }, { status: 400 });
    }

    switch (action) {
      case "scrape":
        return handleScrape(body);
      case "analyze":
        return handleAnalyze(body, session.user.id);
      case "save_samples":
        return handleSaveSamples(body, session.user.id);
      case "add_sample":
        return handleAddSample(body, session.user.id);
      case "remove_sample":
        return handleRemoveSample(body, session.user.id);
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn analyze error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── action="scrape" ───────────────────────────────────────────────────────────

async function handleScrape(body: Record<string, unknown>) {
  const { linkedin_url, full_name } = body;
  if (!linkedin_url || typeof linkedin_url !== "string") {
    return Response.json({ error: "linkedin_url is required" }, { status: 400 });
  }

  const claude = getClaudeClient();
  const nameStr = full_name && typeof full_name === "string" ? full_name : "";

  const searchInstructions = [
    `Search for: site:linkedin.com ${linkedin_url} posts`,
    nameStr ? `Also search for: ${nameStr} linkedin posts` : null,
    nameStr ? `Also try: site:linkedin.com/posts ${nameStr}` : null,
  ].filter(Boolean).join("\n");

  // Use an agentic loop: Claude may need multiple turns of web_search before
  // producing a final text response with JSON.
  type MessageParam = { role: "user" | "assistant"; content: unknown };
  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Find LinkedIn posts from this profile: ${linkedin_url}${nameStr ? `\nPerson's name: ${nameStr}` : ""}\n\n${searchInstructions}\n\nReturn the posts as JSON.`,
    },
  ];

  let rawText = "";
  const MAX_TURNS = 6;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await claude.messages.create({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: SCRAPE_SYSTEM }],
      tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 10 }],
      messages,
    });

    // Collect any text blocks from this turn
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    // If Claude is done (not requesting another tool call), break
    if (response.stop_reason !== "tool_use") break;

    // Otherwise, feed the assistant response back and add an empty user turn
    // so the API can continue (server-side tools auto-resolve, but we still
    // need to continue the conversation loop).
    messages.push({ role: "assistant", content: response.content });
    // For server-side tools like web_search, the API handles the tool result
    // internally. We just need to send a continuation user message.
    messages.push({ role: "user", content: "Continue searching and return the JSON when done." });
  }

  // Parse the JSON from accumulated text blocks
  try {
    // Try to find a JSON object with a "posts" key
    const jsonMatch = rawText.match(/\{[\s\S]*"posts"[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found at all, return empty posts (not an error — Claude
      // may legitimately have found nothing)
      console.log("LinkedIn scrape: no JSON found in response. rawText:", rawText.slice(0, 500));
      return Response.json({ posts: [] });
    }
    const result = JSON.parse(jsonMatch[0]);
    const rawPosts: Array<{ text?: string; source_url?: string; partial?: boolean; preview?: string }> =
      result.posts || [];

    // Filter out posts without a real LinkedIn source URL (anti-hallucination)
    const verifiedPosts = rawPosts.filter((p) => {
      if (!p.text || typeof p.text !== "string" || p.text.trim().length === 0) return false;
      if (!p.source_url || typeof p.source_url !== "string") return false;
      // Must be an actual LinkedIn URL, not a placeholder
      return p.source_url.includes("linkedin.com/");
    });

    return Response.json({ posts: verifiedPosts });
  } catch (parseErr) {
    console.error("LinkedIn scrape JSON parse error:", parseErr, "rawText:", rawText.slice(0, 500));
    // Return empty posts instead of a hard error — better UX
    return Response.json({ posts: [] });
  }
}

// ─── action="analyze" ──────────────────────────────────────────────────────────

async function handleAnalyze(body: Record<string, unknown>, userId: string) {
  const { samples } = body;
  if (!Array.isArray(samples) || samples.length === 0) {
    return Response.json({ error: "samples array is required and must not be empty" }, { status: 400 });
  }

  const claude = getClaudeClient();

  const postsText = (samples as string[])
    .map((text, i) => `--- Post ${i + 1} ---\n${text}`)
    .join("\n\n");

  const response = await claude.messages.create({
    model: resolveModel("claude-sonnet-4-6"),
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: ANALYZE_SYSTEM }],
    messages: [
      {
        role: "user",
        content: `Analyze the voice and writing style of these LinkedIn posts:\n\n${postsText}\n\nReturn ONLY the JSON voice profile.`,
      },
    ],
  });

  // Extract text from response
  let rawText = "";
  for (const block of response.content) {
    if (block.type === "text") rawText += block.text;
  }

  // Parse the JSON
  let voiceProfile: VoiceProfile;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Failed to parse voice profile from analysis" }, { status: 500 });
    }
    voiceProfile = JSON.parse(jsonMatch[0]);
  } catch {
    return Response.json({ error: "Failed to parse voice profile JSON" }, { status: 500 });
  }

  // Save both voice profile and samples to profiles table
  const supabase = getSupabaseServerClient();
  if (supabase) {
    await supabase
      .from("profiles")
      .update({
        linkedin_voice: voiceProfile,
        linkedin_samples: samples,
      })
      .eq("id", userId);
  }

  return Response.json({ voice_profile: voiceProfile, saved: true });
}

// ─── action="save_samples" ─────────────────────────────────────────────────────

async function handleSaveSamples(body: Record<string, unknown>, userId: string) {
  const { samples } = body;
  if (!Array.isArray(samples)) {
    return Response.json({ error: "samples array is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ linkedin_samples: samples })
    .eq("id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ saved: true, count: samples.length });
}

// ─── action="add_sample" ──────────────────────────────────────────────────────

async function handleAddSample(body: Record<string, unknown>, userId: string) {
  const { text } = body;
  if (!text || typeof text !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Load existing samples
  const { data: profile } = await supabase
    .from("profiles")
    .select("linkedin_samples")
    .eq("id", userId)
    .single();

  const existing = Array.isArray(profile?.linkedin_samples) ? (profile.linkedin_samples as string[]) : [];
  const updated = [...existing, text];

  const { error } = await supabase
    .from("profiles")
    .update({ linkedin_samples: updated })
    .eq("id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ saved: true, count: updated.length });
}

// ─── action="remove_sample" ───────────────────────────────────────────────────

async function handleRemoveSample(body: Record<string, unknown>, userId: string) {
  const { index } = body;
  if (typeof index !== "number" || index < 0) {
    return Response.json({ error: "index (non-negative number) is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Load existing samples
  const { data: profile } = await supabase
    .from("profiles")
    .select("linkedin_samples")
    .eq("id", userId)
    .single();

  const existing = Array.isArray(profile?.linkedin_samples) ? (profile.linkedin_samples as string[]) : [];

  if (index >= existing.length) {
    return Response.json({ error: `Index ${index} out of range (${existing.length} samples)` }, { status: 400 });
  }

  const updated = [...existing.slice(0, index), ...existing.slice(index + 1)];

  const { error } = await supabase
    .from("profiles")
    .update({ linkedin_samples: updated })
    .eq("id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ saved: true, count: updated.length });
}
