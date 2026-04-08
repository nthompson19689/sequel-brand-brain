/**
 * POST /api/voice/generate-longform — Long-form content generator for the
 * Dictate page's Command mode.
 *
 * Takes raw voice-transcribed source material and runs it through the
 * full writer → editor pipeline used by the content pipeline. Creates a
 * content_posts record so the output lands in the Content Pipeline too,
 * and streams progress events back to the UI via SSE.
 *
 * Supported content types:
 *   - "thought_leadership_post" — opinion-driven editorial post. Keyword
 *     is optional and derived from the transcript if not provided.
 *   - "seo_blog_post" — keyword-targeted SEO blog post. Keyword is
 *     required (the UI enforces this).
 *
 * Request body:
 *   {
 *     contentType: "thought_leadership_post" | "seo_blog_post",
 *     transcript: string,          // raw voice notes / source material
 *     keyword?: string,            // required for seo_blog_post
 *     wordCount?: number,          // default 1500
 *   }
 *
 * Response: SSE stream with the same event shapes as /api/content/write
 * and /api/content/edit (status, delta, complete, error), plus a top-
 * level `post_created` event that carries the new postId so the UI can
 * link out to /content/[id].
 */
import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runThreeAgentWriter } from "@/lib/content/writer-pipeline";
import { runEditorPipeline } from "@/lib/content/editor-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

type LongFormType = "thought_leadership_post" | "seo_blog_post";

interface GenerateLongformRequest {
  contentType: LongFormType;
  transcript: string;
  keyword?: string;
  wordCount?: number;
}

const LABELS: Record<LongFormType, string> = {
  thought_leadership_post: "Thought Leadership Post",
  seo_blog_post: "SEO-Friendly Blog Post",
};

/**
 * Wrap the raw voice transcript into a "brief" shape the writer pipeline
 * can work from. The writer pipeline expects structured brief copy — by
 * framing the transcript as source material with explicit guidance, we
 * let the three-agent writer treat it the same way it treats a real
 * brief. We do NOT try to fabricate section outlines or internal links;
 * the writer already knows how to structure a piece around voice notes.
 */
function wrapTranscriptAsBrief(
  contentType: LongFormType,
  transcript: string,
  keyword: string | null,
): string {
  if (contentType === "thought_leadership_post") {
    return `This brief was dictated by a subject-matter expert through a microphone, not drafted as a traditional SEO brief. Treat the SOURCE MATERIAL below as raw thinking from the author — their opinions, observations, anecdotes, and angle. Your job is to turn this into a polished thought leadership post.

**Content type:** Thought Leadership Post
**Voice:** First-person-plural editorial (use "we" / "our" per Sequel voice). Opinion-driven. Confident. Not a listicle.
**Angle:** Preserve the speaker's thesis and point of view exactly. Do NOT neutralize their stance.
${keyword ? `**Topic focus:** ${keyword}\n` : ""}**Structure guidance:**
- Strong opinionated hook — what does the author believe that most people don't?
- Body that earns the argument with evidence, examples, and the speaker's own observations from the source material
- A clear takeaway section that states the author's position cleanly
- No fluff, no jargon, no kill-list phrases

**Rules for using the source material:**
1. Preserve every fact, number, name, and proper noun the speaker mentioned.
2. Preserve the speaker's opinions and phrasings where they're distinctive — these are the voice.
3. Do NOT invent facts, statistics, or citations the speaker didn't provide.
4. Remove filler, false starts, and self-corrections from the source before weaving it in.
5. If the speaker rambled across multiple ideas, pick the strongest thesis and build the post around it.

## SOURCE MATERIAL (voice dictation)

${transcript}`;
  }

  // SEO blog post
  return `This brief was dictated by a subject-matter expert through a microphone. Treat the SOURCE MATERIAL below as the author's raw thinking on the topic. Your job is to turn it into a polished SEO blog post targeting the primary keyword.

**Content type:** SEO-Friendly Blog Post
**Primary keyword:** ${keyword || "[NOT SPECIFIED — pick the most obvious keyword from the source material]"}
**Voice:** Sequel editorial voice (first-person-plural "we" / "our", essay style not listicle, no fluff). Informational and authoritative.
**Search intent:** Informational
**Structure guidance:**
- Strong intro that addresses the search intent immediately (answer-forward for AEO)
- Body with clear H2 subheadings that naturally incorporate the primary keyword and related terms
- Scannable paragraphs, but still essay-like — not a bullet-point listicle
- A conclusion that reinforces the main point and points to next steps
- Natural internal link opportunities (use the sitemap from your system context)

**Rules for using the source material:**
1. Preserve every fact, number, name, proper noun, and explicit opinion the speaker mentioned.
2. Do NOT invent statistics, citations, or claims the speaker didn't provide.
3. Remove filler, false starts, and self-corrections before weaving the content in.
4. The primary keyword should appear naturally — don't stuff it. Aim for the keyword in the H1, intro, and at least one H2.
5. If the source material is thin, expand on the speaker's points with brand-aligned analysis, but flag nothing as fact unless the speaker said it.

## SOURCE MATERIAL (voice dictation)

${transcript}`;
}

/**
 * Extract a primary keyword from a transcript when the user didn't
 * provide one. Uses a dumb heuristic — the first meaningful noun phrase
 * from the first sentence. This only ever runs for thought leadership
 * posts, where the keyword is informational metadata and not load-
 * bearing for the output.
 */
function deriveKeyword(transcript: string): string {
  const firstSentence = transcript.split(/[.!?\n]/)[0] || transcript;
  const words = firstSentence
    .trim()
    .split(/\s+/)
    .slice(0, 10)
    .join(" ");
  return words.slice(0, 200).trim() || "voice dictation";
}

