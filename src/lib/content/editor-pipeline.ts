/**
 * Shared editor pipeline with hard external-link protection.
 *
 * The editor runs in two streamed Claude calls (scan → apply) just like
 * before, but with two extra guarantees:
 *
 *   1. Every external citation URL in the original draft is extracted
 *      up-front and injected into BOTH calls as a "do not remove" list.
 *      Call 2 is told explicitly that dropping any of them is a failure.
 *
 *   2. After Call 2 finishes, we programmatically verify the edited draft
 *      still contains every one of those external URLs. If any were
 *      dropped, we fire a targeted RECOVERY call that reinserts the
 *      missing citations into their natural context — no human needed.
 *
 * This makes the editor "link-safe" for the campaign brief and anywhere
 * else the writer placed external sources.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { scanBannedPatterns, runQualityGates } from "@/lib/content/standards";
import {
  EDITOR_IDENTITY,
  KILL_LIST_FOR_EDITOR,
} from "@/lib/content/prompts";
import {
  FORBIDDEN_CITATION_DOMAINS,
  FORBIDDEN_DOMAINS_PROMPT_LINE,
  SOURCE_CITATION_RULES,
  stripForbiddenLinks,
} from "@/lib/content/brand-rules";

type SendFn = (data: Record<string, unknown>) => void;

export interface EditorPipelineOptions {
  claude: Anthropic;
  draft: string;
  wordCount: number;
  /** Optional SSE send callback. Events: status, delta, violations, call1_complete, section_complete, complete */
  send?: SendFn;
  /** Stage name for SSE events (defaults to "edit" to match existing UI) */
  stageName?: string;
  /** Internal domain(s) used to distinguish internal links from external citations */
  internalDomainSubstring?: string; // defaults to "sequel.io"
}

export interface EditorPipelineResult {
  cleanDraft: string;
  reviewNotes: string;
  gates: ReturnType<typeof runQualityGates>;
  gatesPassed: number;
  gatesTotal: number;
  remainingViolations: number;
  linksPreserved: number;
  externalLinksOriginal: string[];
  externalLinksPreservedAfterEdit: string[];
  externalLinksDropped: string[];
  externalLinksRecovered: string[];
  forbiddenLinksStripped: string[];
  violations: ReturnType<typeof scanBannedPatterns>;
}

/** Normalize a URL for comparison (strip query, hash, trailing slash, casing) */
function normalizeUrl(url: string): string {
  return url
    .split("?")[0]
    .split("#")[0]
    .replace(/\/$/, "")
    .trim()
    .toLowerCase();
}

/**
 * Extract every markdown link in a body of text.
 * Returns a Map<normalized_url, original_line_context[]> so we can later
 * help the recovery call reinsert dropped citations with their original
 * surrounding sentence if needed.
 */
function extractLinks(
  markdown: string
): Map<string, { raw: string; anchor: string; lineContext: string }[]> {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const out = new Map<
    string,
    { raw: string; anchor: string; lineContext: string }[]
  >();
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const normalized = normalizeUrl(m[2]);
    const anchor = m[1];
    // Pull the enclosing sentence (best-effort)
    const start = Math.max(0, markdown.lastIndexOf(". ", m.index) + 2);
    const endRaw = markdown.indexOf(". ", m.index);
    const end = endRaw === -1 ? markdown.length : endRaw + 1;
    const lineContext = markdown.slice(start, end).trim();
    if (!out.has(normalized)) out.set(normalized, []);
    out.get(normalized)!.push({ raw: m[0], anchor, lineContext });
  }
  return out;
}

function splitInternalExternal(
  linkMap: Map<string, unknown>,
  internalDomainSubstring: string
): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  Array.from(linkMap.keys()).forEach((url) => {
    if (url.includes(internalDomainSubstring)) internal.push(url);
    else external.push(url);
  });
  return { internal, external };
}

