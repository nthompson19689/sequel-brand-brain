import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for full pipeline

/**
 * POST /api/content/batch — Run full pipeline: brief → write → edit in one shot.
 * Streams progress events so the UI can show each stage.
 */
export async function POST(request: Request) {
  const { postId, keyword, postType, searchIntent, wordCount: rawWordCount } = await request.json();
  const wordCount = rawWordCount || 1800;

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  // Load articles for internal links from published_articles
  let existingArticles: Array<{ title: string; slug: string; keyword: string; url: string }> = [];
  if (supabase) {
    const { data } = await supabase
      .from("published_articles")
      .select("title, slug, keyword, url")
      .order("published_at", { ascending: false })
      .limit(200);
    existingArticles = (data || []) as typeof existingArticles;
  }

  const linkRef = existingArticles.length > 0
    ? "\n\n=== INTERNAL LINK REFERENCE (SELECT 5-10 FOR THIS ARTICLE) ===\n" +
      "Use the EXACT URLs listed below.\n\n" +
      existingArticles.map((a, i) => {
        const url = a.url || `https://systemsledgrowth.ai/post/${a.slug || (a.keyword || "").replace(/\s+/g, "-").toLowerCase()}`;
        return `${i + 1}. "${a.title}" → ${url} (keyword: ${a.keyword || "n/a"})`;
      }).join("\n")
    : "";

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`)); } catch { /* closed */ }
      };

      try {
        // ═══════════════════════════════════════
        // STAGE 1: BRIEF
        // ═══════════════════════════════════════
        send({ type: "stage", stage: "brief", message: "Starting research & brief generation..." });

        const contentType = postType || "supporting";

        const { blocks: briefBlocks } = await buildSystemBlocks({
          includeWritingStandards: true,
          additionalContext: `You are a senior SEO content strategist building a brief for a writer. Research the keyword, analyze the SERPs, and produce a brief so specific that any competent writer could execute it without guessing. Every statistic MUST have a source URL. If you cannot find a credible source, DO NOT include the stat.${linkRef}`,
        });

        // Multi-query SERP research
        send({ type: "status", stage: "brief", message: "Researching SERP landscape, long-tail variations, and data points..." });

        const researchResponse = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS,
          system: briefBlocks,
          tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 10 }],
          messages: [{ role: "user", content: `Research "${keyword}" for a content brief. Complete ALL tasks:

1. SERP ANALYSIS: Search "${keyword}", analyze top 5-7 pages. For each: title, URL, H2 headings, word count, content type, unique angles, strengths vs. weaknesses.
2. LONG-TAIL: Search 2-3 related variations to understand the full intent landscape.
3. PEOPLE ALSO ASK: Note PAA questions and related searches.
4. DATA POINTS: Find 3-5 recent credible statistics with source name, full URL, and year. Prefer primary sources. No stat without a URL.
5. COMPETITIVE GAPS: Table stakes (must include), gaps (differentiation), Sequel-specific angles (product capabilities, customer outcomes, webinars as revenue infrastructure).

Output structured findings with clear section headers.` }],
        });
        logCachePerformance("/api/content/batch[research]", researchResponse.usage);

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        // Generate detailed brief
        send({ type: "status", stage: "brief", message: "Generating detailed brief..." });

        const gapContext = "\n\nRefer to the INTERNAL LINK REFERENCE in your system context for existing content. Use for internal linking AND gap analysis.";

        const briefResponse = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS * 2,
          system: briefBlocks,
          messages: [{
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

[For each H2:]
### H2: [Section Title, no colons]
- **Core argument:** [one sentence]
- **Must include:** [specifics, data, frameworks]
- **Sequel angle:** [connection to Sequel]
- **Word count:** [section target, all must sum to ${wordCount}]

### Conclusion (100-150 words)
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
          }],
        });
        logCachePerformance("/api/content/batch[brief]", briefResponse.usage);

        let briefContent = "";
        for (const block of briefResponse.content) {
          if (block.type === "text") briefContent += block.text;
        }

        send({ type: "brief_complete", brief: briefContent });

        // Save brief
        if (supabase && postId) {
          const titleMatch = briefContent.match(/### Title:\s*(.+)/) || briefContent.match(/#### H1:\s*(.+)/);
          const title = titleMatch ? titleMatch[1].trim() : keyword;
          await supabase.from("content_posts").update({ brief: briefContent, title, status: "brief_approved" }).eq("id", postId);
        }

        // ═══════════════════════════════════════
        // STAGE 2: WRITE
        // ═══════════════════════════════════════
        send({ type: "stage", stage: "write", message: "Writing draft with Opus..." });

        const writerSystem = `You are writing a blog post following a brief precisely.
Voice: Direct, conversational, honest. Mix short punchy sentences with longer explanatory ones.
Hard Rules:
- NEVER use em dashes (— or –)
- NEVER use: "leverage," "unlock," "game-changer," "disrupt," "let's dive in"
- Include ALL internal links from the brief with real URLs, each used ONLY ONCE
- Use short natural anchor text (2-4 words)
- Use ## for H2, ### for H3
- Every H2 with 300+ words needs at least one ### H3
Output: META: [description] then SLUG: [MUST be the exact primary keyword hyphenated — e.g. keyword "content marketing automation" → slug "content-marketing-automation". No creative slugs. No extra words.] then full article`;

        const { blocks: writeBlocks } = await buildSystemBlocks({
          includeWritingStandards: true,
          additionalContext: writerSystem + linkRef,
        });

        send({ type: "status", stage: "write", message: "Generating draft..." });

        // Token cap based on target word count — prevents model from blowing past target.
        // ~1.5 tokens per word with modest floor for markdown overhead.
        const writeTokenCap = Math.max(2048, Math.round(wordCount * 1.5));
        const minWords = Math.round(wordCount * 0.9);
        const maxWords = Math.round(wordCount * 1.1);

        let draftContent = "";
        const writeStream = await claude.messages.stream({
          model: resolveModel("claude-opus-4-6"),
          max_tokens: writeTokenCap,
          system: writeBlocks,
          messages: [{ role: "user", content: `⚠️ WORD COUNT TARGET: ${wordCount} words (acceptable range: ${minWords}-${maxWords}). This is a HARD constraint.\n\nWrite the full article based on this brief. Each internal link URL must appear ONLY ONCE.\n\nSLUG RULE: The SLUG must be the exact primary keyword with spaces replaced by hyphens. Keyword "${keyword}" → SLUG: "${keyword.replace(/\s+/g, '-').toLowerCase()}". No creative slugs.\n\nPLAN FIRST: Before writing, plan your H2 sections and allocate a word budget to each. The total must add up to ${wordCount}. If you approach ${maxWords} words, wrap up immediately.\n\n${briefContent}` }],
        });

        for await (const event of writeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            draftContent += event.delta.text;
            send({ type: "delta", stage: "write", text: event.delta.text });
          }
        }
        const writeFinal = await writeStream.finalMessage();
        logCachePerformance("/api/content/batch[write]", writeFinal.usage);

        send({ type: "write_complete", draft: draftContent, wordCount: draftContent.split(/\s+/).length });

        // Save draft
        if (supabase && postId) {
          await supabase.from("content_posts").update({
            draft: draftContent,
            word_count: draftContent.split(/\s+/).length,
            status: "draft_complete",
          }).eq("id", postId);
        }

        // ═══════════════════════════════════════
        // STAGE 3: EDIT (3-call pipeline)
        // ═══════════════════════════════════════
        send({ type: "stage", stage: "edit", message: "Starting 3-call editorial pipeline..." });

        const { blocks: editBlocks } = await buildSystemBlocks({ includeWritingStandards: true });

        // Pre-scan
        const violations = scanBannedPatterns(draftContent);
        const violationSummary = violations.length > 0
          ? violations.map((v) => `- "${v.pattern}" (${v.type}): ${v.matches.length}x`).join("\n")
          : "No regex violations.";

        // Link dedup scan
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const linkMap = new Map<string, string[]>();
        let lm;
        while ((lm = linkRegex.exec(draftContent)) !== null) {
          const url = lm[2].split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
          if (!linkMap.has(url)) linkMap.set(url, []);
          linkMap.get(url)!.push(lm[0]);
        }
        const dupes = Array.from(linkMap.entries()).filter(([, u]) => u.length > 1);
        const linkDedupNote = dupes.length > 0
          ? `\nDUPLICATE LINKS: ${dupes.map(([url, uses]) => `${url} (${uses.length}x)`).join(", ")}. Each URL must appear ONLY ONCE.`
          : "";

        send({ type: "violations", count: violations.reduce((s, v) => s + v.matches.length, 0), dupeLinks: dupes.length });

        // Call 1: Review
        send({ type: "status", stage: "edit", message: "Edit call 1/3 — Violation review..." });
        const call1 = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS,
          system: [...editBlocks, { type: "text" as const, text: "Strict editorial reviewer. Check for all violations." }],
          messages: [{ role: "user", content: `Review:\n${violationSummary}${linkDedupNote}\n\nFor each: LOCATION, RULE, SEVERITY, FIX.\n\nArticle:\n${draftContent}` }],
        });
        logCachePerformance("/api/content/batch[edit-c1]", call1.usage);
        const c1Text = call1.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");

        // Call 2: Annotated
        send({ type: "status", stage: "edit", message: "Edit call 2/3 — Annotated version..." });
        const call2 = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS * 2,
          system: [...editBlocks, { type: "text" as const, text: "Editor producing annotated article with inline fix markers." }],
          messages: [{ role: "user", content: `Annotate ALL fixes inline: [EDIT: 'old' -> 'new' | Rule]\n\nViolations:\n${c1Text}\n\nArticle:\n${draftContent}` }],
        });
        logCachePerformance("/api/content/batch[edit-c2]", call2.usage);
        const c2Text = call2.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");

        // Call 3: Clean (streamed) — token cap enforces word count target
        const editTokenCap = Math.max(2048, Math.round(wordCount * 1.8));
        const currentDraftWords = draftContent.split(/\s+/).length;
        const isOverTarget = currentDraftWords > maxWords;
        const wordCutDirective = isOverTarget
          ? ` The draft is ${currentDraftWords} words but target is ${wordCount} (${minWords}-${maxWords}). CUT ${currentDraftWords - wordCount} words: remove weakest sections, tighten prose, shorten FAQ. DO NOT cut links or voice.`
          : "";

        send({ type: "status", stage: "edit", message: "Edit call 3/3 — Clean final version..." });
        let cleanDraft = "";
        const editStream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: editTokenCap,
          system: [...editBlocks, { type: "text" as const, text: `Final clean article. Implement ALL edits. ZERO em dashes, colons in headings, banned patterns. Each URL linked ONLY ONCE. WORD COUNT TARGET: ${wordCount} words (${minWords}-${maxWords}).${wordCutDirective} Output: clean article only.` }],
          messages: [{ role: "user", content: `Final clean version:\n\n${c2Text}` }],
        });

        for await (const event of editStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            cleanDraft += event.delta.text;
            send({ type: "delta", stage: "edit", text: event.delta.text });
          }
        }
        const editFinal = await editStream.finalMessage();
        logCachePerformance("/api/content/batch[edit-c3]", editFinal.usage);

        // Quality gates
        const gates = runQualityGates(cleanDraft, wordCount);
        const gatesPassed = gates.filter((g) => g.passed).length;
        const remainingViolations = scanBannedPatterns(cleanDraft);

        // Save edited draft
        if (supabase && postId) {
          await supabase.from("content_posts").update({
            edited_draft: cleanDraft,
            editor_notes: { call1: c1Text, violations, gates, gatesPassed, gatesTotal: gates.length },
            word_count: cleanDraft.split(/\s+/).length,
            status: "edited",
          }).eq("id", postId);
        }

        send({
          type: "complete",
          brief: briefContent,
          draft: draftContent,
          editedDraft: cleanDraft,
          editorNotes: c1Text,
          gates,
          gatesPassed,
          gatesTotal: gates.length,
          remainingViolations: remainingViolations.reduce((s, v) => s + v.matches.length, 0),
          wordCount: cleanDraft.split(/\s+/).length,
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Batch pipeline failed" });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
