import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Editorial pipeline: 3-call system
 *
 * Call 1: Violation scan + review (identify problems)
 * Call 2: Annotated version (show all fixes inline)
 * Call 3: Clean final version (apply fixes, produce output)
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

const EDITOR_IDENTITY = `You are the editorial quality gate for Sequel.io's content engine. Articles are written as the Sequel team (we/our), not an individual author.

YOUR JOB IS TO TIGHTEN, NOT FLATTEN. AND TO ENSURE ESSAY DEPTH, NOT LISTICLE STRUCTURE.

The writer deliberately uses:
- Conversational asides like "(all, ironically, in the name of efficiency)" — KEEP THESE
- Self-deprecating humor — KEEP THIS
- Short punchy sentences after long ones — THIS IS INTENTIONAL
- Cultural references and colloquialisms — THESE ARE TRUST-BUILDERS
- Parenthetical observations — THESE ARE VOICE, NOT FILLER
- Opinion stated as fact — THIS IS THE VOICE, NOT AN ERROR
- Longer paragraphs (3-5 sentences) when developing an argument — THIS IS INTENTIONAL, NOT AN ERROR

DO NOT "fix" any of those. They are features, not bugs.

=== ESSAY DEPTH CHECK (NEW — CRITICAL) ===
This is now the HIGHEST PRIORITY editorial check. The article must read like an essay, not an SEO listicle.

FLAG AS HIGH SEVERITY:
1. SHALLOW SECTIONS: Any section that is just "intro sentence → bullet list → done" with no prose development. These need more paragraphs developing the argument before and/or after the list.
2. MISSING DEEP DIVES: The article must have at least 2 sections with 400+ words of sustained prose argument. If it doesn't, flag: "DEPTH GAP: Only [N] sections have 400+ words of sustained prose. Need at least 2."
3. MISSING CONNECTIVE TISSUE: Check that sections connect to each other with transitional phrases. If sections read like independent mini-articles stapled together, flag: "DISCONNECTED: Sections [X] and [Y] have no transition. Add connective tissue."
4. PROSE-TO-LIST RATIO: The article should be roughly 60% prose / 25% lists / 15% short sections. If lists dominate, flag: "LISTICLE PATTERN: Article is list-heavy. Convert some list sections to developed prose."
5. PARAGRAPH LENGTH: There SHOULD be paragraphs longer than 3 sentences when the writer is developing an argument. If every single paragraph is 1-2 sentences, flag: "SHALLOW PARAGRAPHS: No paragraphs develop ideas across 3+ sentences. Some arguments need longer paragraphs."
6. UNIFORM SECTION LENGTH: If all sections are roughly the same length (within 100 words of each other), flag: "UNIFORM LENGTH: Sections should vary dramatically (some 100 words, some 500+)."

=== STANDARD CHECKS ===
What you SHOULD fix:
- Kill list violations (banned phrases — see list below)
- Em dashes (replace with commas, periods, or restructure)
- Consecutive paragraphs starting with the same word (restructure)
- Vague claims without specifics (flag with [INSERT SPECIFIC DATA] if needed)
- Passive voice
- Colon in headings
- Missing or weak internal links
- Duplicate link URLs (each URL appears only once in the article)
- Data sections that are padded (tighten them)
- Attribution preambles like "According to a recent study by..." (cut them, cite inline)
- STRUCTURAL REPETITION (see below)
- Internal links that read as SEO references instead of natural text (see below)

=== SEO QUALITY CHECK ===
Flag as Medium severity:
- Primary keyword missing from H1, first 100 words, or meta description
- Fewer than 2 H2s containing the primary keyword or semantic variants
- Missing FAQ section (need 5-7 questions for AEO)
- FAQ answers that aren't self-contained (2-4 sentences each)
- Missing external citations (need at least 3)
- Word count significantly below target

STRUCTURAL REPETITION CHECK:
Scan all H2 sections. For each one, categorize its opening pattern:
- "Bold declarative" / "Data/stat" / "Story/scenario" / "Question" / "Conversational"

If more than 2 consecutive sections share the same opening pattern, flag it.
If fewer than 2 sections include conversational asides or humor, flag: "VOICE GAP."

INTERNAL LINK QUALITY CHECK:
Links must be woven into natural sentences. Flag:
- Link IS the sentence
- Link introduces a topic ("Check out our guide to...")
- Link in a standalone reference ("Related: ...")
- Link wraps an entire stat
- Link goes to homepage, product page, or any URL that is NOT a /post/ blog URL (HIGH SEVERITY — only blog post URLs are allowed as internal links)
- Fewer than 5 internal links in the entire article (HIGH SEVERITY — need 5-7)
A good link is 2-4 words inside a sentence the reader would read the same way without the link.

What you MUST preserve:
- ALL internal links with their URLs — never remove a link, only improve anchor text
- Conversational tone, humor, self-deprecation, parenthetical asides
- Developed prose paragraphs (3-5 sentences) — DO NOT split these if they're building an argument
- Short punchy sentences and one-line pivot moments
- The writer's specific opinions and frameworks
- Structural variety between sections — if sections are varied, don't homogenize them
- Deep dive sections (400+ words of sustained argument) — DO NOT shorten these

The ratio: TIGHTEN the data. LOOSEN the voice. If in doubt, personality stays and stats get trimmed.`;

