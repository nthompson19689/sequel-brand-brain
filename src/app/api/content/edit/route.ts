import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { runEditorPipeline } from "@/lib/content/editor-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/content/edit — Clean up a draft without dropping citations.
 *
 * The editor runs a 2-call scan → apply pipeline PLUS an automatic
 * external-link recovery pass. If any external citation URL is missing
 * from the edited output, a third call surgically reinserts it.
 *
 * External citations from the campaign brief are PROTECTED — the editor
 * is told the list of required URLs up front and blocked from proposing
 * edits that remove any of them.
 */
export async function POST(request: Request) {
  const { postId, draft, wordCount } = await request.json();

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
        const result = await runEditorPipeline({
          claude,
          draft,
          wordCount: wordCount || 1500,
          send,
          stageName: "edit",
        });

        if (supabase && postId) {
          const { error: updateErr } = await supabase
            .from("content_posts")
            .update({
              edited_draft: result.cleanDraft,
              editor_notes: {
                call1: result.reviewNotes,
                violations: result.violations,
                gates: result.gates,
                gatesPassed: result.gatesPassed,
                gatesTotal: result.gatesTotal,
                linksPreserved: result.linksPreserved,
                externalLinksOriginal: result.externalLinksOriginal,
                externalLinksPreservedAfterEdit:
                  result.externalLinksPreservedAfterEdit,
                externalLinksDropped: result.externalLinksDropped,
                externalLinksRecovered: result.externalLinksRecovered,
                forbiddenLinksStripped: result.forbiddenLinksStripped,
              },
              word_count: result.cleanDraft
                .split(/\s+/)
                .filter(Boolean).length,
              status: "edited",
            })
            .eq("id", postId);
          if (updateErr) {
            console.error(
              "[api/content/edit] Supabase update failed:",
              updateErr
            );
          }
        }

        send({
          type: "complete",
          editedDraft: result.cleanDraft,
          editorNotes: result.reviewNotes,
          gates: result.gates,
          gatesPassed: result.gatesPassed,
          gatesTotal: result.gatesTotal,
          remainingViolations: result.remainingViolations,
          linksPreserved: result.linksPreserved,
          externalLinksOriginal: result.externalLinksOriginal.length,
          externalLinksPreservedAfterEdit:
            result.externalLinksPreservedAfterEdit.length,
          externalLinksDropped: result.externalLinksDropped.length,
          externalLinksRecovered: result.externalLinksRecovered.length,
          forbiddenLinksStripped: result.forbiddenLinksStripped.length,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Editing failed",
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
