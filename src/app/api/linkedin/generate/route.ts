import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    // Authenticate
    const supabaseAuth = createSupabaseServerAuthClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { topic, context } = await request.json();
    if (!topic || typeof topic !== "string") {
      return Response.json({ error: "topic is required" }, { status: 400 });
    }

    // Load user's voice profile
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return Response.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("linkedin_voice, linkedin_samples, linkedin_refinements")
      .eq("id", session.user.id)
      .single();

    if (!profile?.linkedin_voice) {
      return Response.json(
        { error: "No LinkedIn voice profile found. Please analyze your LinkedIn voice first in Settings." },
        { status: 400 }
      );
    }

    const voice = profile.linkedin_voice as Record<string, unknown>;
    const samples = (profile.linkedin_samples as string[]) || [];
    const refinements = (profile.linkedin_refinements as Array<{ original: string; edited: string }>) || [];

    // Build example posts section — this is the most important part for voice matching
    const examplesSection = samples.length > 0
      ? `=== EXAMPLE POSTS (THIS IS YOUR PRIMARY REFERENCE) ===
Match this voice exactly. Here are examples of how this person writes:

${samples.slice(0, 3).map((s, i) => `--- Example ${i + 1} ---\n${s}`).join("\n\n")}

^^^ The examples above are MORE IMPORTANT than the voice description below. Study the exact word choices, sentence structures, paragraph lengths, and formatting patterns in these examples and replicate them.`
      : "";

    // Build refinements section — these show the user's editing preferences
    const refinementsSection = refinements.length > 0
      ? `=== REFINEMENT HISTORY (LEARN FROM THESE EDITS) ===
The user has edited previous AI-generated posts. Study what they changed to understand their preferences. Apply these patterns to all future posts.

${refinements.slice(-5).map((r, i) => `--- Edit ${i + 1} ---
BEFORE (AI generated):
${r.original}

AFTER (user's preferred version):
${r.edited}
`).join("\n")}
^^^ Pay close attention to what the user changed: wording, length, structure, tone. Apply these preferences going forward.`
      : "";

    // Build system prompt with voice profile
    const voiceInstructions = `You are a LinkedIn ghostwriter. You write posts that perfectly match this person's authentic voice.

${examplesSection}

${refinementsSection}

=== VOICE PROFILE (Style Rules) ===
Voice Summary: ${voice.voice_summary || "Professional, engaging LinkedIn writer"}
Tone: ${Array.isArray(voice.tone) ? (voice.tone as string[]).join(", ") : "professional, conversational"}
Formatting Patterns: ${Array.isArray(voice.formatting_patterns) ? (voice.formatting_patterns as string[]).join("; ") : "short paragraphs, line breaks between ideas"}
Closing Style: ${voice.closing_style || "ends with a question or call to action"}
Emoji Usage: ${voice.emoji_usage || "minimal"}
Hashtag Usage: ${voice.hashtag_usage || "none"}
Signature Phrases: ${Array.isArray(voice.signature_phrases) ? (voice.signature_phrases as string[]).join(", ") : "none identified"}
Common Topics: ${Array.isArray(voice.common_topics) ? (voice.common_topics as string[]).join(", ") : "business, leadership"}

=== RULES ===
- Write in first person as this person
- Match their exact formatting style (paragraph length, line breaks, emphasis patterns)
- Match their tone and vocabulary level
- Use emojis only if they typically do, and in the same way
- Use hashtags only if they typically do, and in the same way
- Each variant should feel like THEY wrote it, not a generic AI post
- Separate each variant with the exact marker: ---VARIANT---
- Start each variant with a label line: "**Variant A: Short & Punchy**" then a blank line, then the post
- CRITICAL: Each variant must be a DIFFERENT LENGTH as specified below

=== OUTPUT FORMAT ===
Write exactly 3 variants separated by ---VARIANT--- markers. Each variant must be a distinctly different length:

**Variant A: Short & Punchy**

[A concise, punchy post — 50-80 words max. Get straight to the point. One strong idea, no fluff. Think: a single powerful insight or hot take.]

---VARIANT---

**Variant B: Medium**

[A well-developed post — 120-180 words. Room to tell a brief story or develop an argument with 2-3 supporting points. This is the standard LinkedIn post length.]

---VARIANT---

**Variant C: Long & In-Depth**

[A longer, more informative post — 250-350 words. Tell a fuller story, share a detailed framework, or walk through a lesson with examples. This should feel like a mini-article that gives readers real substance.]`;

    const { blocks: systemBlocks } = await buildSystemBlocks({
      additionalContext: voiceInstructions,
    });

    const examplesReminder = samples.length > 0
      ? "\n\nIMPORTANT: The example posts in the system prompt are more important than the voice description. Match the writing style of the examples exactly."
      : "";

    const userMessage = context
      ? `Write 3 LinkedIn post variants about this topic: ${topic}\n\nAdditional context: ${context}${examplesReminder}`
      : `Write 3 LinkedIn post variants about this topic: ${topic}${examplesReminder}`;

    const claude = getClaudeClient();
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        try {
          send({ type: "status", message: "Generating LinkedIn posts in your voice..." });

          const stream = await claude.messages.stream({
            model: resolveModel("claude-sonnet-4-6"),
            max_tokens: MAX_TOKENS,
            system: systemBlocks,
            messages: [{ role: "user", content: userMessage }],
          });

          let fullContent = "";
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullContent += event.delta.text;
              send({ type: "delta", text: event.delta.text });
            }
          }

          const finalMsg = await stream.finalMessage();
          logCachePerformance("/api/linkedin/generate", finalMsg.usage);

          // Parse variants
          const variantTexts = fullContent.split("---VARIANT---").map((v) => v.trim()).filter(Boolean);
          const variants = variantTexts.map((text, i) => {
            const labelMatch = text.match(/^\*\*Variant\s+[A-C]:\s*(.+?)\*\*/);
            const label = labelMatch ? labelMatch[1].trim() : `Variant ${String.fromCharCode(65 + i)}`;
            const content = labelMatch ? text.slice(labelMatch[0].length).trim() : text;
            return { label, content };
          });

          // Save to linkedin_posts table
          if (variants.length > 0) {
            await supabase.from("linkedin_posts").insert({
              user_id: session.user.id,
              topic,
              context: context || null,
              variants,
              raw_output: fullContent,
            });
          }

          send({ type: "complete", variants });
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Generation failed";
          send({ type: "error", error: message });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn generate error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
