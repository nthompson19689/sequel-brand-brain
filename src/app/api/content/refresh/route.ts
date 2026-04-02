import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";
import { REFRESH_AUDIT_SYSTEM, REFRESH_REVISER_SYSTEM } from "@/lib/content/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Strip HTML to plain text for content analysis.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * POST /api/content/refresh
 *
 * Content Refresh & Optimize Agent.
 * 3-step pipeline: Fetch+Research → Audit → Revise
 *
 * Input: { postId?, url, mode: "refresh"|"optimize"|"full", keyword? }
 */
export async function POST(request: Request) {
  const { postId, url, mode, keyword } = await request.json();

  if (!url) {
    return new Response(JSON.stringify({ error: "URL is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validModes = ["refresh", "optimize", "full"];
  const auditMode = validModes.includes(mode) ? mode : "full";

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
        // STEP 1: Fetch article content
        // ═══════════════════════════════════════
        send({ type: "status", step: "fetch", message: "Fetching article content..." });

        let articleText = "";
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "Sequel-Brand-Brain/1.0" },
          });
          if (!res.ok) {
            send({ type: "error", error: `Failed to fetch URL: ${res.status} ${res.statusText}` });
            controller.close();
            return;
          }
          const html = await res.text();
          articleText = htmlToText(html);

          if (articleText.length < 200) {
            send({ type: "error", error: "Could not extract meaningful content from the URL. The page may be JavaScript-rendered or behind authentication." });
            controller.close();
            return;
          }
        } catch (fetchErr) {
          send({ type: "error", error: `Failed to fetch URL: ${fetchErr instanceof Error ? fetchErr.message : "Network error"}` });
          controller.close();
          return;
        }

        const articleWordCount = articleText.split(/\s+/).length;
        send({
          type: "status",
          step: "fetch",
          message: `Fetched ${articleWordCount} words from ${url}`,
        });

        // ═══════════════════════════════════════
        // STEP 2: Research with web search
        // ═══════════════════════════════════════
        send({ type: "status", step: "research", message: "Researching updates, SERP changes, and new data..." });

        const { blocks: systemBlocks } = await buildSystemBlocks({
          includeWritingStandards: true,
          includeArticleReference: true,
          additionalContext: "You are a content research specialist preparing data for a content audit.",
        });

        const searchKeyword = keyword || articleText.slice(0, 500);
        const maxSearches = auditMode === "full" ? 5 : 3;

        const researchPrompt = `Research for a content ${auditMode} audit of this article: ${url}

${auditMode === "refresh" || auditMode === "full" ? `FRESHNESS RESEARCH:
1. Search for updated statistics related to the article's topic. Look for data newer than 2024.
2. Check if any companies or tools mentioned in the article have been acquired, shut down, or pivoted.
3. Search for major industry developments since this article was published.
4. Search site:sequel.io for newer articles that should be internally linked from this one.` : ""}

${auditMode === "optimize" || auditMode === "full" ? `SEO/AEO RESEARCH:
1. Search "${searchKeyword}" and analyze the current top 3-5 ranking pages. What do they cover that this article doesn't?
2. Note People Also Ask questions for this keyword.
3. Check what featured snippets currently appear.` : ""}

For every stat or claim you find, include the FULL source URL and publication year.

ARTICLE TEXT (first 3000 words):
${articleText.slice(0, 15000)}`;

        const researchStream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
          system: systemBlocks,
          tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: maxSearches }],
          messages: [{ role: "user", content: researchPrompt }],
        });

        const researchResponse = await researchStream.finalMessage();
        logCachePerformance("/api/content/refresh[research]", researchResponse.usage);

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        send({ type: "research_complete", research: researchText });

        // ═══════════════════════════════════════
        // STEP 3: Audit (Sonnet)
        // ═══════════════════════════════════════
        send({ type: "status", step: "audit", message: `Running ${auditMode} audit...` });

        const auditBlocks = [
          ...systemBlocks,
          { type: "text" as const, text: REFRESH_AUDIT_SYSTEM },
        ];

        const auditStream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
          system: auditBlocks,
          messages: [
            {
              role: "user",
              content: `Run a "${auditMode}" audit on this article.

${auditMode === "refresh" ? "Focus on FRESHNESS CHECKS only." : auditMode === "optimize" ? "Focus on SEO/AEO CHECKS only." : "Run BOTH freshness and SEO/AEO checks."}

${keyword ? `Target keyword: "${keyword}"` : ""}

RESEARCH FINDINGS:
${researchText}

ARTICLE (from ${url}):
${articleText.slice(0, 30000)}`,
            },
          ],
        });

        let auditText = "";
        for await (const event of auditStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            auditText += event.delta.text;
            send({ type: "delta", step: "audit", text: event.delta.text });
          }
        }

        const auditFinal = await auditStream.finalMessage();
        logCachePerformance("/api/content/refresh[audit]", auditFinal.usage);

        send({ type: "audit_complete", audit: auditText });

        // ═══════════════════════════════════════
        // STEP 4: Revise (Opus)
        // ═══════════════════════════════════════
        send({ type: "status", step: "revise", message: "Producing revised article..." });

        const reviseBlocks = [
          ...systemBlocks,
          { type: "text" as const, text: REFRESH_REVISER_SYSTEM },
        ];

        const reviseStream = await claude.messages.stream({
          model: resolveModel("claude-opus-4-6"),
          max_tokens: 32768,
          system: reviseBlocks,
          messages: [
            {
              role: "user",
              content: `Apply the audit findings to this article. Output the complete revised article in CLEAN markdown, ready to copy-paste into WordPress. No HTML comments, no annotations, no change notes.

AUDIT FINDINGS:
${auditText}

ORIGINAL ARTICLE:
${articleText.slice(0, 30000)}`,
            },
          ],
        });

        let revisedContent = "";
        for await (const event of reviseStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            revisedContent += event.delta.text;
            send({ type: "delta", step: "revise", text: event.delta.text });
          }
        }

        const reviseFinal = await reviseStream.finalMessage();
        logCachePerformance("/api/content/refresh[revise]", reviseFinal.usage);

        // Quality gates on revised output
        send({ type: "status", step: "quality", message: "Running quality gates..." });
        const gates = runQualityGates(revisedContent, articleWordCount);
        const gatesPassed = gates.filter((g) => g.passed).length;
        const violations = scanBannedPatterns(revisedContent);
        const totalViolations = violations.reduce((s, v) => s + v.matches.length, 0);

        // Count changes from the audit (not from the revised article, which is now clean)
        const changeCount = (auditText.match(/### Change \d+/g) || []).length;
        const manualResearchCount = (auditText.match(/NEEDS MANUAL RESEARCH/gi) || []).length;

        // Save to DB if postId provided
        if (supabase && postId) {
          await supabase
            .from("content_posts")
            .update({
              edited_draft: revisedContent,
              editor_notes: {
                refresh_audit: auditText,
                refresh_mode: auditMode,
                refresh_url: url,
                refresh_date: new Date().toISOString(),
                refresh_changes: changeCount,
                refresh_manual_research: manualResearchCount,
                gates,
                gatesPassed,
                gatesTotal: gates.length,
              },
              status: "edited",
            })
            .eq("id", postId);
        }

        send({
          type: "complete",
          audit: auditText,
          revisedArticle: revisedContent,
          gates,
          gatesPassed,
          gatesTotal: gates.length,
          remainingViolations: totalViolations,
          changeCount,
          manualResearchCount,
          wordCount: revisedContent.split(/\s+/).length,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Refresh pipeline failed",
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
