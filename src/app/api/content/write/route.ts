import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { WRITER_SYSTEM } from "@/lib/content/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const { postId, brief, wordCount } = await request.json();

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  // Block 1: brand docs (CACHED, same as chat/agents/brief)
  // Block 2: writing standards + Nathan style guide (CACHED, same as brief/edit)
  // Block 2b: article link reference (CACHED, same as brief route — 45K tokens saved per call)
  // Block 3: writer prompt (NOT cached, unique per call)
  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    includeArticleReference: true,
    additionalContext: WRITER_SYSTEM + "\n\nCRITICAL: Include 5-7 internal links from the INTERNAL LINK REFERENCE. ONLY use URLs from that list. Each URL linked ONLY ONCE. 2-4 word natural anchor text woven into sentences. Choose topically relevant articles. The reader should not notice the link unless they hover.",
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));

      try {
        send({ type: "status", step: "writing", message: "Writing draft with Opus..." });

        // Token budget: ~1.3 tokens per word + headroom for markdown formatting,
        // links, headings, and structural elements. Must be large enough for the
        // model to COMPLETE the article — word count enforcement comes from the
        // prompt, not from token starvation (which causes mid-sentence truncation).
        // 2.5x multiplier with 4096 floor gives comfortable headroom.
        const tokenCap = Math.max(4096, Math.round((wordCount || 1500) * 2.5));
        const stream = await claude.messages.stream({
          model: resolveModel("claude-opus-4-6"),
          max_tokens: tokenCap,
          system: systemBlocks,
          messages: [
            {
              role: "user",
              content: (() => {
                const target = wordCount || 1500;
                const min = Math.round(target * 0.9);
                const max = Math.round(target * 1.1);
                const faqBudget = Math.round(target * 0.15);
                const bodyBudget = target - faqBudget;
                const numH2s = target <= 1500 ? "3-4" : target <= 2000 ? "4-5" : target <= 3000 ? "5-6" : "6-8";
                const avgPerSection = Math.round(bodyBudget / (target <= 1500 ? 3.5 : target <= 2000 ? 4.5 : 5.5));

                return `⚠️⚠️⚠️ WORD COUNT: ${target} WORDS (${min}-${max} acceptable range) ⚠️⚠️⚠️
This is the #1 constraint. Everything else is secondary.

WORD BUDGET:
- Body sections: ~${bodyBudget} words across ${numH2s} H2 sections (~${avgPerSection} words average per section)
- FAQ section: ~${faqBudget} words (3-5 questions, 2-3 sentence answers)
- META + SLUG: not counted

PLAN BEFORE WRITING: List your ${numH2s} H2 headings and allocate a word count to each. Do NOT start writing until you have a plan that adds up to ${target}. If a section is running long, cut it short. If you're at ${Math.round(target * 0.85)} words, start wrapping up.

Write the full article based on the brief below.

RULES:
1. Write as the Sequel team (we/our), never first person (I/my).
2. Essay style, not listicle. Prose is default. Lists are seasoning.
3. Connect sections with transitions. One continuous argument.
4. 5-7 internal links from reference table ONLY. No invented URLs. No non-Sequel links.
5. At least 3 external citations with source URLs.
6. Never use "It's not about X, it's about Y."
7. One example per point. No rule-of-three padding.
8. FAQ as ### H3 headings, no numbers, no bold.
9. SLUG: exact keyword hyphenated.
10. Vary section and paragraph lengths.

=== BRIEF ===
${brief}`;
              })(),
            },
          ],
        });

        let draftContent = "";
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            draftContent += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const finalMsg = await stream.finalMessage();
        logCachePerformance("/api/content/write", finalMsg.usage);

        if (supabase && postId) {
          await supabase
            .from("content_posts")
            .update({
              draft: draftContent,
              word_count: draftContent.split(/\s+/).length,
              status: "draft_complete",
            })
            .eq("id", postId);
        }

        send({ type: "complete", draft: draftContent });
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
