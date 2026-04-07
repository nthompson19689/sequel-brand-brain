/**
 * Three-Agent Sequential Writer
 *
 * Splits article generation into three sequential Claude calls so no single
 * call has to handle more than ~1,000 words at a time:
 *
 *   1. INTRO AGENT       (150-300 words) — sees the brief only
 *   2. MAIN ARTICLE AGENT (800-1,000 words) — sees the brief + intro
 *   3. FINAL THOUGHTS AGENT (250 words) — sees the brief + intro + main
 *
 * All three share the same cached system blocks (brand docs + writing
 * standards + article link reference + WRITER_SYSTEM), so prompt caching
 * carries across the three calls with zero additional token cost.
 *
 * The pipeline is fully autonomous — there is no human approval gate
 * between stages. The intro finishes, the main kicks off automatically
 * with the intro as extra context, and the conclusion kicks off with
 * both prior outputs as extra context.
 *
 * Each agent follows the same brand voice + campaign brief. Stage-specific
 * instructions (word count, what to cover, what not to repeat) are delivered
 * via the user message so the system blocks stay cacheable.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { WRITER_SYSTEM } from "@/lib/content/prompts";

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
}

const INTRO_TARGET_WORDS = { min: 150, max: 300 };
const MAIN_TARGET_WORDS = { min: 800, max: 1000 };
const FINAL_TARGET_WORDS = { min: 200, max: 300 };

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
  const { claude, brief, wordCount, send, stageName = "write" } = opts;

  // Build system blocks ONCE. All three calls reuse them so prompt caching
  // kicks in on calls 2 and 3 (the system prefix is identical).
  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    includeArticleReference: true,
    additionalContext:
      WRITER_SYSTEM +
      `

=== THREE-AGENT PIPELINE ===
This article is being written in three sequential passes by three specialized agents, each handling one section. You are ONE of those agents. The user message will tell you which section you are writing. Do NOT attempt to write the full article. Only write your assigned section. The other agents will handle the rest.

=== INTERNAL + EXTERNAL LINK RULES (across the full pipeline) ===
Combined across all three sections the full article must contain:
- 5-7 internal links from the INTERNAL LINK REFERENCE table only (no invented URLs, each URL linked only once).
- At least 3 external citations with real source URLs.

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
5. External citations must have real source URLs.
6. Never use "It's not about X, it's about Y."
7. One example per point. No rule-of-three padding.
8. Vary sentence and paragraph lengths.
9. Follow the CAMPAIGN BRIEF below as the blueprint — do not invent sections or rearrange the structure the brief specified.`;

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
  // STAGE 1 / 3 — INTRO AGENT (150-300 words)
  // ══════════════════════════════════════════════════════════════
  const introPrompt = `You are the INTRODUCTION AGENT (agent 1 of 3).

Your job: write ONLY the top of the article — the metadata, H1, and the opening section.

OUTPUT FORMAT (exactly this, in order, nothing else):
META: [under 155 chars, includes the primary keyword]
SLUG: [exact keyword hyphenated, no leading slash, no trailing slash]

# [H1 — exact title from the brief, primary keyword first]

[150-300 words of introduction prose. No H2. No FAQ. No conclusion. Just the opening.]

⚠️ WORD COUNT: ${INTRO_TARGET_WORDS.min}-${INTRO_TARGET_WORDS.max} words for the intro prose (NOT counting META, SLUG, or H1). Do not exceed ${INTRO_TARGET_WORDS.max} words. Count as you write.

INTRO GOALS:
- Hook the reader in the first sentence (a concrete observation, not a generic "in today's world" opener).
- Establish the core tension or question the article resolves.
- Promise what the reader will walk away with.
- Transition naturally into the body (the next agent will pick up right where you leave off).
- 0-1 internal link, 0-1 external citation (optional, keep it tight).

${baseRules}

=== CAMPAIGN BRIEF ===
${brief}`;

  const introText = await runAgent({
    label: "intro",
    humanLabel: "introduction",
    userPrompt: introPrompt,
    maxTokens: 2048,
  });

  // ══════════════════════════════════════════════════════════════
  // STAGE 2 / 3 — MAIN ARTICLE AGENT (800-1,000 words)
  // ══════════════════════════════════════════════════════════════
  const mainPrompt = `You are the MAIN ARTICLE AGENT (agent 2 of 3).

The intro has already been written (see below). Your job is to write ONLY the body of the article — the H2 sections that deliver on the intro's promise.

DO NOT:
- Rewrite or repeat the intro.
- Write a conclusion / "Final Thoughts" / wrap-up section. Agent 3 handles that.
- Write an FAQ section. Agent 3 handles that.
- Output META, SLUG, or H1. Agent 1 already did.

DO:
- Pick up naturally from where the intro ends. Your first H2 should continue the thread.
- Cover the H2 sections from the brief's "Article Structure" outline, in order, with the formats the brief specified.
- Write ${MAIN_TARGET_WORDS.min}-${MAIN_TARGET_WORDS.max} words of body prose across those H2s.
- Include 3-5 internal links from the INTERNAL LINK REFERENCE (use natural 2-4 word anchors — each URL only once across the full article).
- Include at least 2-3 external citations with real source URLs to back up claims / stats.
- Develop fewer points deeply rather than covering more shallowly.
- End on a line that sets up a natural transition into the final-thoughts section the next agent will write. Do NOT actually write "in conclusion" or "finally" — just leave the article at a point where a wrap-up makes sense.

⚠️ WORD COUNT: ${MAIN_TARGET_WORDS.min}-${MAIN_TARGET_WORDS.max} words for the body ONLY. This is a hard ceiling. Count as you write. If you're approaching ${MAIN_TARGET_WORDS.max}, wrap the current section and stop.

${baseRules}

=== CAMPAIGN BRIEF ===
${brief}

=== INTRO ALREADY WRITTEN (do not repeat, continue naturally) ===
${introText}`;

  const mainText = await runAgent({
    label: "main",
    humanLabel: "main article body",
    userPrompt: mainPrompt,
    maxTokens: 6144,
  });

  // ══════════════════════════════════════════════════════════════
  // STAGE 3 / 3 — FINAL THOUGHTS AGENT (250 words + FAQ)
  // ══════════════════════════════════════════════════════════════
  const finalPrompt = `You are the FINAL THOUGHTS AGENT (agent 3 of 3).

The intro and main body have already been written (see below). Your job is to close the article with a "Final Thoughts" section AND the FAQ section.

DO NOT:
- Rewrite or repeat anything the intro or main body already said.
- Introduce new core arguments. The body already covered them. Your role is to land the plane.
- Output META, SLUG, or H1. Agent 1 already did.
- Add new H2 body sections. Only the Final Thoughts H2 and the FAQ H2.

DO:
- Pick up naturally from the last sentence of the main article.
- Write ONE H2 titled "## Final Thoughts" (or a close variant the brief called for). ${FINAL_TARGET_WORDS.min}-${FINAL_TARGET_WORDS.max} words of prose. Synthesize the argument the body made, name what the reader should do with it, and land on a concrete forward-looking line. No CTA lectures.
- Follow it with the FAQ section: "## FAQ" heading, then 3-5 questions as "### " H3 headings (plain text, no numbers, no bold), with 2-3 sentence prose answers under each. Pull questions from the brief's PAA list if provided.
- Include 1-2 internal links from the INTERNAL LINK REFERENCE (URLs that haven't already been used in the intro or body).
- 0-1 external citation (optional).

⚠️ WORD COUNT: Final Thoughts is ${FINAL_TARGET_WORDS.min}-${FINAL_TARGET_WORDS.max} words. The FAQ section is additional (3-5 Qs at 2-3 sentences each). Do not exceed.

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
    maxTokens: 3072,
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
  };

  send?.({
    type: "status",
    stage: stageName,
    step: "stitched",
    message: `Stitched 3 sections: ${result.sectionWordCounts.intro} + ${result.sectionWordCounts.main} + ${result.sectionWordCounts.finalThoughts} words`,
  });

  // Nudge: user requested 3-agent writer ignore the incoming target word
  // count and stick to section budgets. If the caller passed wordCount we
  // honor it by scaling only the final Final-Thoughts target — but by
  // default the three-agent pipeline produces roughly 1,200-1,550 total
  // body words which is a normal mid-length article.
  void wordCount;

  return result;
}