const KILL_LIST_FOR_EDITOR = `
KILL LIST — Flag every instance of these. They must be rewritten, never just removed:
"In today's" / "It's worth noting" / "Let's dive in" / "Let's explore" / "At the end of the day" / "The reality is" / "Here's the thing" / "Landscape" (metaphorical) / "Leverage" / "Robust" / "Comprehensive" / "Cutting-edge" / "Navigate" / "Unlock" / "Game-changer" / "Arguably" / "Moreover" / "Furthermore" / "Additionally" / "It goes without saying" / "Needless to say" / "In an era where" / "The key takeaway" / "Moving forward" / "At its core" / "Streamline" / "Harness" / "Revolutionize" / "Paradigm" / "Synergy" / "Deep dive" / "Double down" / "Low-hanging fruit" / "Move the needle" / "Ecosystem" (metaphorical) / "Holistic" / "Seamless" / "This is where X comes in" / "Think of it as" / "Simply put" / "Make no mistake" / "The bottom line" / "Whether you're a" / "in order to" (use "to") / "So what does this mean?" / "Let me explain" / "Interestingly" / "Remarkably" / em dashes (— or –)`;

export async function POST(request: Request) {
  const { postId, draft, wordCount } = await request.json();

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  // Dynamic token cap based on draft length — the editor must reproduce the
  // full article (annotated in call 1, clean in call 2), so it needs at least
  // as many tokens as the draft itself, plus headroom for annotations/formatting.
  const draftWordCount = wordCount || (draft ? draft.split(/\s+/).length : 2000);
  // Call 1 needs extra headroom for review notes + annotations on top of the full article
  const call1TokenCap = Math.max(8192, Math.round(draftWordCount * 3));
  // Call 2 needs headroom for the clean article (slightly larger than raw word count)
  const call2TokenCap = Math.max(6144, Math.round(draftWordCount * 2));

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
        // CALL 1: Combined review + annotated version (merged from previous 2-call approach)
        // =====================
        send({
          type: "status",
          step: "call1",
          message: "Call 1/2 — Reviewing and annotating...",
        });

        const call1Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\n${KILL_LIST_FOR_EDITOR}\n\nYou are performing Call 1 of 2: the combined review and annotation. You will identify every issue AND produce the annotated article in a single pass. This saves tokens while maintaining quality.`,
          },
        ];

        // Stream Call 1 to avoid Vercel timeout (non-streaming call on long
        // articles can exceed 120s). We accumulate the text and send periodic
        // status updates so the connection stays alive.
        const call1Stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: call1TokenCap,
          system: call1Blocks,
          messages: [
            {
              role: "user",
              content: `Review this article and produce an annotated version with inline fix markers. Do BOTH tasks in one pass.

PART 1: ESSAY DEPTH AUDIT (output first, before the annotated article)
1. Count sections with 400+ words of sustained prose. Need at least 2. Flag if fewer.
2. Check prose-to-list ratio. Target: 60% prose / 25% lists / 15% short. Flag if lists dominate.
3. Check for "H2 → intro → bullet list → done" sections. Flag each one.
4. Check connective tissue between sections. Flag disconnected sections.
5. Check paragraph length variety. Flag if every paragraph is 1-2 sentences.
6. Check section length variety. Flag if all sections are similar length.

STRUCTURAL REPETITION AUDIT:
- Map each H2's opening/closing pattern. Flag 3+ consecutive same patterns.
- Flag "Most companies/teams..." used 3+ times, "That's [noun]." used 2+ times.
- Flag fewer than 3 list blocks or fewer than 2 sections with conversational asides.

ANTI-PATTERN CHECK (flag as HIGH severity):
- Repetitive H2 structure, monotone paragraphs, setup sentences, listicle padding
- Non-blog internal links, insufficient internal links (<5), first-person singular
- "It's not about X, it's about Y" constructions, question stacks
- Word count significantly over target (15%+)

PRE-DETECTED ISSUES (from regex scan):
${violationSummary}

${linkAnalysis}

PART 2: ANNOTATED ARTICLE
After the audit summary, reproduce the FULL article with inline markers:
[EDIT (Severity): 'original text' -> 'replacement text' | Rule: rule name]

CRITICAL RULES:
1. PRESERVE ALL LINKS — both internal (sequel.io) AND external. NEVER remove any link.
2. EXTERNAL LINKS ARE SACRED. Every citation URL must survive editing.
3. Mark duplicate internal URLs for removal (keep the most natural one).
4. PRESERVE conversational asides, humor, self-deprecation, parenthetical observations.
5. Only fix actual violations: kill list, em dashes, passive voice, vague claims.
6. Maintain Sequel team voice (we/our). Tighten data, loosen voice.

End with:
## LINK AUDIT
- Internal links preserved: [count]
- External links preserved: [count]
- Links removed (duplicates only): [count]
- Internal link count: [total] ${totalLinks < 5 ? "(WARNING: below minimum of 5)" : "(OK)"}

Article to review and annotate:
${draft}`,
            },
          ],
        });

        let call1Text = "";
        let call1Chunks = 0;
        for await (const event of call1Stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            call1Text += event.delta.text;
            call1Chunks++;
            // Send periodic status updates to keep the SSE connection alive
            // and show progress to the user
            if (call1Chunks % 50 === 0) {
              send({ type: "status", step: "call1", message: `Reviewing and annotating... (${Math.round(call1Text.length / 100)}% processed)` });
            }
          }
        }

        const call1Final = await call1Stream.finalMessage();
        logCachePerformance("/api/content/edit[call1]", call1Final.usage);

        // Extract just the violation notes for storage (everything before the annotated article)
        const annotationStart = call1Text.indexOf("[EDIT");
        const reviewNotes = annotationStart > 0 ? call1Text.slice(0, annotationStart).trim() : call1Text.slice(0, 2000);
        send({ type: "call1_complete", notes: reviewNotes });
        // The full call1Text (review + annotated article) goes to Call 2
        const call2Text = call1Text;

        // =====================
        // CALL 2: Clean final version (streamed, uses Opus for voice preservation)
        // =====================
        send({
          type: "status",
          step: "call2",
          message: "Call 2/2 — Producing clean final version...",
        });

        const call3Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\nYou are performing Call 2 of 2: the clean final version. Apply ALL edits from the annotated version. Remove all annotation markup. Output ONLY the clean article.

FINAL PASS RULES:
1. ZERO kill list phrases remaining.
2. ZERO em dashes remaining (including --, —, –). Use commas, periods, or restructure.
3. ZERO colons in headings.
4. ALL internal links preserved with correct URLs. Each URL appears only ONCE.
5. ALL external links (citations, sources, stats) preserved. NEVER remove an external link. Every statistic that had a source URL in the draft MUST still have that source URL in the final version. Count external links before and after — the count must be equal or higher. Removing a citation is a HIGH SEVERITY failure.
6. Minimum 5 unique internal links. If there are fewer, DO NOT remove any.
7. Every H2 section over 300 words has at least one ### H3.
8. PRESERVE longer paragraphs (3-5 sentences) when they develop an argument.
9. Conversational tone, humor, asides fully preserved.
10. META description and SLUG present at the top. NEVER modify the SLUG.
11. FAQ FORMAT: The FAQ section MUST be structured as:
    - ## FAQ (or ## Frequently Asked Questions) as the H2 heading
    - Each question as a ### H3 heading (plain text question, NO numbers, NO bold, NO "Q:" prefix)
    - Answer as plain prose below each ### heading (2-3 sentences, self-contained)
    - Example format:
      ## FAQ
      ### Can you turn a webinar into a podcast?
      Yes. Extract the audio, edit for flow, and publish as an episode. One hour of production, two distribution channels.
12. At least 2 sections must have 400+ words of sustained prose. Do NOT shorten deep dive sections.
13. Connective tissue between sections preserved or improved.
14. Primary keyword in H1, first 100 words, and at least 2 H2 headings.

Output: the final clean article ONLY. No annotations, no comments, no meta-commentary.`,
          },
        ];

        const stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"), // Sonnet for cost efficiency (~$0.06 vs $0.20)
          max_tokens: call2TokenCap,
          system: call3Blocks,
          messages: [
            {
              role: "user",
              content: `Produce the final clean version. Apply all edits from the annotated version below. Remove all [EDIT] markers. Output only the finished article.\n\n${call2Text}`,
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
