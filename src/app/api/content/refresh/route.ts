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
 * Content Refresh & Optimize Agent — split into 3 independent steps.
 * Each step gets its own 300-second window.
 *
 * step: "research" | "audit" | "revise"
 *
 * Step 1 (research): Input { url, mode, keyword? } → Output { articleText, research }
 * Step 2 (audit):    Input { articleText, research, mode, keyword? } → Output { audit }
 * Step 3 (revise):   Input { articleText, audit, postId?, mode } → Output { revisedArticle, gates }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { step } = body;

  if (!step || !["research", "audit", "revise"].includes(step)) {
    return new Response(JSON.stringify({ error: "step is required: research | audit | revise" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const claude = getClaudeClient();

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
        } catch { /* closed */ }
      };

      try {
        if (step === "research") {
          await handleResearch(body, claude, send);
        } else if (step === "audit") {
          await handleAudit(body, claude, send);
        } else if (step === "revise") {
          await handleRevise(body, claude, send);
        }
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Refresh step failed" });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

// ═══════════════════════════════════════
// STEP 1: Fetch URL + Research
// ═══════════════════════════════════════
async function handleResearch(
  body: { url: string; mode: string; keyword?: string },
  claude: ReturnType<typeof getClaudeClient>,
  send: (d: Record<string, unknown>) => void,
) {
  const { url, mode, keyword } = body;
  const auditMode = ["refresh", "optimize", "full"].includes(mode) ? mode : "full";

  if (!url) { send({ type: "error", error: "URL is required" }); return; }

  // Fetch article
  send({ type: "status", step: "fetch", message: "Fetching article content..." });

  let articleText = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Sequel-Brand-Brain/1.0" } });
    if (!res.ok) { send({ type: "error", error: `Failed to fetch URL: ${res.status} ${res.statusText}` }); return; }
    const html = await res.text();
    articleText = htmlToText(html);
    if (articleText.length < 200) {
      send({ type: "error", error: "Could not extract meaningful content from the URL." });
      return;
    }
  } catch (fetchErr) {
    send({ type: "error", error: `Failed to fetch URL: ${fetchErr instanceof Error ? fetchErr.message : "Network error"}` });
    return;
  }

  const articleWordCount = articleText.split(/\s+/).length;
  send({ type: "status", step: "fetch", message: `Fetched ${articleWordCount} words from ${url}` });

  // Research
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
    max_tokens: 64000,
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

  send({
    type: "complete",
    articleText,
    research: researchText,
    articleWordCount,
  });
}

// ═══════════════════════════════════════
// STEP 2: Audit
// ═══════════════════════════════════════
async function handleAudit(
  body: { articleText: string; research: string; mode: string; keyword?: string; url?: string },
  claude: ReturnType<typeof getClaudeClient>,
  send: (d: Record<string, unknown>) => void,
) {
  const { articleText, research, mode, keyword, url } = body;
  const auditMode = ["refresh", "optimize", "full"].includes(mode) ? mode : "full";

  if (!articleText) { send({ type: "error", error: "articleText is required" }); return; }

  send({ type: "status", step: "audit", message: `Running ${auditMode} audit...` });

  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    includeArticleReference: true,
  });

  const auditBlocks = [
    ...systemBlocks,
    { type: "text" as const, text: REFRESH_AUDIT_SYSTEM },
  ];

  const auditStream = await claude.messages.stream({
    model: resolveModel("claude-sonnet-4-6"),
    max_tokens: 64000,
    system: auditBlocks,
    messages: [
      {
        role: "user",
        content: `Run a "${auditMode}" audit on this article.

${auditMode === "refresh" ? "Focus on FRESHNESS CHECKS only." : auditMode === "optimize" ? "Focus on SEO/AEO CHECKS only." : "Run BOTH freshness and SEO/AEO checks."}

${keyword ? `Target keyword: "${keyword}"` : ""}

RESEARCH FINDINGS:
${research}

ARTICLE${url ? ` (from ${url})` : ""}:
${articleText.slice(0, 50000)}`,
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

  send({ type: "complete", audit: auditText });
}

// ═══════════════════════════════════════
// STEP 3: Revise
// ═══════════════════════════════════════
async function handleRevise(
  body: { articleText: string; audit: string; postId?: string; mode: string },
  claude: ReturnType<typeof getClaudeClient>,
  send: (d: Record<string, unknown>) => void,
) {
  const { articleText, audit, postId, mode } = body;
  const auditMode = ["refresh", "optimize", "full"].includes(mode) ? mode : "full";

  if (!articleText || !audit) { send({ type: "error", error: "articleText and audit are required" }); return; }

  send({ type: "status", step: "revise", message: "Producing revised article..." });

  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
  });

  const reviseBlocks = [
    ...systemBlocks,
    { type: "text" as const, text: REFRESH_REVISER_SYSTEM },
  ];

  const reviseStream = await claude.messages.stream({
    model: resolveModel("claude-sonnet-4-6"),
    max_tokens: 64000,
    system: reviseBlocks,
    messages: [
      {
        role: "user",
        content: `Apply the audit findings to this article. Output the complete revised article in CLEAN markdown, ready to copy-paste into WordPress. No HTML comments, no annotations, no change notes.

AUDIT FINDINGS:
${audit}

ORIGINAL ARTICLE:
${articleText.slice(0, 50000)}`,
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

  // Quality gates
  send({ type: "status", step: "quality", message: "Running quality gates..." });
  const articleWordCount = articleText.split(/\s+/).length;
  const gates = runQualityGates(revisedContent, articleWordCount);
  const gatesPassed = gates.filter((g) => g.passed).length;
  const violations = scanBannedPatterns(revisedContent);
  const totalViolations = violations.reduce((s, v) => s + v.matches.length, 0);

  const changeCount = (audit.match(/### Change \d+/g) || []).length;
  const manualResearchCount = (audit.match(/NEEDS MANUAL RESEARCH/gi) || []).length;

  // Save to DB
  const supabase = getSupabaseServerClient();
  if (supabase && postId) {
    await supabase
      .from("content_posts")
      .update({
        edited_draft: revisedContent,
        editor_notes: {
          refresh_audit: audit,
          refresh_mode: auditMode,
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
    revisedArticle: revisedContent,
    gates,
    gatesPassed,
    gatesTotal: gates.length,
    remainingViolations: totalViolations,
    changeCount,
    manualResearchCount,
    wordCount: revisedContent.split(/\s+/).length,
  });
}
