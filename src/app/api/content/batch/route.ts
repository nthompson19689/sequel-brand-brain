import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { runThreeAgentWriter } from "@/lib/content/writer-pipeline";
import { runEditorPipeline } from "@/lib/content/editor-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for full pipeline

/**
 * POST /api/content/batch — Run the full pipeline: brief → write → edit in one shot.
 *
 * Write stage uses the shared 3-agent sequential writer (intro → main →
 * final thoughts). Edit stage uses the shared editor pipeline with hard
 * external-link protection + automatic recovery for any dropped citations.
 *
 * Streams progress events so the UI can show each stage.
 */
export async function POST(request: Request) {
  const {
    postId,
    keyword,
    postType,
    searchIntent,
    wordCount: rawWordCount,
  } = await request.json();
  const wordCount = rawWordCount || 1800;

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
        } catch {
          /* closed */
        }
      };

      try {
        // ═══════════════════════════════════════
        // STAGE 1: BRIEF (unchanged)
        // ═══════════════════════════════════════
        send({
          type: "stage",
          stage: "brief",
          message: "Starting research & brief generation...",
        });

        const contentType = postType || "supporting";

        const { blocks: briefBlocks } = await buildSystemBlocks({
          includeWritingStandards: true,
          includeArticleReference: true,
          additionalContext: `You are a senior SEO content strategist building a brief for a writer. Research the keyword, analyze the SERPs, and produce a brief so specific that any competent writer could execute it without guessing.

🚨 URL HONESTY RULE — READ CAREFULLY 🚨
- Every URL you put in the brief MUST be a URL that appeared verbatim in your web_search tool results in THIS conversation.
- Do NOT construct, guess, reconstruct, or "clean up" URLs. If the search result URL is https://www.example.com/blog/post-name?utm=abc, use it exactly as-is (or strip only the query string if you must).
- Do NOT use URLs from your training data or memory. If you didn't see it in the web_search results, you don't have it.
- Do NOT invent publication dates, author names, or stat numbers that weren't in the search result snippet.
- If you cannot find a credible source for a claim, DROP the claim. An unsourced stat is worse than no stat.
- Every statistic MUST have a source URL and that URL MUST come from the search results.
- Prefer primary sources (research reports, company newsrooms, government data) over aggregator blog posts.
- NEVER cite On24, Goldcast, or Bizzabo — those are direct Sequel competitors.

You MUST select 5-10 links from the INTERNAL LINK REFERENCE to include in the brief. Pick the most topically relevant ones. Spread links naturally throughout different sections — do NOT cluster them.`,
        });

        // Multi-query SERP research
        send({
          type: "status",
          stage: "brief",
          message:
            "Researching SERP landscape, long-tail variations, and data points...",
        });

        const researchStream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
          system: briefBlocks,
          tools: [
            {
              type: "web_search_20250305" as const,
              name: "web_search",
              max_uses: 3,
            },
          ],
          messages: [
            {
              role: "user",
              content: `Research "${keyword}" for a content brief. Complete ALL tasks:

1. SERP ANALYSIS: Search "${keyword}", analyze top 5-7 pages. For each: title, URL (copied verbatim from your search results — do not clean up or reconstruct), H2 headings, word count, content type, unique angles, strengths vs. weaknesses.
2. LONG-TAIL: Search 2-3 related variations to understand the full intent landscape.
3. PEOPLE ALSO ASK: Note PAA questions and related searches.
4. DATA POINTS: Find 3-5 recent credible statistics. For EACH stat, copy the source URL verbatim from a web_search result — if you didn't see the URL in a search result this turn, you don't have it, and you must drop the stat. No fabricated URLs. No URLs from memory. Prefer primary sources (research firms, government, company newsrooms). No stat without a URL. No competitor URLs (on24.com, goldcast.io, bizzabo.com).
5. COMPETITIVE GAPS: Table stakes (must include), gaps (differentiation), Sequel-specific angles (product capabilities, customer outcomes, webinars as revenue infrastructure).

Output structured findings with clear section headers. For every URL you cite, append "(verified from search this turn)" so the brief author knows you saw it live.`,
            },
          ],
        });
        const researchResponse = await researchStream.finalMessage();
        logCachePerformance(
          "/api/content/batch[research]",
          researchResponse.usage
        );

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        // Generate detailed brief
        send({
          type: "status",
          stage: "brief",
          message: "Generating detailed brief...",
        });

        const gapContext =
          "\n\nRefer to the INTERNAL LINK REFERENCE in your system context for existing content. Use for internal linking AND gap analysis.";

        const briefStream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
          system: briefBlocks,
          messages: [
            {
              role: "user",
              content: `Generate a detailed writing brief:

Keyword: ${keyword}
Post Type: ${contentType}
Search Intent: ${searchIntent || "informational"}
Target Word Count: ${wordCount}

Research:
${researchText}
${gapContext}

Use this EXACT format:

# Content Brief: ${keyword}

## Metadata
- **Target Keyword:** ${keyword}
- **Secondary Keywords:** [3-5 from SERP research]
- **URL Slug:** /${keyword.replace(/\s+/g, "-").toLowerCase()}/
- **Meta Title:** [under 60 chars, keyword front-loaded]
- **Meta Description:** [under 155 chars, action verb, keyword + hook]
- **Target Word Count:** ${wordCount}
- **Content Type:** [based on what SERPs reward]

## Search Intent Analysis
- **Primary Intent:** [informational | commercial | transactional | navigational]
- **Searcher Stage:** [awareness | consideration | decision]
- **Who is searching this:** [specific persona]
- **What they want to DO after reading:** [specific action]
- **What they already know:** [baseline knowledge]
- **What they're frustrated by:** [why existing content fails them]

## SERP Competitive Analysis
### Table Stakes (must include):
### Gaps (our differentiation):
### Sequel-Specific Angles:

## Required Data Points & Sources
| Claim/Stat | Source | URL | Year |
|---|---|---|---|
[3-5 rows minimum, every stat needs a real URL]

## Article Structure
### Title: [Exact H1]
### Introduction (100-150 words)
- Hook, Context, Promise, Transition

[For each H2 — writer follows this outline EXACTLY:]
### H2: [Section Title, no colons]
- **Section format:** [ONE of: "deep dive prose" | "numbered list" | "bullet list" | "narrative walkthrough" | "framework/matrix" | "short punch" | "comparison table + prose"]
- **Core argument:** [one sentence]
- **H3 subsections:** [list specific H3 headings if section > 300 words]
- **Must include:** [specifics, data, frameworks]
- **Sequel angle:** [connection to Sequel]
- **Word count:** [section target, all must sum to ${wordCount}]
[No two consecutive sections may share the same format. Use at least 3 different formats. At least 2 must be "deep dive prose." HARD RULE FOR LISTICLES: MAXIMUM 9 items. Never outline more than 9.]

### Conclusion (75-125 words)
- Summary approach + CTA

## FAQ Section
| Question | Answer Summary (2-3 sentences) |
|---|---|
[3-5 questions from PAA/related searches]

## Internal Linking Requirements (5-10 from reference)
| Anchor Text (2-4 words) | Target URL | Placement (which H2) |
|---|---|---|
[5-10 rows, each in different section, exact URLs from reference]

## Tone & Voice Constraints
- Senior B2B marketer audience, assume competence
- No fluff, no filler transitions
- Concrete > abstract, numbers > adjectives
- Every claim backed by data or example
- Sequel POV: webinars are infrastructure, not events`,
            },
          ],
        });
        const briefResponse = await briefStream.finalMessage();
        logCachePerformance("/api/content/batch[brief]", briefResponse.usage);

        let briefContent = "";
        for (const block of briefResponse.content) {
          if (block.type === "text") briefContent += block.text;
        }

        send({ type: "brief_complete", brief: briefContent });

        // Save brief
        if (supabase && postId) {
          const titleMatch =
            briefContent.match(/### Title:\s*(.+)/) ||
            briefContent.match(/#### H1:\s*(.+)/);
          const title = titleMatch ? titleMatch[1].trim() : keyword;
          const { error: briefUpdateErr } = await supabase
            .from("content_posts")
            .update({
              brief: briefContent,
              title,
              status: "brief_approved",
            })
            .eq("id", postId);
          if (briefUpdateErr) {
            console.error(
              "[api/content/batch] brief save failed:",
              briefUpdateErr
            );
            send({
              type: "status",
              stage: "brief",
              message: `Brief save failed: ${briefUpdateErr.message}`,
            });
          } else {
            console.log(
              `[api/content/batch] brief saved (${briefContent.length} chars) for post ${postId}`
            );
          }
        }

        // ═══════════════════════════════════════
        // STAGE 2: WRITE — three-agent sequential writer
        // (intro → main → final thoughts, fully autonomous)
        // ═══════════════════════════════════════
        send({
          type: "stage",
          stage: "write",
          message:
            "Three-agent writer: intro → main article → final thoughts",
        });

        const writerResult = await runThreeAgentWriter({
          claude,
          brief: briefContent,
          wordCount,
          send,
          stageName: "write",
        });

        const draftContent = writerResult.draft;

        send({
          type: "write_complete",
          draft: draftContent,
          sectionWordCounts: writerResult.sectionWordCounts,
          wordCount: draftContent.split(/\s+/).filter(Boolean).length,
        });

        // Save draft
        if (supabase && postId) {
          const { error: draftUpdateErr } = await supabase
            .from("content_posts")
            .update({
              draft: draftContent,
              word_count: draftContent.split(/\s+/).filter(Boolean).length,
              status: "draft_complete",
            })
            .eq("id", postId);
          if (draftUpdateErr) {
            console.error(
              "[api/content/batch] draft save failed:",
              draftUpdateErr
            );
            send({
              type: "status",
              stage: "write",
              message: `Draft save failed: ${draftUpdateErr.message}`,
            });
          } else {
            console.log(
              `[api/content/batch] draft saved (${draftContent.length} chars, ${draftContent.split(/\s+/).filter(Boolean).length} words) for post ${postId}`
            );
          }
        }

        // ═══════════════════════════════════════
        // STAGE 3: EDIT — shared editor pipeline with link recovery
        // ═══════════════════════════════════════
        send({
          type: "stage",
          stage: "edit",
          message: "Starting editorial pipeline...",
        });

        const editResult = await runEditorPipeline({
          claude,
          draft: draftContent,
          wordCount,
          send,
          stageName: "edit",
        });

        // Save edited draft
        if (supabase && postId) {
          const { error: editUpdateErr } = await supabase
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
                brokenExternalUrlsRemoved:
                  editResult.brokenExternalUrlsRemoved,
              },
              word_count: editResult.cleanDraft
                .split(/\s+/)
                .filter(Boolean).length,
              status: "edited",
            })
            .eq("id", postId);
          if (editUpdateErr) {
            console.error(
              "[api/content/batch] Supabase edit update failed:",
              editUpdateErr
            );
          }
        }

        send({
          type: "complete",
          brief: briefContent,
          draft: draftContent,
          editedDraft: editResult.cleanDraft,
          editorNotes: editResult.reviewNotes,
          gates: editResult.gates,
          gatesPassed: editResult.gatesPassed,
          gatesTotal: editResult.gatesTotal,
          remainingViolations: editResult.remainingViolations,
          linksPreserved: editResult.linksPreserved,
          externalLinksOriginal: editResult.externalLinksOriginal.length,
          externalLinksPreservedAfterEdit:
            editResult.externalLinksPreservedAfterEdit.length,
          externalLinksDropped: editResult.externalLinksDropped.length,
          externalLinksRecovered: editResult.externalLinksRecovered.length,
          forbiddenLinksStripped: editResult.forbiddenLinksStripped.length,
          brokenExternalUrlsRemoved:
            editResult.brokenExternalUrlsRemoved.length,
          wordCount: editResult.cleanDraft.split(/\s+/).filter(Boolean).length,
          status: "edited",
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Batch pipeline failed",
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
