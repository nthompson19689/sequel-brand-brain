import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";
import { EDITOR_IDENTITY, KILL_LIST_FOR_EDITOR } from "@/lib/content/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Editorial pipeline: 2-call system
 *
 * Call 1: Compact FIND/REPLACE edit list (identify problems)
 * Call 2: Clean final version (apply fixes, produce output)
 *
 * CRITICAL EDITOR RULES:
 * - NEVER remove internal links. Verify they exist. Flag if fewer than 5.
 * - NEVER flatten voice into corporate language.
 * - NEVER remove conversational asides, humor, parenthetical observations.
 * - NEVER make every sentence the same length.
 * - NEVER add any phrase from the kill list.
 * - DO flag kill list violations.
 * - DO flag missing internal links.
 * - DO flag paragraphs over 3 sentences.
 * - DO flag consecutive paragraphs starting with same word.
 * - DO flag vague claims that should be specific.
 * - DO preserve personality, humor, conversational tone.
 * - DO tighten data sections, loosen voice sections.
 * - DO deduplicate links (each URL appears only once).
 */

export async function POST(request: Request) {
  const { postId, draft, wordCount } = await request.json();

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  // Dynamic token cap for Call 2 (clean article output).
  // Call 1 is now a compact edit list (capped at 4096).
  // Cap is based on the TARGET word count, not the draft length — this prevents
  // the editor from reproducing a bloated draft verbatim. If the draft is 3200
  // words but the target is 1200, the editor only gets enough tokens for ~1200.
  const targetWC = wordCount || 1500;
  const call2TokenCap = 16384;

  // Block 1: brand docs (CACHED, same as all routes)
  // Block 2: writing standards + Nathan style guide (CACHED, same as brief/write)
  // Block 3: editor-specific prompt (NOT cached, changes per call)
  const { blocks: baseBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
  });

  // Pre-analyze links for duplicate detection
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkMap = new Map<string, string[]>();
  let linkMatch;
  while ((linkMatch = linkRegex.exec(draft)) !== null) {
    const url = linkMatch[2]
      .split("?")[0]
      .split("#")[0]
      .replace(/\/$/, "")
      .toLowerCase();
    if (!linkMap.has(url)) linkMap.set(url, []);
    linkMap.get(url)!.push(linkMatch[0]);
  }
  const duplicateLinks = Array.from(linkMap.entries())
    .filter(([, uses]) => uses.length > 1)
    .map(
      ([url, uses]) =>
        `- ${url} used ${uses.length} times: ${uses.join(", ")}`
    );
  const totalLinks = linkMap.size;
  // Count internal vs external links
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

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(d)}\n\n`)
        );

      try {
        // Pre-scan with regex
        send({
          type: "status",
          step: "scan",
          message: "Scanning for banned patterns...",
        });
        const violations = scanBannedPatterns(draft);
        const violationSummary =
          violations.length > 0
            ? "PRE-DETECTED VIOLATIONS (confirmed by regex):\n" +
              violations
                .map(
                  (v) =>
                    `- "${v.pattern}" (${v.type}): ${v.matches.length} occurrence(s)${v.matches.length <= 3 ? ": " + v.matches.join(" | ") : ""}`
                )
                .join("\n")
            : "No regex-detectable violations found.";

        send({
          type: "violations",
          violations,
          count: violations.reduce((s, v) => s + v.matches.length, 0),
        });

        // =====================
        // CALL 1: Compact edit list ONLY (no article reproduction)
        // Must complete in <25s to leave time for Call 2 within 60s limit
        // =====================
        send({
          type: "status",
          step: "call1",
          message: "Call 1/2 — Scanning for issues...",
        });

        const call1Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\n${KILL_LIST_FOR_EDITOR}\n\nYou are performing Call 1 of 2: the FAST violation scan. Output ONLY a compact edit list. Do NOT reproduce the article. Be concise.`,
          },
        ];

        const call1Stream = claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 4096, // Compact edit list only — no article reproduction
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
${draft}`,
            },
          ],
        });

        const call1Response = await call1Stream.finalMessage();

        // Send periodic keepalive during Call 1
        send({ type: "status", step: "call1", message: "Analyzing..." });

        let call1Text = "";
        for (const block of call1Response.content) {
          if (block.type === "text") call1Text += block.text;
        }
        logCachePerformance("/api/content/edit[call1]", call1Response.usage);
        console.log(`[edit] Call 1 complete. ${call1Text.length} chars, ${call1Text.split("FIND:").length - 1} edits found.`);

        const reviewNotes = call1Text;
        send({ type: "call1_complete", notes: reviewNotes });

        // =====================
        // CALL 2: Clean final version (streamed, uses Opus for voice preservation)
        // =====================
        send({
          type: "status",
          step: "call2",
          message: "Call 2/2 — Producing clean final version...",
        });

        // Calculate word count enforcement for editor
        const currentDraftWords = draft ? draft.split(/\s+/).length : 0;
        const targetWC = wordCount || 1500;
        const isOverTarget = currentDraftWords > Math.round(targetWC * 1.1);
        const wordCountDirective = isOverTarget
          ? `\n\n⚠️ WORD COUNT ENFORCEMENT — HIGHEST PRIORITY ⚠️\nThe draft is ${currentDraftWords} words but the target is ${targetWC} words (±10% = ${Math.round(targetWC * 0.9)}-${Math.round(targetWC * 1.1)}). The draft is ${currentDraftWords - targetWC} words OVER. You MUST cut it down to within the ${Math.round(targetWC * 0.9)}-${Math.round(targetWC * 1.1)} range.\n\nHow to cut:\n- Remove the weakest H2 section entirely if needed\n- Collapse redundant examples (one strong example > three weak ones)\n- Tighten data sections and cut padding\n- Shorten FAQ answers to 2-3 sentences each\n- Cut setup/warmup sentences that delay the point\n- Reduce number of FAQ questions if over 5\n- DO NOT cut internal links, external citations, or personality/voice\n- After cutting, count your words. If still over ${Math.round(targetWC * 1.1)}, cut more.`
          : "";

        const call3Blocks = [
          ...baseBlocks,
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
13. WORD COUNT TARGET: ${targetWC} words (±10% = ${Math.round(targetWC * 0.9)}-${Math.round(targetWC * 1.1)}). The final output MUST be within this range.${wordCountDirective}

Output: the COMPLETE final article ONLY. No commentary, no edit markers, no meta text.`,
          },
        ];

        const stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: call2TokenCap,
          system: call3Blocks,
          messages: [
            {
              role: "user",
              content: `Apply the following edits to the article below and output the complete clean final version.

## EDIT LIST
${reviewNotes}

## ORIGINAL ARTICLE
${draft}`,
            },
          ],
        });

        let cleanDraft = "";
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            cleanDraft += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const finalMsg = await stream.finalMessage();
        logCachePerformance("/api/content/edit[call2-final]", finalMsg.usage);

        console.log(`[edit] Call 2 complete. stop_reason=${finalMsg.stop_reason}, cleanDraft length=${cleanDraft.length} chars, ~${cleanDraft.split(/\s+/).length} words`);
        console.log(`[edit] Call 1 output length=${call1Text.length} chars. Had [EDIT] markers: ${call1Text.includes("[EDIT")}`);

        // If Call 2 produced essentially nothing, the editor failed silently
        if (cleanDraft.trim().length < 200) {
          console.error(`[edit] Call 2 produced only ${cleanDraft.length} chars — likely failed. Call 1 had ${call1Text.length} chars. Falling back to original draft.`);
          send({ type: "status", step: "quality", message: "Warning: editor produced insufficient output. Please try again." });
          // Don't save an empty/tiny edited_draft — it would overwrite the real draft
          send({ type: "error", error: "The editor failed to produce output. This usually means the review step was truncated. Please try running the editor again." });
          controller.close();
          return;
        }

        // Run quality gates on the final output
        send({
          type: "status",
          step: "quality",
          message: "Running quality gates...",
        });
        const gates = runQualityGates(cleanDraft, wordCount);
        const gatesPassed = gates.filter((g) => g.passed).length;
        const remainingViolations = scanBannedPatterns(cleanDraft);
        const totalRemaining = remainingViolations.reduce(
          (s, v) => s + v.matches.length,
          0
        );

        // Count links in final output
        const finalLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const finalLinks = new Set<string>();
        let fm;
        while ((fm = finalLinkRegex.exec(cleanDraft)) !== null) {
          finalLinks.add(fm[2].split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase());
        }

        if (supabase && postId) {
          await supabase
            .from("content_posts")
            .update({
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
            })
            .eq("id", postId);
        }

        send({
          type: "complete",
          editedDraft: cleanDraft,
          editorNotes: reviewNotes,
          gates,
          gatesPassed,
          gatesTotal: gates.length,
          remainingViolations: totalRemaining,
          linksPreserved: finalLinks.size,
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