export async function POST(request: Request) {
  let body: GenerateLongformRequest;
  try {
    body = (await request.json()) as GenerateLongformRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contentType = body.contentType;
  const transcript = (body.transcript || "").trim();
  const keywordRaw = (body.keyword || "").trim();
  const wordCount = body.wordCount && body.wordCount > 0 ? body.wordCount : 1500;

  if (contentType !== "thought_leadership_post" && contentType !== "seo_blog_post") {
    return Response.json(
      {
        error:
          "contentType must be 'thought_leadership_post' or 'seo_blog_post'",
      },
      { status: 400 },
    );
  }

  if (!transcript) {
    return Response.json({ error: "Empty transcript" }, { status: 400 });
  }

  if (contentType === "seo_blog_post" && !keywordRaw) {
    return Response.json(
      { error: "SEO Blog Post requires a target keyword" },
      { status: 400 },
    );
  }

  const keyword =
    keywordRaw || (contentType === "thought_leadership_post" ? deriveKeyword(transcript) : "");
  const brief = wrapTranscriptAsBrief(contentType, transcript, keyword || null);
  const label = LABELS[contentType];
  const postTypeValue =
    contentType === "seo_blog_post" ? "pillar" : "supporting";
  const searchIntent =
    contentType === "seo_blog_post" ? "informational" : "thought_leadership";

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };

      try {
        // --- 1. Create the content_posts record (if Supabase is wired up) --
        let postId: string | null = null;
        if (supabase) {
          const { data: inserted, error: insertErr } = await supabase
            .from("content_posts")
            .insert({
              primary_keyword: keyword || deriveKeyword(transcript),
              brief,
              status: "brief_approved",
              post_type: postTypeValue,
              search_intent: searchIntent,
              word_count: wordCount,
            })
            .select("id")
            .single();

          if (insertErr) {
            console.error(
              "[api/voice/generate-longform] post insert failed:",
              insertErr,
            );
            send({
              type: "status",
              step: "post_create",
              message: `Could not create content_posts record: ${insertErr.message}. Continuing without persistence.`,
            });
          } else if (inserted) {
            postId = inserted.id as string;
            send({
              type: "post_created",
              postId,
              contentType,
              label,
              keyword: keyword || null,
            });
          }
        } else {
          send({
            type: "status",
            step: "post_create",
            message: "Supabase not configured — running writer/editor without persistence.",
          });
        }

        // --- 2. Run the three-agent writer ----------------------------------
        send({
          type: "status",
          step: "writing",
          message: `Three-agent writer booting for ${label} (target ${wordCount} words)`,
        });

        const writeResult = await runThreeAgentWriter({
          claude,
          brief,
          wordCount,
          send,
          stageName: "write",
        });

        if (supabase && postId) {
          const { error: updateErr } = await supabase
            .from("content_posts")
            .update({
              draft: writeResult.draft,
              word_count: writeResult.draft
                .split(/\s+/)
                .filter(Boolean).length,
              status: "draft_complete",
            })
            .eq("id", postId);
          if (updateErr) {
            console.error(
              "[api/voice/generate-longform] draft update failed:",
              updateErr,
            );
          }
        }

        send({
          type: "draft_complete",
          draft: writeResult.draft,
          sectionWordCounts: writeResult.sectionWordCounts,
        });

        // --- 3. Run the editor pipeline --------------------------------------
        send({
          type: "status",
          step: "editing",
          message: "Editor pipeline booting: scan → apply → link recovery",
        });

        const editResult = await runEditorPipeline({
          claude,
          draft: writeResult.draft,
          wordCount,
          send,
          stageName: "edit",
        });

        if (supabase && postId) {
          const { error: updateErr } = await supabase
            .from("content_posts")
            .update({
              edited_draft: editResult.cleanDraft,
              editor_notes: {
                call1: editResult.reviewNotes,
                violations: editResult.violations,
                gates: editResult.gates,
                gatesPassed: editResult.gatesPassed,
                gatesTotal: editResult.gatesTotal,
                linksPreserved: editResult.linksPreserved,
                externalLinksOriginal: editResult.externalLinksOriginal,
                externalLinksPreservedAfterEdit:
                  editResult.externalLinksPreservedAfterEdit,
                externalLinksDropped: editResult.externalLinksDropped,
                externalLinksRecovered: editResult.externalLinksRecovered,
                forbiddenLinksStripped: editResult.forbiddenLinksStripped,
                brokenExternalUrlsRemoved: editResult.brokenExternalUrlsRemoved,
                sourceOrigin: "voice_dictation",
              },
              word_count: editResult.cleanDraft
                .split(/\s+/)
                .filter(Boolean).length,
              status: "edited",
            })
            .eq("id", postId);
          if (updateErr) {
            console.error(
              "[api/voice/generate-longform] edited update failed:",
              updateErr,
            );
          }
        }

        send({
          type: "complete",
          postId,
          contentType,
          label,
          keyword: keyword || null,
          editedDraft: editResult.cleanDraft,
          draft: writeResult.draft,
          editorNotes: editResult.reviewNotes,
          gates: editResult.gates,
          gatesPassed: editResult.gatesPassed,
          gatesTotal: editResult.gatesTotal,
          remainingViolations: editResult.remainingViolations,
          linksPreserved: editResult.linksPreserved,
        });
      } catch (err) {
        console.error("[api/voice/generate-longform] pipeline failed:", err);
        send({
          type: "error",
          error:
            err instanceof Error
              ? err.message
              : "Long-form voice generation failed",
        });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
