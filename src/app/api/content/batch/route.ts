import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";
import { WRITER_SYSTEM, EDITOR_IDENTITY, KILL_LIST_FOR_EDITOR } from "@/lib/content/prompts";

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
          includeArticleReference: true,
          additionalContext: `You are a senior SEO content strategist building a brief for a writer. Research the keyword, analyze the SERPs, and produce a brief so specific that any competent writer could execute it without guessing. Every statistic MUST have a source URL. If you cannot find a credible source, DO NOT include the stat.\n\nYou MUST select 5-10 links from the INTERNAL LINK REFERENCE to include in the brief. Pick the most topically relevant ones. Spread links naturally throughout different sections — do NOT cluster them.`,
        });

        // Multi-query SERP research
        send({ type: "status", stage: "brief", message: "Researching SERP landscape, long-tail variations, and data points..." });

        const researchStream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
          system: briefBlocks,
          tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 3 }],
          messages: [{ role: "user", content: `Research "${keyword}" for a content brief. Complete ALL tasks:

1. SERP ANALYSIS: Search "${keyword}", analyze top 5-7 pages. For each: title, URL, H2 headings, word count, content type, unique angles, strengths vs. weaknesses.
2. LONG-TAIL: Search 2-3 related variations to understand the full intent landscape.
3. PEOPLE ALSO ASK: Note PAA questions and related searches.
4. DATA POINTS: Find 3-5 recent credible statistics with source name, full URL, and year. Prefer primary sources. No stat without a URL.
5. COMPETITIVE GAPS: Table stakes (must include), gaps (differentiation), Sequel-specific angles (product capabilities, customer outcomes, webinars as revenue infrastructure).

Output structured findings with clear section headers.` }],
        });
        const researchResponse = await researchStream.finalMessage();
        logCachePerformance("/api/content/batch[research]", researchResponse.usage);

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        // Generate detailed brief
        send({ type: "status", stage: "brief", message: "Generating detailed brief..." });

        const gapContext = "\n\nRefer to the INTERNAL LINK REFERENCE in your system context for existing content. Use for internal linking AND gap analysis.";

        const briefStream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 32768,
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
          }],
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
          const titleMatch = briefContent.match(/### Title:\s*(.+)/) || briefContent.match(/#### H1:\s*(.+)/);
          const title = titleMatch ? titleMatch[1].trim() : keyword;
          await supabase.from("content_posts").update({ brief: briefContent, title, status: "brief_approved" }).eq("id", postId);
        }

        // ═══════════════════════════════════════
        // STAGE 2: WRITE (mirrors /api/content/write exactly)
        // ═══════════════════════════════════════
        send({ type: "stage", stage: "write", message: "Writing draft with Opus..." });

        // Same system blocks as standalone write route: brand docs + writing standards + article reference + WRITER_SYSTEM
        const { blocks: writeBlocks } = await buildSystemBlocks({
          includeWritingStandards: true,
          includeArticleReference: true,
          additionalContext: WRITER_SYSTEM + "\n\nCRITICAL: Include 5-7 internal links from the INTERNAL LINK REFERENCE. ONLY use URLs from that list. Each URL linked ONLY ONCE. 2-4 word natural anchor text woven into sentences. Choose topically relevant articles. The reader should not notice the link unless they hover.",
        });

        send({ type: "status", stage: "write", message: "Generating draft..." });

        // Same token cap as standalone write route
        const writeTokenCap = 16384;

        // Same user message construction as standalone write route
        const target = wordCount;
        const minWords = Math.round(target * 0.9);
        const maxWords = Math.round(target * 1.1);
        const faqBudget = Math.round(target * 0.15);
        const bodyBudget = target - faqBudget;
        const numH2s = target <= 1500 ? "3-4" : target <= 2000 ? "4-5" : target <= 3000 ? "5-6" : "6-8";
        const avgPerSection = Math.round(bodyBudget / (target <= 1500 ? 3.5 : target <= 2000 ? 4.5 : 5.5));

        let draftContent = "";
        const writeStream = await claude.messages.stream({
          model: resolveModel("claude-opus-4-6"),
          max_tokens: writeTokenCap,
          system: writeBlocks,
          messages: [
            {
              role: "user",
              content: `⚠️⚠️⚠️ WORD COUNT: ${target} WORDS (${minWords}-${maxWords} acceptable range) ⚠️⚠️⚠️
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
${briefContent}`,
            },
          ],
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
        // STAGE 3: EDIT (mirrors /api/content/edit exactly — 2-call pipeline)
        // ═══════════════════════════════════════
        send({ type: "stage", stage: "edit", message: "Starting 2-call editorial pipeline..." });

        // Same system blocks as standalone edit route
        const { blocks: editBaseBlocks } = await buildSystemBlocks({ includeWritingStandards: true });

        // Same token cap as standalone edit route — based on TARGET, not draft length
        const editTargetWC = wordCount;
        const editTokenCap = 16384;

        // Pre-scan with regex (same as standalone edit route)
        send({ type: "status", stage: "edit", message: "Scanning for banned patterns..." });
        const violations = scanBannedPatterns(draftContent);
        const violationSummary = violations.length > 0
          ? "PRE-DETECTED VIOLATIONS (confirmed by regex):\n" +
            violations.map((v) => `- "${v.pattern}" (${v.type}): ${v.matches.length} occurrence(s)${v.matches.length <= 3 ? ": " + v.matches.join(" | ") : ""}`).join("\n")
          : "No regex-detectable violations found.";

        // Same link analysis as standalone edit route
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const linkMap = new Map<string, string[]>();
        let lm;
        while ((lm = linkRegex.exec(draftContent)) !== null) {
          const url = lm[2].split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
          if (!linkMap.has(url)) linkMap.set(url, []);
          linkMap.get(url)!.push(lm[0]);
        }
        const duplicateLinks = Array.from(linkMap.entries()).filter(([, uses]) => uses.length > 1).map(([url, uses]) => `- ${url} used ${uses.length} times: ${uses.join(", ")}`);
        const totalLinks = linkMap.size;
        const internalLinks = Array.from(linkMap.keys()).filter(u => u.includes("sequel.io"));
        const externalLinks = Array.from(linkMap.keys()).filter(u => !u.includes("sequel.io"));
        const linkAnalysis =
          `\nLINK ANALYSIS:\n- Total unique URLs: ${totalLinks}\n- Internal links (sequel.io): ${internalLinks.length}\n- External links (citations): ${externalLinks.length}\n` +
          `- ${internalLinks.length < 5 ? "WARNING: Fewer than 5 internal links. DO NOT remove any." : "Internal link count OK."}\n` +
          `- ${externalLinks.length < 3 ? "WARNING: Fewer than 3 external citations. DO NOT remove any." : "External citation count OK."}\n` +
          `- ⚠️ EXTERNAL LINKS ARE SACRED: Every external citation URL (${externalLinks.length} total) MUST survive editing. Removing a citation destroys credibility. Count them before and after.\n` +
          (externalLinks.length > 0 ? `- External URLs to preserve:\n${externalLinks.map(u => `  ${u}`).join("\n")}\n` : "") +
          (duplicateLinks.length > 0
            ? `- DUPLICATE LINKS (each URL should appear only once):\n${duplicateLinks.join("\n")}\n  Keep the most natural occurrence. Convert duplicates to plain text (remove the markdown link syntax but keep the words).`
            : "- No duplicate links detected.");

        send({ type: "violations", count: violations.reduce((s, v) => s + v.matches.length, 0), dupeLinks: duplicateLinks.length });

        // ── Call 1: Compact FIND/REPLACE edit list (same as standalone edit route) ──
        send({ type: "status", stage: "edit", message: "Edit call 1/2 — Scanning for issues..." });

        const call1Blocks = [
          ...editBaseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\n${KILL_LIST_FOR_EDITOR}\n\nYou are performing Call 1 of 2: the FAST violation scan. Output ONLY a compact edit list. Do NOT reproduce the article. Be concise.`,
          },
        ];

        const call1Stream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 4096,
          system: call1Blocks,
          messages: [
            {
              role: "user",
              content: `Scan this article and output a COMPACT edit list. Be fast and concise.

FORMAT — output ONLY lines like this (no prose, no explanations):
FIND: exact text from article
REPLACE: replacement text
RULE: which rule it violates
---

PRE-DETECTED ISSUES (from regex scan):
${violationSummary}

${linkAnalysis}

CHECK FOR:
- Kill list phrases (replace each one)
- Em dashes (replace with commas/periods/restructure)
- First-person singular (change to we/our)
- Vague claims without specifics
- "It's not about X, it's about Y" constructions
- Non-blog internal links (only /post/ URLs allowed)
- Insufficient internal links (need 5+)
- Passive voice
- Setup sentences that announce the next sentence
- PRESERVE: humor, asides, personality, ALL external links

End with a one-line summary: "X edits found."

Article:
${draftContent}`,
            },
          ],
        });
        const call1Response = await call1Stream.finalMessage();
        logCachePerformance("/api/content/batch[edit-c1]", call1Response.usage);

        let reviewNotes = "";
        for (const block of call1Response.content) {
          if (block.type === "text") reviewNotes += block.text;
        }

        send({ type: "call1_complete", notes: reviewNotes });

        // ── Call 2: Clean final version (same as standalone edit route) ──
        send({ type: "status", stage: "edit", message: "Edit call 2/2 — Producing clean final version..." });

        // Word count enforcement (same as standalone edit route)
        const currentDraftWords = draftContent.split(/\s+/).length;
        const isOverTarget = currentDraftWords > Math.round(editTargetWC * 1.1);
        const wordCountDirective = isOverTarget
          ? `\n\n⚠️ WORD COUNT ENFORCEMENT — HIGHEST PRIORITY ⚠️\nThe draft is ${currentDraftWords} words but the target is ${editTargetWC} words (±10% = ${minWords}-${maxWords}). The draft is ${currentDraftWords - editTargetWC} words OVER. You MUST cut it down to within the ${minWords}-${maxWords} range.\n\nHow to cut:\n- Remove the weakest H2 section entirely if needed\n- Collapse redundant examples (one strong example > three weak ones)\n- Tighten data sections and cut padding\n- Shorten FAQ answers to 2-3 sentences each\n- Cut setup/warmup sentences that delay the point\n- Reduce number of FAQ questions if over 5\n- DO NOT cut internal links, external citations, or personality/voice\n- After cutting, count your words. If still over ${maxWords}, cut more.`
          : "";

        const call2Blocks = [
          ...editBaseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\nYou are performing Call 2 of 2: apply the edit list to the original draft and output the CLEAN final version. You will receive the original article and a list of FIND/REPLACE edits. Apply each edit, then output the complete article.

RULES:
1. Apply every FIND/REPLACE edit from the edit list.
2. ZERO kill list phrases remaining after edits.
3. ZERO em dashes remaining (use commas, periods, or restructure).
4. ZERO colons in headings.
5. ALL internal links preserved. Each URL appears only ONCE.
6. ALL external links preserved. NEVER remove a citation. Removing a source URL is a HIGH SEVERITY failure.
7. Minimum 5 unique internal links.
8. PRESERVE conversational tone, humor, asides, personality.
9. META description and SLUG at top. NEVER modify the SLUG.
10. FAQ section: ## FAQ heading, ### H3 per question (plain text, no numbers/bold), prose answers.
11. At least 2 sections with 400+ words of sustained prose.
12. Primary keyword in H1, first 100 words, and at least 2 H2s.
13. WORD COUNT TARGET: ${editTargetWC} words (±10% = ${minWords}-${maxWords}). The final output MUST be within this range.${wordCountDirective}

Output: the COMPLETE final article ONLY. No commentary, no edit markers, no meta text.`,
          },
        ];

        let cleanDraft = "";
        const editStream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: editTokenCap,
          system: call2Blocks,
          messages: [
            {
              role: "user",
              content: `Apply the following edits to the article below and output the complete clean final version.

## EDIT LIST
${reviewNotes}

## ORIGINAL ARTICLE
${draftContent}`,
            },
          ],
        });

        for await (const event of editStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            cleanDraft += event.delta.text;
            send({ type: "delta", stage: "edit", text: event.delta.text });
          }
        }
        const editFinal = await editStream.finalMessage();
        logCachePerformance("/api/content/batch[edit-c2]", editFinal.usage);

        // Fallback check (same as standalone edit route)
        if (cleanDraft.trim().length < 200) {
          console.error(`[batch-edit] Call 2 produced only ${cleanDraft.length} chars — likely failed. Falling back.`);
          send({ type: "error", error: "The editor failed to produce output. Please try running the editor again." });
          controller.close();
          return;
        }

        // Quality gates (same as standalone edit route)
        send({ type: "status", stage: "edit", message: "Running quality gates..." });
        const gates = runQualityGates(cleanDraft, wordCount);
        const gatesPassed = gates.filter((g) => g.passed).length;
        const remainingViolations = scanBannedPatterns(cleanDraft);
        const totalRemaining = remainingViolations.reduce((s, v) => s + v.matches.length, 0);

        // Count links in final output
        const finalLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const finalLinks = new Set<string>();
        let fm;
        while ((fm = finalLinkRegex.exec(cleanDraft)) !== null) {
          finalLinks.add(fm[2].split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase());
        }

        // Save edited draft
        if (supabase && postId) {
          await supabase.from("content_posts").update({
            edited_draft: cleanDraft,
            editor_notes: {
              call1: reviewNotes,
              violations,
              gates,
              gatesPassed,
              gatesTotal: gates.length,
              linksPreserved: finalLinks.size,
            },
            word_count: cleanDraft.split(/\s+/).length,
            status: "edited",
          }).eq("id", postId);
        }

        send({
          type: "complete",
          brief: briefContent,
          draft: draftContent,
          editedDraft: cleanDraft,
          editorNotes: reviewNotes,
          gates,
          gatesPassed,
          gatesTotal: gates.length,
          remainingViolations: totalRemaining,
          linksPreserved: finalLinks.size,
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
