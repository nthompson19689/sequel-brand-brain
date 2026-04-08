/**
 * Three-Agent Sequential Writer
 *
 * Splits article generation into three sequential Claude calls so no single
 * call has to handle its whole section at once. Section budgets scale
 * proportionally to the user's overall target word count:
 *
 *   1. INTRO AGENT         — ~15% of target (min 150 / max 300 words)
 *   2. MAIN ARTICLE AGENT  — the remainder (target − intro − final)
 *   3. FINAL THOUGHTS AGENT — ~15% of target (min 200 / max 350 words) + FAQ
 *
 * For a 1,300-word target that's roughly 195 / 910 / 195.
 * For an 1,800-word target: 270 / 1,260 / 270.
 *
 * All three share the same cached system blocks (brand docs + writing
 * standards + article link reference + WRITER_SYSTEM) so prompt caching
 * carries across the three calls with zero additional token cost.
 *
 * The pipeline is fully autonomous — there is no human approval gate
 * between stages. The intro finishes, the main kicks off automatically
 * with the intro as extra context, and the conclusion kicks off with
 * both prior outputs as extra context.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { WRITER_SYSTEM } from "@/lib/content/prompts";
import {
  FORBIDDEN_CITATION_DOMAINS,
  FORBIDDEN_DOMAINS_PROMPT_LINE,
  SOURCE_CITATION_RULES,
  POSITIVE_FRAMING_RULE,
  SENTENCE_VARIATION_RULE,
} from "@/lib/content/brand-rules";

type SendFn = (data: Record<string, unknown>) => void;

export interface ThreeAgentWriterOptions {
  claude: Anthropic;
  brief: string;
  wordCount: number;
  /** Optional SSE send callback — if provided, deltas + stage events stream out */
  send?: SendFn;
  /** Stage name for SSE events (defaults to "write" to match existing UI) */
  stageName?: string;
}

export interface ThreeAgentWriterResult {
  draft: string;
  intro: string;
  main: string;
  finalThoughts: string;
  sectionWordCounts: { intro: number; main: number; finalThoughts: number };
  sectionTargets: { intro: number; main: number; finalThoughts: number };
}

/**
 * Allocate per-section word budgets based on the user's overall target.
 *
 * The allocation is proportional — a 1300 target produces 195/910/195,
 * an 1800 target produces 270/1260/270, etc. Intro + final each get
 * roughly 15% with hard min/max clamps so the intro never disappears
 * and the final never runs past a closing-paragraph length.
 */
export function allocateSectionBudgets(target: number) {
  const introTarget = Math.max(150, Math.min(300, Math.round(target * 0.15)));
  const finalTarget = Math.max(200, Math.min(350, Math.round(target * 0.15)));
  const mainTarget = Math.max(400, target - introTarget - finalTarget);
  return { introTarget, mainTarget, finalTarget };
}

function wordRange(target: number, tolerance = 0.05) {
  return {
    min: Math.round(target * (1 - tolerance)),
    max: Math.round(target * (1 + tolerance)),
  };
}

/**
 * Convert a word budget into a max_tokens value that physically prevents
 * the model from overshooting.
 *
 * English prose averages ~1.33 tokens per word, so a 1.5x ratio gives
 * a small safety margin without letting the model write 2x the target.
 * A fixed 150-token buffer absorbs the meta/slug/H1 overhead on the
 * intro agent.
 */
function wordBudgetToMaxTokens(wordBudget: number, bufferTokens = 150) {
  return Math.round(wordBudget * 1.5) + bufferTokens;
}

/**
 * Run the three-agent sequential writer.
 *
 * This helper is shared by /api/content/write and /api/content/batch.
 * Both routes pass in their own `send` callback to forward SSE events
 * back to their own response stream.
 */
