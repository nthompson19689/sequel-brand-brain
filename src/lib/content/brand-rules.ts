/**
 * Shared brand-safety rules that every agent in the content pipeline
 * enforces — writer, editor, refresher, agents, everything. Keep this
 * short and explicit. Changes here ripple through the whole system.
 */

/**
 * Direct competitors. NEVER cite, link to, or reference these domains
 * in any article. The writer ignores them as sources. The editor strips
 * any links that slip through.
 *
 * All entries are normalized (lowercase, no scheme, no trailing slash).
 */
export const FORBIDDEN_CITATION_DOMAINS: readonly string[] = [
  "on24.com",
  "goldcast.io",
  "bizzabo.com",
  "www.on24.com",
  "www.goldcast.io",
  "www.bizzabo.com",
];

/** Substrings used for defense-in-depth matching (subdomains, paths). */
export const FORBIDDEN_CITATION_SUBSTRINGS: readonly string[] = [
  "on24.",
  "goldcast.",
  "bizzabo.",
];

/** Ready-to-paste prompt line for the forbidden-domain rule. */
export const FORBIDDEN_DOMAINS_PROMPT_LINE = `🚫 FORBIDDEN COMPETITOR CITATIONS — NEVER USE: ${FORBIDDEN_CITATION_DOMAINS.join(
  ", "
)}. These are direct Sequel competitors. Do NOT cite them, link to them, reference their blog posts, or use them as sources. If a stat you'd use comes from one of these domains, find a different source or drop the stat entirely.`;

/**
 * The positive-framing voice rule. Pasted verbatim into writer prompts AND
 * editor prompts. This is the #1 AI tell we're hunting and the single rule
 * that most often gets violated under pressure.
 */
export const POSITIVE_FRAMING_RULE = `🚫 STATE WHAT IT IS — NEVER WHAT IT ISN'T 🚫

This is the single most important sentence-level rule. Read it twice.

Do NOT define things by negation. Do NOT write sentences that set up a positive by rejecting a negative. If you want to say something is X, just say it's X. Don't say "it's not Y, it's X."

BANNED CONSTRUCTIONS (all variants — the editor will strip every one):
- "It's not about X, it's about Y."
- "It's not X, it's Y."
- "It's not just X, it's Y."
- "X isn't about Y. It's about Z."
- "The real problem isn't X. It's Y."
- "The question isn't X. It's Y."
- "X isn't the answer — Y is."
- "We don't need X. We need Y."
- "You don't want X. You want Y."
- "Don't focus on X. Focus on Y."
- "Forget X. Think Y."
- "Instead of X, Y."
- "Less about X, more about Y."
- "X doesn't mean Y. It means Z."
- "Not X. Y." (as a pivot sentence)

HOW TO REWRITE: Cut the negation entirely. State the positive directly.
❌ "It's not about the platform. It's about the workflow."
✅ "The workflow is what matters."

❌ "We don't need more data. We need better questions."
✅ "Better questions produce better data."

❌ "The real issue isn't cost. It's visibility."
✅ "Visibility is the real issue."

If you catch yourself typing the word "not" or "isn't" or "don't" as setup for a contrast, stop and rewrite the sentence as a direct statement.`;

/**
 * Sentence-structure variation rule. Ensures the writer doesn't fall into
 * the cadence of "short punchy sentence. Another short punchy sentence.
 * One more short punchy sentence." — which is another AI tell.
 */
export const SENTENCE_VARIATION_RULE = `🎵 SENTENCE RHYTHM — VARY OPENERS AND LENGTHS 🎵

- Never start three consecutive sentences with the same word.
- Never start three consecutive paragraphs with the same word.
- Mix sentence lengths dramatically. A 35-word sentence followed by a 6-word sentence has rhythm. Six medium-length sentences in a row is monotonous.
- Vary sentence openers: don't begin every sentence with "The", "This", "We", or "When".
- A section should feel like music, not a metronome.`;

/**
 * The source-citation contract every writer agent must follow.
 * Pasted verbatim into writer prompts to keep enforcement uniform.
 */
export const SOURCE_CITATION_RULES = `🔒 EVERY STATISTIC NEEDS A SOURCE URL — NO EXCEPTIONS 🔒

- Every number, percentage, dollar amount, multiplier ("3x", "47%"), benchmark, ranking, or industry claim MUST appear inside a sentence that also contains a real, clickable source URL. No exceptions.
- If you don't have a source URL for a number, DO NOT USE THE NUMBER. Rewrite the sentence as a qualitative observation instead.
- "We've seen", "we've found", "our team has watched" claims with a number MUST link to a Sequel case study from the INTERNAL LINK REFERENCE. If no case study exists for that outcome, drop the number and keep the observation.
- Industry averages, growth figures, conversion rates, adoption numbers, and benchmarks must cite real third-party research (Gartner, Forrester, G2, etc.), NOT the forbidden competitor list.
- Vague phrases like "studies show", "research suggests", "most teams", "the data is clear" are NOT substitutes for a source. Either cite a specific source or remove the claim.
- Anecdotes about "a customer we worked with" or "a team we saw" without a case study link count as unsourced claims and must be removed.

The editor will automatically strip unsourced statistics. Save yourself a round-trip: ONLY write numbers you can back up.`;

/**
 * Return true if the URL should be blocked (matches a forbidden domain
 * by exact match or substring).
 */
export function isForbiddenCitation(url: string): boolean {
  try {
    const normalized = url
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .toLowerCase();
    if (FORBIDDEN_CITATION_DOMAINS.some((d) => normalized === d)) return true;
    if (
      FORBIDDEN_CITATION_SUBSTRINGS.some((s) => normalized.includes(s))
    )
      return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Strip every markdown link whose URL matches a forbidden domain from
 * the given body. The anchor text is preserved as plain text so the
 * surrounding sentence still reads naturally.
 */
export function stripForbiddenLinks(markdown: string): {
  cleaned: string;
  removed: string[];
} {
  const removed: string[] = [];
  const cleaned = markdown.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, anchor: string, url: string) => {
      if (isForbiddenCitation(url)) {
        removed.push(url);
        return anchor; // unwrap
      }
      return match;
    }
  );
  return { cleaned, removed };
}
