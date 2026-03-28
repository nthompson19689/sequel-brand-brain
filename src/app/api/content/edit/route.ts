import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
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
  const linkAnalysis =
    `\nLINK ANALYSIS:\n- Total unique URLs linked: ${totalLinks}\n- ${totalLinks < 5 ? "WARNING: Fewer than 5 internal links. DO NOT remove any links. Flag this as a quality issue." : "Link count OK."}\n` +
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
        // CALL 1: Violation review
        // =====================
        send({
          type: "status",
          step: "call1",
          message: "Call 1/3 — Reviewing violations...",
        });

        const call1Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\n${KILL_LIST_FOR_EDITOR}\n\nYou are performing Call 1 of 3: the violation scan. Your job is to identify every issue. You will NOT fix anything yet.`,
          },
        ];

        const call1Response = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS,
          system: call1Blocks,
          messages: [
            {
              role: "user",
              content: `Review this article for violations. Be thorough but REMEMBER: conversational asides, humor, short punchy sentences, and parenthetical observations are FEATURES of this voice, not violations.

PRE-DETECTED ISSUES (from regex scan):
${violationSummary}

${linkAnalysis}

For each violation found, report:
LOCATION: [exact text from the article]
ISSUE: [what rule it breaks]
SEVERITY: High / Medium / Low
SUGGESTED FIX: [specific replacement text — must match Nathan's voice]

ALSO CHECK:
- Consecutive paragraphs starting with the same word
- Vague claims without specifics (suggest [INSERT SPECIFIC DATA])
- Missing H3 in H2 sections over 300 words
- Sections that are data-heavy and could be tightened
- NEVER flag conversational asides, humor, or personality as violations

ESSAY DEPTH AUDIT (add this FIRST, before anything else):
1. Count sections with 400+ words of sustained prose. Need at least 2. Flag if fewer.
2. Check prose-to-list ratio. Target: 60% prose / 25% lists / 15% short sections. Flag if lists dominate.
3. Check for "H2 → intro sentence → bullet list → done" sections. Flag each one as needing prose development.
4. Check connective tissue between sections. Do transitional phrases connect each section to the next? Flag disconnected sections.
5. Check paragraph length variety. Are there paragraphs of 3-5 sentences developing arguments? If every paragraph is 1-2 sentences, flag it.
6. Check section length variety. Are sections dramatically different lengths? Flag if all sections are similar length.
7. Does the article feel like one continuous argument or 8 separate mini-articles? Flag if disconnected.

BEFORE/AFTER ANTI-PATTERN CHECK (flag each as HIGH severity):
8. REPETITIVE H2 STRUCTURE: Map each H2's skeleton (e.g. "claim → stat → takeaway"). If any two consecutive sections share the same skeleton, flag it. Each section must earn its own shape.
9. REPETITIVE SENTENCE CONSTRUCTION: Any paragraph where 4+ sentences are the same length and shape (declarative, 10-15 words each). Flag: "MONOTONE PARAGRAPH — vary sentence length."
10. SETUP SENTENCES: Sentences that announce what the next sentence will say (e.g. "This makes X perfect for Y"). Flag and suggest cutting.
11. LISTICLE PADDING: Simple yes/no questions answered with numbered steps instead of 2-3 prose sentences. Flag: "LISTICLE PADDING — answer in prose."
12. NON-BLOG INTERNAL LINKS: Any internal link that goes to homepage, product page, pricing, or any URL not matching /post/. Flag as HIGH: "WRONG LINK TARGET — only /post/ URLs allowed."
13. INSUFFICIENT INTERNAL LINKS: Fewer than 5 internal links to /post/ URLs. Flag: "LINK GAP — need 5-7 internal blog post links."
14. "IT'S NOT ABOUT X, IT'S ABOUT Y": Any instance of this reframing construction. Flag: "AI TELL — state the point directly instead of reframing."
15. FIRST-PERSON SINGULAR: Any use of "I," "I've," "I think," "my" — articles should use "we," "our team," "we've seen." Flag: "VOICE — use third-person plural (we/our), not first person singular."
16. PARALLEL DECLARATIVES WITHOUT TRANSITION: Back-to-back contrasting statements without "but," "while," or "and yet." Flag: "MISSING TRANSITION — add connective word and explain why the contrast matters."
17. HYPOTHETICAL QUESTION STACKS: Three or more rhetorical questions in a row inside a paragraph. Flag: "QUESTION STACK — pick one example or convert to bullets."
18. WORD COUNT: If the article significantly exceeds the target word count (more than 15% over), flag: "OVER TARGET — article is [N] words, target was [M]. Trim to within 10%."

STRUCTURAL REPETITION AUDIT:
For each H2 section, note its:
- Opening pattern: bold declarative / data-stat / story-scenario / question / conversational
- Closing pattern: punchy one-liner / data point / question / call-to-action / story ending / conversational
Flag if:
- 3+ consecutive sections share the same opening pattern
- 3+ consecutive sections share the same closing pattern
- More than 2 sections open with "Most companies..." / "Most teams..." / "Most [noun]..." pattern
- More than 1 section ends with a rhetorical question (max 1 per ENTIRE article)
- More than 1 section ends with "That's [noun]." pattern
- Fewer than 3 bullet or numbered list blocks in the full article (B2B readers scan — need at least 30% list content)
- Fewer than 2 sections contain conversational asides or humor (voice gap)
For each flagged case, suggest which section to restructure and what alternative format to use.

LIST QUALITY CHECK:
- Count total bullet and numbered lists in the article. Need at least 3 list blocks.
- Check that list items are substantive (1-2 sentences each), not 3-word fragments.
  BAD: "Real-time analytics"
  GOOD: "Real-time analytics that show which attendees clicked your pricing CTA during the demo section, so sales can call them before the event ends"
- Flag any list where most items are under 10 words as "FRAGMENT LIST — add detail to each bullet"

INTERNAL LINK QUALITY AUDIT:
For each internal link in the article, check:
- Is the link woven into a natural sentence? Or does it stand apart as a reference?
- Is the anchor text 2-4 natural words? Or is it a full clause/sentence?
- Does the sentence read naturally without the link? (If removing the link breaks the sentence, the link IS the sentence and that's bad.)
Flag any links that read as SEO references rather than natural text. Suggest rewrites that weave the link into the thought.

Article:
${draft}`,
            },
          ],
        });

        logCachePerformance("/api/content/edit[call1]", call1Response.usage);

        let call1Text = "";
        for (const block of call1Response.content) {
          if (block.type === "text") call1Text += block.text;
        }
        send({ type: "call1_complete", notes: call1Text });

        // =====================
        // CALL 2: Annotated version
        // =====================
        send({
          type: "status",
          step: "call2",
          message: "Call 2/3 — Producing annotated version...",
        });

        const call2Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\nYou are performing Call 2 of 3: the annotated edit. Reproduce the FULL article with inline fix markers. PRESERVE ALL LINKS — both internal (sequel.io) AND external (citations, sources, stats). NEVER remove any link. If a link's anchor text needs improvement, change only the anchor text, keep the URL.`,
          },
        ];

        const call2Response = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS * 2,
          system: call2Blocks,
          messages: [
            {
              role: "user",
              content: `Reproduce the FULL article with inline markers for every fix. Use this format:
[EDIT (Severity): 'original text' -> 'replacement text' | Rule: rule name]

CRITICAL RULES FOR THIS PASS:
1. PRESERVE ALL LINKS — both internal (sequel.io) AND external (citations, sources, stats). NEVER remove any [text](url) link. If anchor text needs improvement, change only the anchor text, keep the URL intact.
2. EXTERNAL LINKS ARE SACRED. Every external citation link must survive editing. If the writer cited a source with a URL, that URL must appear in the final output. Removing external links destroys credibility.
3. If an internal URL appears more than once, mark duplicate occurrences for removal (keep the first/most natural one). External links may appear only once each.
4. PRESERVE all conversational asides, humor, self-deprecation, parenthetical observations. These are voice features.
5. Only fix actual violations: kill list phrases, em dashes, passive voice, vague claims, "it's not about X it's about Y" constructions.
6. When fixing, maintain the Sequel team's conversational voice (we/our). Replacements should sound like practitioners, not corporate copy.
7. Tighten data sections (consolidate stats, cut "According to..." preambles). Leave voice sections loose.

After the annotated article, add:
## SECOND PASS CATCHES
[Any additional issues found during annotation]

## LINK AUDIT
- Internal links preserved: [count]
- External links preserved: [count]
- Links removed (duplicates only): [count and which ones]
- Internal link count: [total unique] ${totalLinks < 5 ? "(WARNING: below minimum of 5)" : "(OK)"}
- External link count: [total] (ZERO external links should be removed. All citation URLs must survive.)

Violation Review from Call 1:
${call1Text}

Article to annotate:
${draft}`,
            },
          ],
        });

        logCachePerformance("/api/content/edit[call2]", call2Response.usage);

        let call2Text = "";
        for (const block of call2Response.content) {
          if (block.type === "text") call2Text += block.text;
        }
        send({ type: "call2_complete" });

        // =====================
        // CALL 3: Clean final version (streamed)
        // =====================
        send({
          type: "status",
          step: "call3",
          message: "Call 3/3 — Producing clean final version...",
        });

        const call3Blocks = [
          ...baseBlocks,
          {
            type: "text" as const,
            text: `${EDITOR_IDENTITY}\n\nYou are performing Call 3 of 3: the clean final version. Apply ALL edits from the annotated version. Remove all annotation markup. Output ONLY the clean article.

FINAL PASS RULES:
1. ZERO kill list phrases remaining.
2. ZERO em dashes remaining. Use commas, periods, or restructure.
3. ZERO colons in headings.
4. ALL internal links preserved with correct URLs. Each URL appears only ONCE.
5. ALL external links (citations, sources, stats) preserved. NEVER remove an external link. If the writer cited a source, that citation must survive editing.
6. Minimum 5 unique internal links in the article. If there are fewer, DO NOT remove any.
6. Every H2 section over 300 words has at least one ### H3.
7. PRESERVE longer paragraphs (3-5 sentences) when they develop an argument. Only split paragraphs that are genuinely unfocused, not ones building a sustained point.
8. Conversational tone, humor, asides fully preserved.
9. META description and SLUG present at the top. NEVER modify the SLUG — it must match the exact primary keyword hyphenated.
10. FAQ section present with at least 5-7 questions as ### H3 headings (no numbers, no bold). Each answer 2-4 self-contained prose sentences.
11. At least 2 sections must have 400+ words of sustained prose. Do NOT shorten deep dive sections.
12. Connective tissue between sections preserved or improved.
13. Primary keyword in H1, first 100 words, and at least 2 H2 headings.

Output: the final clean article ONLY. No annotations, no comments, no meta-commentary.`,
          },
        ];

        const stream = await claude.messages.stream({
          model: resolveModel("claude-opus-4-6"), // Opus for final rewrite — better voice preservation
          max_tokens: MAX_TOKENS * 2,
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
        logCachePerformance("/api/content/edit[call3]", finalMsg.usage);

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
                call1: call1Text,
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
          editorNotes: call1Text,
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