export async function runThreeAgentWriter(
  opts: ThreeAgentWriterOptions
): Promise<ThreeAgentWriterResult> {
  const {
    claude,
    brief,
    wordCount: rawWordCount,
    send,
    stageName = "write",
  } = opts;
  const targetWordCount = rawWordCount || 1500;
  const budgets = allocateSectionBudgets(targetWordCount);
  const introRange = wordRange(budgets.introTarget);
  const mainRange = wordRange(budgets.mainTarget);
  const finalRange = wordRange(budgets.finalTarget);

  send?.({
    type: "status",
    stage: stageName,
    step: "budget",
    message: `Target ${targetWordCount} words → intro ${budgets.introTarget} / main ${budgets.mainTarget} / final ${budgets.finalTarget}`,
  });

  // Build system blocks ONCE. All three calls reuse them so prompt caching
  // kicks in on calls 2 and 3 (the system prefix is identical).
  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    includeArticleReference: true,
    additionalContext:
      WRITER_SYSTEM +
      `

=== THREE-AGENT PIPELINE ===
This article is being written in three sequential passes by three specialized agents, each handling one section. You are ONE of those agents. The user message will tell you which section you are writing and its exact word budget. Do NOT attempt to write the full article. Only write your assigned section. The other agents will handle the rest.

=== HARD RULES THAT APPLY TO EVERY SECTION ===
${POSITIVE_FRAMING_RULE}

${SENTENCE_VARIATION_RULE}

${SOURCE_CITATION_RULES}

${FORBIDDEN_DOMAINS_PROMPT_LINE}

=== INTERNAL + EXTERNAL LINK RULES (across the full pipeline) ===
Combined across all three sections the full article must contain:
- 5-7 internal links from the INTERNAL LINK REFERENCE table only (no invented URLs, each URL linked only once).
- At least 3 external citations with real source URLs — NEVER from the forbidden competitor list above.

Per-section link budgets:
- Intro: 0-1 internal link, 0-1 external citation (optional — keep it punchy).
- Main article: 3-5 internal links, 2-3 external citations.
- Final thoughts: 1-2 internal links, 0-1 external citation.

Anchor text is 2-4 natural words woven into a sentence. The reader should not notice a link unless they hover.`,
  });

  const model = resolveModel("claude-opus-4-6");
  const baseRules = `RULES (same for every section):
1. Write as the Sequel team (we/our), never first person (I/my).
2. Essay style, not listicle. Prose is default. Lists are seasoning.
3. Connect to the surrounding sections with transitions — no abrupt starts or stops.
4. Internal links only from the INTERNAL LINK REFERENCE. Each URL linked ONLY ONCE across the entire article.
5. EVERY statistic, percentage, dollar amount, multiple ("3x", "47%"), benchmark, or industry claim MUST have a source URL attached in the same sentence. No unsourced numbers. Ever.
6. "We've seen" / "we've found" / "our team has" claims need a case-study link or the claim must be rephrased as an observation without a number. Do NOT invent customer outcomes you cannot link to.
7. NEVER link to or cite any of the forbidden competitor domains: ${FORBIDDEN_CITATION_DOMAINS.join(", ")}. These are direct competitors — ignore them entirely as sources.
8. Never use "It's not about X, it's about Y."
9. One example per point. No rule-of-three padding.
10. Vary sentence and paragraph lengths.
11. Follow the CAMPAIGN BRIEF below as the blueprint — do not invent sections or rearrange the structure the brief specified. Hit the assigned word budget exactly.`;

  // Helper to run one agent and stream its deltas
  async function runAgent(params: {
    label: "intro" | "main" | "final_thoughts";
    humanLabel: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<string> {
    send?.({
      type: "status",
      stage: stageName,
      step: params.label,
      message: `Writing ${params.humanLabel}...`,
    });

    let text = "";
    const stream = await claude.messages.stream({
      model,
      max_tokens: params.maxTokens,
      system: systemBlocks,
      messages: [{ role: "user", content: params.userPrompt }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        text += event.delta.text;
        send?.({
          type: "delta",
          stage: stageName,
          step: params.label,
          text: event.delta.text,
        });
      }
    }

    const finalMsg = await stream.finalMessage();
    logCachePerformance(
      `three-agent-writer[${params.label}]`,
      finalMsg.usage
    );

    send?.({
      type: "section_complete",
      stage: stageName,
      step: params.label,
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });

    return text;
  }

  // ══════════════════════════════════════════════════════════════
  // STAGE 1 / 3 — INTRO AGENT
  // ══════════════════════════════════════════════════════════════
  const introPrompt = `You are the INTRODUCTION AGENT (agent 1 of 3).

⚠️⚠️⚠️ HARD WORD LIMIT: ${budgets.introTarget} WORDS ⚠️⚠️⚠️
Acceptable range: ${introRange.min}-${introRange.max}. Going over ${introRange.max} is a failure — the output will be cut. COUNT AS YOU WRITE. If you reach ${budgets.introTarget} words, STOP mid-thought if you have to.

OVERALL ARTICLE TARGET: ${targetWordCount} words (this article is being split across 3 agents — you handle ONLY the opening).

OUTPUT FORMAT (exactly this, in order, nothing else):
META: [under 155 chars, includes the primary keyword]
SLUG: [exact keyword hyphenated, no leading slash, no trailing slash]

# [H1 — exact title from the brief, primary keyword first]

[Introduction prose. ${introRange.min}-${introRange.max} words. No H2. No FAQ. No conclusion.]

INTRO GOALS:
- Hook the reader in the first sentence (a concrete observation, not a generic "in today's world" opener).
- Establish the core tension or question the article resolves.
- Promise what the reader will walk away with.
- Transition naturally into the body (the next agent will pick up right where you leave off).
- 0-1 internal link, 0-1 external citation (optional, keep it tight).
- Any statistic in the intro MUST carry a source URL. If you don't have one, don't use the stat.

${baseRules}

=== CAMPAIGN BRIEF ===
${brief}`;

  const introText = await runAgent({
    label: "intro",
    humanLabel: "introduction",
    userPrompt: introPrompt,
    // Tight cap: physically prevents the intro from writing more than
    // ~1.5x its word budget. The 250-token buffer covers META/SLUG/H1.
    maxTokens: wordBudgetToMaxTokens(budgets.introTarget, 250),
  });

  // ══════════════════════════════════════════════════════════════
  // STAGE 2 / 3 — MAIN ARTICLE AGENT
  // ══════════════════════════════════════════════════════════════
  const mainPrompt = `You are the MAIN ARTICLE AGENT (agent 2 of 3).

⚠️⚠️⚠️ HARD WORD LIMIT: ${budgets.mainTarget} WORDS ⚠️⚠️⚠️
Acceptable range: ${mainRange.min}-${mainRange.max}. Going over ${mainRange.max} is a failure. The token cap WILL cut you off if you try. COUNT AS YOU WRITE. When you hit ${budgets.mainTarget} words, wrap the current sentence and stop immediately, even if you planned more sections.

BEFORE YOU START WRITING, DO THIS:
1. Count the H2 sections the brief specifies for the body.
2. Divide ${budgets.mainTarget} by that number — that's your per-H2 budget.
3. Allocate words per H2 and stick to the allocation. If a section runs long, cut the next one shorter.

OVERALL ARTICLE TARGET: ${targetWordCount} words. The intro has already been written (see below). Your job is to write ONLY the body of the article — the H2 sections that deliver on the intro's promise. The final-thoughts agent handles the wrap-up.

DO NOT:
- Rewrite or repeat the intro.
- Write a conclusion / "Final Thoughts" / wrap-up section. Agent 3 handles that.
- Write an FAQ section. Agent 3 handles that.
- Output META, SLUG, or H1. Agent 1 already did.

DO:
- Pick up naturally from where the intro ends. Your first H2 should continue the thread.
- Cover the H2 sections from the brief's "Article Structure" outline, in order, with the formats the brief specified.
- Include 3-5 internal links from the INTERNAL LINK REFERENCE (use natural 2-4 word anchors — each URL only once across the full article).
- Include AT LEAST 2-3 external citations. EVERY number, percentage, dollar amount, benchmark, and industry claim must have a source URL in the same sentence. Unsourced stats are a failure.
- Sequel case-study / "we've seen" claims must link to an internal case study in the INTERNAL LINK REFERENCE or be rephrased without a number.
- Develop fewer points deeply rather than covering more shallowly.
- End on a line that sets up a natural transition into the final-thoughts section the next agent will write. Do NOT actually write "in conclusion" or "finally" — just leave the article at a point where a wrap-up makes sense.

${baseRules}

=== CAMPAIGN BRIEF ===
${brief}

=== INTRO ALREADY WRITTEN (do not repeat, continue naturally) ===
${introText}`;

  // Tight token cap — physically prevents overshoot.
  const mainText = await runAgent({
    label: "main",
    humanLabel: "main article body",
    userPrompt: mainPrompt,
    maxTokens: wordBudgetToMaxTokens(budgets.mainTarget, 200),
  });

  // ══════════════════════════════════════════════════════════════
  // STAGE 3 / 3 — FINAL THOUGHTS AGENT
  // ══════════════════════════════════════════════════════════════
  const finalPrompt = `You are the FINAL THOUGHTS AGENT (agent 3 of 3).

⚠️⚠️⚠️ HARD WORD LIMITS ⚠️⚠️⚠️
- Final Thoughts prose: ${budgets.finalTarget} words (${finalRange.min}-${finalRange.max} acceptable). Do NOT exceed ${finalRange.max}.
- FAQ section: 3-5 questions, 2-3 sentences per answer, max 250 total FAQ words.

COUNT AS YOU WRITE. Going over is a failure. The token cap WILL cut you off.

OVERALL ARTICLE TARGET: ${targetWordCount} words. The intro and main body are already written (see below). Your job is to close the article with a "Final Thoughts" section AND the FAQ.

DO NOT:
- Rewrite or repeat anything the intro or main body already said.
- Introduce new core arguments. The body already covered them. Your role is to land the plane.
- Output META, SLUG, or H1. Agent 1 already did.
- Add new H2 body sections. Only the Final Thoughts H2 and the FAQ H2.

DO:
- Pick up naturally from the last sentence of the main article.
- Write ONE H2 titled "## Final Thoughts" (or a close variant the brief called for). ${finalRange.min}-${finalRange.max} words of prose. Synthesize the argument, name what the reader should do with it, land on a concrete forward-looking line. No CTA lectures.
- Follow it with the FAQ section: "## FAQ" heading, then 3-5 questions as "### " H3 headings (plain text, no numbers, no bold), with 2-3 sentence prose answers under each. Pull questions from the brief's PAA list if provided.
- Include 1-2 internal links from the INTERNAL LINK REFERENCE (URLs that haven't already been used in the intro or body).
- 0-1 external citation (optional). Any statistic still needs a source.

${baseRules}

=== CAMPAIGN BRIEF ===
${brief}

=== INTRO ALREADY WRITTEN (do not repeat) ===
${introText}

=== MAIN BODY ALREADY WRITTEN (do not repeat, continue naturally) ===
${mainText}`;

  const finalText = await runAgent({
    label: "final_thoughts",
    humanLabel: "final thoughts + FAQ",
    userPrompt: finalPrompt,
    // Final thoughts + FAQ: budget for the prose + ~300 words of FAQ + buffer.
    maxTokens: wordBudgetToMaxTokens(budgets.finalTarget + 300, 250),
  });

  // ══════════════════════════════════════════════════════════════
  // STITCH THE THREE OUTPUTS INTO ONE COHESIVE DRAFT
  // ══════════════════════════════════════════════════════════════
  const draft = [introText.trim(), mainText.trim(), finalText.trim()]
    .filter(Boolean)
    .join("\n\n");

  const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

  const result: ThreeAgentWriterResult = {
    draft,
    intro: introText,
    main: mainText,
    finalThoughts: finalText,
    sectionWordCounts: {
      intro: countWords(introText),
      main: countWords(mainText),
      finalThoughts: countWords(finalText),
    },
    sectionTargets: {
      intro: budgets.introTarget,
      main: budgets.mainTarget,
      finalThoughts: budgets.finalTarget,
    },
  };

  send?.({
    type: "status",
    stage: stageName,
    step: "stitched",
    message: `Stitched 3 sections: ${result.sectionWordCounts.intro} + ${result.sectionWordCounts.main} + ${result.sectionWordCounts.finalThoughts} words (target ${targetWordCount})`,
  });

  return result;
}
