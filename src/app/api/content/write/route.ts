import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runThreeAgentWriter } from "@/lib/content/writer-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/content/write — Generate an article using the 3-agent sequential writer.
 *
 * The old single-call writer has been replaced with a three-agent pipeline:
 *   1. INTRO AGENT         (150-300 words)      — sees the brief
 *   2. MAIN ARTICLE AGENT  (800-1,000 words)    — sees brief + intro
 *   3. FINAL THOUGHTS AGENT (250 words + FAQ)    — sees brief + intro + main
 *
 * All three agents share the same cached system context (brand docs,
 * writing standards, article link reference, WRITER_SYSTEM) and the same
 * campaign brief. There is NO human approval gate between stages — the
 * intro kicks off the main, which kicks off the final thoughts, all
 * automatically. The three outputs are stitched into one draft.
 */
export async function POST(request: Request) {
  const { postId, brief, wordCount } = await request.json();

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
        send({
          type: "status",
          step: "writing",
          message: "Three-agent writer booting: intro → main → final thoughts",
        });

        const result = await runThreeAgentWriter({
          claude,
          brief,
          wordCount: wordCount || 1500,
          send,
          stageName: "write",
        });

        // Persist the stitched draft
        if (supabase && postId) {
          await supabase
            .from("content_posts")
            .update({
              draft: result.draft,
              word_count: result.draft.split(/\s+/).filter(Boolean).length,
              status: "draft_complete",
            })
            .eq("id", postId);
        }

        send({
          type: "complete",
          draft: result.draft,
          sectionWordCounts: result.sectionWordCounts,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Writing failed",
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
