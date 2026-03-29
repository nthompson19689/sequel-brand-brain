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

const RAPIDAPI_HOST = "fresh-linkedin-profile-data.p.rapidapi.com";

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
      case "save_refinement":
        return handleSaveRefinement(body, session.user.id);
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

/**
 * Normalize a LinkedIn URL to the full format the API expects.
 * Input:  "linkedin.com/in/foo", "https://linkedin.com/in/foo/", "www.linkedin.com/in/foo"
 * Output: "https://www.linkedin.com/in/foo/"
 */
function normalizeLinkedInUrl(raw: string): string | null {
  const match = raw.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) return null;
  return `https://www.linkedin.com/in/${match[1]}/`;
}

async function handleScrape(body: Record<string, unknown>) {
  const { linkedin_url } = body;
  if (!linkedin_url || typeof linkedin_url !== "string") {
    return Response.json({ error: "linkedin_url is required" }, { status: 400 });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    return Response.json(
      { error: "LinkedIn scraping is not configured. Please add RAPIDAPI_KEY to your environment variables." },
      { status: 503 }
    );
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedin_url);
  if (!normalizedUrl) {
    return Response.json(
      { error: "Could not parse LinkedIn URL. Please use a URL like linkedin.com/in/username" },
      { status: 400 }
    );
  }

  const apiHost = process.env.RAPIDAPI_LINKEDIN_HOST || RAPIDAPI_HOST;
  const headers: Record<string, string> = {
    "x-rapidapi-key": rapidApiKey.trim(),
    "x-rapidapi-host": apiHost,
  };

  // Log key info for debugging (first/last 4 chars only)
  const keyPreview = rapidApiKey.trim().length > 8
    ? `${rapidApiKey.trim().slice(0, 4)}...${rapidApiKey.trim().slice(-4)}`
    : "(too short)";
  console.log(`LinkedIn scrape: using key ${keyPreview}, host ${apiHost}, url ${normalizedUrl}`);

  try {
    // Fetch posts directly — this API takes the LinkedIn URL, no URN needed
    const allPosts: Array<{ text: string; preview: string; source_url: string }> = [];

    // Fetch up to 2 pages (0 = first 50, 50 = next 50)
    for (const start of [0, 50]) {
      const postsUrl =
        `https://${apiHost}/get-profile-posts?linkedin_url=${encodeURIComponent(normalizedUrl)}&type=posts&start=${start}`;
      console.log("LinkedIn scrape: fetching", postsUrl);

      const postsRes = await fetch(postsUrl, { method: "GET", headers });

      if (!postsRes.ok) {
        const errText = await postsRes.text();
        console.error(`LinkedIn posts fetch failed (start=${start}):`, postsRes.status, errText);
        if (start === 0) {
          // First page failed — return error
          return Response.json(
            { error: `Failed to fetch LinkedIn posts (${postsRes.status}). Check that RAPIDAPI_KEY is valid and you have an active subscription to Fresh LinkedIn Profile Data.` },
            { status: 502 }
          );
        }
        break; // Second page failed — just return what we have
      }

      const postsData = await postsRes.json();
      console.log(`LinkedIn posts response (start=${start}): keys=`, Object.keys(postsData));

      // The API returns { data: [...posts...] } or possibly just [...]
      let posts: unknown[] = [];
      if (Array.isArray(postsData?.data)) {
        posts = postsData.data;
      } else if (Array.isArray(postsData)) {
        posts = postsData;
      } else {
        console.log("LinkedIn posts unexpected shape:", JSON.stringify(postsData).slice(0, 500));
        break;
      }

      if (posts.length === 0) break;

      for (const post of posts) {
        if (!post || typeof post !== "object") continue;
        const p = post as Record<string, unknown>;
        // Try various field names the API might use
        const text = (p.text || p.content || p.commentary || p.post_text || "") as string;
        if (typeof text === "string" && text.trim().length > 0) {
          allPosts.push({
            text: text.trim(),
            preview: text.trim().slice(0, 100),
            source_url: (p.url || p.postUrl || p.post_url || p.share_url || p.permalink || "") as string,
          });
        }
      }

      // Stop if we have enough
      if (allPosts.length >= 15) break;
    }

    console.log(`LinkedIn scrape: found ${allPosts.length} posts`);
    return Response.json({ posts: allPosts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LinkedIn scrape error:", message);
    return Response.json({ error: `Failed to fetch LinkedIn posts: ${message}` }, { status: 500 });
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
  if (!supabase) {
    console.error("LinkedIn analyze: Supabase client not available");
    return Response.json({ voice_profile: voiceProfile, saved: false, error: "Database not configured" });
  }

  const { error: saveError } = await supabase
    .from("profiles")
    .update({
      linkedin_voice: voiceProfile,
      linkedin_samples: samples,
    })
    .eq("id", userId);

  if (saveError) {
    console.error("LinkedIn analyze: failed to save voice profile:", saveError.message);
    return Response.json(
      { error: `Voice analyzed but failed to save: ${saveError.message}`, voice_profile: voiceProfile, saved: false },
      { status: 500 }
    );
  }

  console.log("LinkedIn analyze: voice profile saved for user", userId);
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

// ─── action="save_refinement" ─────────────────────────────────────────────────

async function handleSaveRefinement(body: Record<string, unknown>, userId: string) {
  const { original, edited } = body;
  if (!original || typeof original !== "string" || !edited || typeof edited !== "string") {
    return Response.json({ error: "original and edited strings are required" }, { status: 400 });
  }

  // Don't save if nothing changed
  if (original.trim() === edited.trim()) {
    return Response.json({ saved: false, message: "No changes detected" });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Load existing refinements
  const { data: profile } = await supabase
    .from("profiles")
    .select("linkedin_refinements")
    .eq("id", userId)
    .single();

  const existing = Array.isArray(profile?.linkedin_refinements)
    ? (profile.linkedin_refinements as Array<{ original: string; edited: string }>)
    : [];

  // Keep last 20 refinements max
  const updated = [...existing, { original: original.trim(), edited: edited.trim() }].slice(-20);

  const { error } = await supabase
    .from("profiles")
    .update({ linkedin_refinements: updated })
    .eq("id", userId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ saved: true, count: updated.length });
}