export async function runEditorPipeline(
  opts: EditorPipelineOptions
): Promise<EditorPipelineResult> {
  const {
    claude,
    draft: rawDraft,
    wordCount,
    send,
    stageName = "edit",
    internalDomainSubstring = "sequel.io",
  } = opts;

  const targetWC = wordCount || 1500;
  const minWords = Math.round(targetWC * 0.9);
  const maxWords = Math.round(targetWC * 1.1);

  // ══════════════════════════════════════════════════════════════
  // PRE-PASS: strip forbidden competitor citations BEFORE the editor
  // ever sees the draft. This guarantees they can't survive the run
  // even if the model somehow reintroduces them.
  // ══════════════════════════════════════════════════════════════
  const { cleaned: preCleanedDraft, removed: removedForbiddenLinks } =
    stripForbiddenLinks(rawDraft);
  const draft = preCleanedDraft;
  if (removedForbiddenLinks.length > 0) {
    send?.({
      type: "status",
      stage: stageName,
      step: "forbidden_removed",
      message: `Pre-stripped ${removedForbiddenLinks.length} forbidden competitor link${removedForbiddenLinks.length === 1 ? "" : "s"}: ${removedForbiddenLinks.join(", ")}`,
    });
  }

  // Build cached editor system blocks — shared across all editor calls
  const { blocks: baseBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
  });

  // ── Pre-scan: regex violations ──
  send?.({
    type: "status",
    stage: stageName,
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
              `- "${v.pattern}" (${v.type}): ${v.matches.length} occurrence(s)${
                v.matches.length <= 3 ? ": " + v.matches.join(" | ") : ""
              }`
          )
          .join("\n")
      : "No regex-detectable violations found.";

  // ── Link analysis ──
  const linkDetails = extractLinks(draft);
  const duplicateLinks = Array.from(linkDetails.entries())
    .filter(([, uses]) => uses.length > 1)
    .map(
      ([url, uses]) =>
        `- ${url} used ${uses.length} times: ${uses
          .map((u) => u.raw)
          .join(", ")}`
    );
  const { internal: internalLinks, external: externalLinks } =
    splitInternalExternal(linkDetails, internalDomainSubstring);
  const totalLinks = linkDetails.size;

  // A hard-coded list of every external URL the editor MUST keep.
  const externalUrlList = externalLinks.length
    ? externalLinks.map((u) => `  - ${u}`).join("\n")
    : "  (none)";

  const linkAnalysis =
    `\nLINK ANALYSIS:\n- Total unique URLs: ${totalLinks}\n- Internal links (${internalDomainSubstring}): ${internalLinks.length}\n- External links (citations): ${externalLinks.length}\n` +
    `- ${internalLinks.length < 5 ? "WARNING: Fewer than 5 internal links. DO NOT remove any." : "Internal link count OK."}\n` +
    `- ${externalLinks.length < 3 ? "WARNING: Fewer than 3 external citations. DO NOT remove any." : "External citation count OK."}\n` +
    `- 🚨 EXTERNAL LINKS ARE SACRED 🚨\n` +
    `  Every external citation URL MUST survive editing. Dropping any of them is a HIGH SEVERITY failure. Count them before and after.\n` +
    `  Required external URLs (${externalLinks.length}) — ALL must appear in the final output, unchanged:\n${externalUrlList}\n` +
    (duplicateLinks.length > 0
      ? `- DUPLICATE LINKS (each URL should appear only once):\n${duplicateLinks.join(
          "\n"
        )}\n  Keep the most natural occurrence. Convert duplicates to plain text (remove the markdown link syntax but keep the words).`
      : "- No duplicate links detected.");

  send?.({
    type: "violations",
    stage: stageName,
    violations,
    count: violations.reduce((s, v) => s + v.matches.length, 0),
  });

  // ══════════════════════════════════════════════════════════════
  // CALL 1 — Compact FIND/REPLACE edit list
  // ══════════════════════════════════════════════════════════════
  send?.({
    type: "status",
    stage: stageName,
    step: "call1",
    message: "Call 1/2 — Scanning for issues...",
  });

  const call1Blocks = [
    ...baseBlocks,
    {
      type: "text" as const,
      text: `${EDITOR_IDENTITY}\n\n${KILL_LIST_FOR_EDITOR}\n\nYou are performing Call 1 of 2: the FAST violation scan. Output ONLY a compact edit list. Do NOT reproduce the article. Be concise.\n\n⚠️ DO NOT propose ANY edit that removes, rewrites, or deletes an external citation URL. External citations are PROTECTED. If you see an external URL in the article, it MUST stay in the final version, exactly as-is.\n\n${FORBIDDEN_DOMAINS_PROMPT_LINE}\n\n${SOURCE_CITATION_RULES}`,
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
- PRESERVE: humor, asides, personality, ALL external links (see Required external URLs list above — DO NOT suggest removing any of them)
- 🔒 UNSOURCED STATISTICS — for every number, percentage, dollar amount, multiplier, or industry claim NOT attached to a source URL in the same sentence, propose a FIND/REPLACE that either (a) rewrites the sentence as a qualitative observation with no number, or (b) flags the sentence for removal. No unsourced stat may survive.
- 🔒 UNSOURCED "WE'VE SEEN" CLAIMS — if a sentence says "we've seen", "we've found", "our team has", or similar with a specific number but no link to a case study, propose a rewrite that either removes the number or replaces it with a qualitative observation.
- 🚫 FORBIDDEN COMPETITOR LINKS — any link to ${FORBIDDEN_CITATION_DOMAINS.join(", ")} has already been pre-stripped from the draft. Do NOT reinsert citations to these domains under any circumstance.

End with a one-line summary: "X edits found."

Article:
${draft}`,
      },
    ],
  });

  const call1Response = await call1Stream.finalMessage();
  let reviewNotes = "";
  for (const block of call1Response.content) {
    if (block.type === "text") reviewNotes += block.text;
  }
  logCachePerformance("editor-pipeline[call1]", call1Response.usage);
  send?.({ type: "call1_complete", stage: stageName, notes: reviewNotes });

  // ══════════════════════════════════════════════════════════════
  // CALL 2 — Apply edits, produce clean final version
  // ══════════════════════════════════════════════════════════════
  send?.({
    type: "status",
    stage: stageName,
    step: "call2",
    message: "Call 2/2 — Producing clean final version...",
  });

  const currentDraftWords = draft.split(/\s+/).filter(Boolean).length;
  const isOverTarget = currentDraftWords > Math.round(targetWC * 1.1);
  const wordCountDirective = isOverTarget
    ? `\n\n⚠️ WORD COUNT ENFORCEMENT — HIGHEST PRIORITY ⚠️\nThe draft is ${currentDraftWords} words but the target is ${targetWC} words (±10% = ${minWords}-${maxWords}). The draft is ${currentDraftWords - targetWC} words OVER. You MUST cut it down to within the ${minWords}-${maxWords} range.\n\nHow to cut:\n- Remove the weakest H2 section entirely if needed\n- Collapse redundant examples (one strong example > three weak ones)\n- Tighten data sections and cut padding\n- Shorten FAQ answers to 2-3 sentences each\n- Cut setup/warmup sentences that delay the point\n- Reduce number of FAQ questions if over 5\n- DO NOT cut internal links, external citations, or personality/voice\n- After cutting, count your words. If still over ${maxWords}, cut more.`
    : "";

  const call2Blocks = [
    ...baseBlocks,
    {
      type: "text" as const,
      text: `${EDITOR_IDENTITY}

You are performing Call 2 of 2: apply the edit list to the original draft and output the CLEAN final version.

🚨 HARD RULE — EXTERNAL CITATIONS ARE NON-NEGOTIABLE 🚨
Every external (non-${internalDomainSubstring}) URL in the original article MUST appear in your final output, unchanged. The original draft has ${externalLinks.length} external citation${externalLinks.length === 1 ? "" : "s"}. Your output MUST contain the same ${externalLinks.length} URL${externalLinks.length === 1 ? "" : "s"}. Removing ANY of them is an automatic failure and the edit will be rejected. If you think a citation is weak, keep it anyway — that is a human decision, not yours.

REQUIRED EXTERNAL URLS THAT MUST APPEAR VERBATIM IN YOUR OUTPUT:
${externalUrlList}

${FORBIDDEN_DOMAINS_PROMPT_LINE}

${SOURCE_CITATION_RULES}

RULES:
1. Apply every FIND/REPLACE edit from the edit list.
2. ZERO kill list phrases remaining after edits.
3. ZERO em dashes remaining (use commas, periods, or restructure).
4. ZERO colons in headings.
5. ALL internal links preserved. Each URL appears only ONCE.
6. ALL external links preserved. NEVER remove a citation. The list of required external URLs above is a contract, not a suggestion.
7. Minimum 5 unique internal links.
8. PRESERVE conversational tone, humor, asides, personality.
9. META description and SLUG at top. NEVER modify the SLUG.
10. FAQ section: ## FAQ heading, ### H3 per question (plain text, no numbers/bold), prose answers.
11. At least 2 sections with 400+ words of sustained prose.
12. Primary keyword in H1, first 100 words, and at least 2 H2s.
13. WORD COUNT TARGET: ${targetWC} words (±10% = ${minWords}-${maxWords}). The final output MUST be within this range.${wordCountDirective}
14. ZERO forbidden competitor citations. If the edit list proposes one, ignore it.
15. EVERY statistic in the output MUST carry a source URL in the same sentence. If the edit list missed an unsourced number, YOU MUST either rewrite the sentence without the number or add a source. Unsourced stats are a failure.

Output: the COMPLETE final article ONLY. No commentary, no edit markers, no meta text.`,
    },
  ];

  const stream = await claude.messages.stream({
    model: resolveModel("claude-sonnet-4-6"),
    max_tokens: 16384,
    system: call2Blocks,
    messages: [
      {
        role: "user",
        content: `Apply the following edits to the article below and output the complete clean final version. Remember: every external URL in the REQUIRED EXTERNAL URLS list must appear verbatim in your output.

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
      send?.({ type: "delta", stage: stageName, text: event.delta.text });
    }
  }
  const finalMsg = await stream.finalMessage();
  logCachePerformance("editor-pipeline[call2]", finalMsg.usage);

  // Guard against silent failure
  if (cleanDraft.trim().length < 200) {
    throw new Error(
      "The editor failed to produce output. This usually means the review step was truncated. Please try running the editor again."
    );
  }

  // ══════════════════════════════════════════════════════════════
  // EXTERNAL LINK RECOVERY PASS (automatic, no human needed)
  // ══════════════════════════════════════════════════════════════
  const postEditLinks = extractLinks(cleanDraft);
  const { external: externalAfter } = splitInternalExternal(
    postEditLinks,
    internalDomainSubstring
  );
  const externalAfterSet = new Set(externalAfter);
  const dropped = externalLinks.filter((u) => !externalAfterSet.has(u));
  let recovered: string[] = [];

  if (dropped.length > 0) {
    send?.({
      type: "status",
      stage: stageName,
      step: "recover",
      message: `Recovering ${dropped.length} dropped external citation${dropped.length === 1 ? "" : "s"}...`,
    });

    // Build a mini-brief that tells the model exactly which URLs were
    // dropped and the sentences they originally lived in.
    const droppedContextLines = dropped
      .map((url) => {
        const uses = linkDetails.get(url) || [];
        const ctx = uses[0]?.lineContext || "";
        const anchor = uses[0]?.anchor || "";
        return `- ${url}\n    original anchor: "${anchor}"\n    original sentence: "${ctx}"`;
      })
      .join("\n");

    const recoverStream = await claude.messages.stream({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: 16384,
      system: [
        ...baseBlocks,
        {
          type: "text" as const,
          text: `${EDITOR_IDENTITY}\n\nYou are performing a RECOVERY pass. The previous edit pass dropped ${dropped.length} external citation${dropped.length === 1 ? "" : "s"} that must be restored. Your ONLY job is to reinsert the missing citations into the edited article in natural positions, then output the complete article again.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: `The edited article below is missing ${dropped.length} required external citation${dropped.length === 1 ? "" : "s"}. Reinsert EVERY missing URL as a markdown link using a short 2-4 word anchor, placed in the sentence most topically related to the claim the URL supports. Do not rewrite sentences unnecessarily — the goal is surgical reinsertion.

RULES:
1. Every URL in the MISSING CITATIONS list below must appear in your output as a markdown link.
2. Keep everything else in the edited article the same. Do NOT change headings, word counts, voice, internal links, or structure.
3. Do NOT add any citations beyond the ones in the missing list.
4. Output the COMPLETE article only. No commentary.

MISSING CITATIONS (reinsert all of these):
${droppedContextLines}

EDITED ARTICLE TO REPAIR:
${cleanDraft}`,
        },
      ],
    });

    let recovered_draft = "";
    for await (const event of recoverStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        recovered_draft += event.delta.text;
        send?.({
          type: "delta",
          stage: stageName,
          step: "recover",
          text: event.delta.text,
        });
      }
    }
    const recoverFinal = await recoverStream.finalMessage();
    logCachePerformance("editor-pipeline[recover]", recoverFinal.usage);

    if (recovered_draft.trim().length >= 200) {
      // Check how many of the dropped URLs are now present
      const afterRecoverLinks = extractLinks(recovered_draft);
      const {
        external: externalAfterRecover,
      } = splitInternalExternal(afterRecoverLinks, internalDomainSubstring);
      const afterRecoverSet = new Set(externalAfterRecover);
      recovered = dropped.filter((u) => afterRecoverSet.has(u));

      // Only take the recovered draft if it actually fixed the problem
      if (recovered.length > 0) {
        cleanDraft = recovered_draft;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // POST-PASS: defense-in-depth strip of any forbidden competitor
  // link that somehow got reintroduced. This runs AFTER the recovery
  // pass so we can't accidentally recover a forbidden URL.
  // ══════════════════════════════════════════════════════════════
  const forbiddenStripped = [...removedForbiddenLinks];
  {
    const postClean = stripForbiddenLinks(cleanDraft);
    if (postClean.removed.length > 0) {
      cleanDraft = postClean.cleaned;
      forbiddenStripped.push(...postClean.removed);
      send?.({
        type: "status",
        stage: stageName,
        step: "forbidden_post_strip",
        message: `Post-stripped ${postClean.removed.length} forbidden competitor link${postClean.removed.length === 1 ? "" : "s"}`,
      });
    }
  }

  // ── Quality gates on the final output ──
  send?.({
    type: "status",
    stage: stageName,
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

  const finalLinkMap = extractLinks(cleanDraft);
  const { external: externalFinal } = splitInternalExternal(
    finalLinkMap,
    internalDomainSubstring
  );
  const stillDropped = externalLinks.filter((u) => !externalFinal.includes(u));

  return {
    cleanDraft,
    reviewNotes,
    gates,
    gatesPassed,
    gatesTotal: gates.length,
    remainingViolations: totalRemaining,
    linksPreserved: finalLinkMap.size,
    externalLinksOriginal: externalLinks,
    externalLinksPreservedAfterEdit: externalFinal,
    externalLinksDropped: stillDropped,
    externalLinksRecovered: recovered,
    forbiddenLinksStripped: forbiddenStripped,
    violations,
  };
}
