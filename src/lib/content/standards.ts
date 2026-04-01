/**
 * Writing standards + Nathan's style guide — Block 2 in content pipeline Claude calls.
 */
import { NATHAN_STYLE_GUIDE } from "./nathan-style-guide";

export const WRITING_STANDARDS = `=== WRITING STANDARDS (Block 2 — Always enforced in content pipeline) ===

ESSAY DEPTH (HIGHEST PRIORITY)
- Write essays that happen to be optimized, not SEO listicles
- At least 2-3 sections per article must be 400+ words of sustained prose argument
- A section should NOT be: H2 → intro sentence → bullet list → done
- A section SHOULD be: paragraphs developing the argument → maybe a list for specifics → more prose on what it means
- Vary section lengths dramatically: some 100 words, some 500+
- Every section connects to the one before and after it with transitional phrases
- The article reads as one continuous argument, not 8 independent mini-articles

STRUCTURE
- First sentence of every H2 directly answers the question implied by the heading (for AEO)
- Vary paragraph length by purpose: 1-2 sentences for emphasis/pivots, 3-5 sentences for argument development
- NOT every paragraph should be the same length. The variation creates rhythm.
- No colons in headings
- No em dashes anywhere
- FAQ section required: 5-7 questions, each answer 2-4 self-contained sentences
- Never use the same H2 structure twice in a row

ANTI-PATTERNS (from real before/after analysis — NEVER do these)
- REPETITIVE H2 STRUCTURE: claim → stat → takeaway, repeated across every section. Each section must earn its own shape.
- REPETITIVE SENTENCE CONSTRUCTION: four sentences of the same length in a paragraph. Vary aggressively. Long setup, short punch.
- SETUP SENTENCES: "This makes audio perfect for capturing broad awareness" — tells the reader what comes next. Cut it. Lead with the claim.
- SIMPLE QUESTION → NUMBERED LIST: If the answer is yes/no with context, write 2-3 prose sentences. Numbered steps are for actual sequential processes.
- MIRROR-IMAGE SECTIONS: If two sections have identical skeletons with different nouns, restructure one.
- HEDGED TAKES: "highly effective," "actually growing" — take a position instead. "Engagement is going up. 51 minutes average. That's longer than most sales calls."
- GENERIC CLAIMS: "Audio is highly effective at building familiarity" — says nothing a reader couldn't guess. Add perspective.

VOICE & STYLE
- No passive voice
- No filler openers: "In today's world", "In the ever-evolving landscape", "It's important to note"
- Never two consecutive sentences starting with the same word
- No AI sign-off phrases: "In conclusion, it's clear that"
- Vary sentence length aggressively. Long then short. Short carries the weight.
- Conversational asides and parenthetical observations are encouraged — they're voice, not filler
- Start with the point, not the setup. Never warm up.
- Opinions stated as facts. No hedging, no "arguably"
- Be specific. Replace every vague claim with a number, a name, or a fact.
- Take positions. The Before explains. The After argues. Be the After.

FORMATTING VARIETY
- Default mode is prose paragraphs, not bullet lists
- Target: 60% prose, 25% bullet/numbered lists, 15% short punchy sections
- Lists are seasoning, not the main course. Use only when content is genuinely list-like.
- Never use same formatting type for more than 2 consecutive sections
- Minimum 3 items in any list
- Numbered list items get bold headers with explanation below

CITATIONS & LINKS
- Minimum 5-7 internal links spread across the full article, using URLs from the internal link reference table
- ONLY link to real blog post URLs (e.g. https://systemsledgrowth.ai/post/...). NEVER link to homepage, product pages, or generic pages.
- Every external statistic must have a markdown link to its source
- Minimum 3 verified external citations per article
- Each URL linked ONLY ONCE in the entire article

ANCHOR TEXT RULES
- 2-4 words maximum — never a full sentence
- GOOD: [content-led growth], [B2B conversion rates]
- BAD: [According to a recent study by HubSpot that found]
- Never: "click here", "read more", "learn more"
- The link should be invisible in the sentence — reader reads it the same with or without

META
- Meta title: 55-60 characters, primary keyword within first 5 words
- Meta description: 150-160 characters, starts with an action verb
- SLUG: exact primary keyword hyphenated (e.g. "content marketing automation" → "content-marketing-automation")

CLOSINGS
- Never summarize what the article covered
- End on the strongest sentence. If adding a summary weakens it, cut.

WRITING STYLE PATTERNS (from reference chapter):
- HOOK: Short vivid image → specific examples → flip to the argument
- SENTENCE RHYTHM: 40-word sentence → 5-word sentence. Short one lands BECAUSE the long one set it up.
- PARAGRAPH PURPOSE: Data paragraphs (3-5 sentences, dense with numbers). Argument paragraphs (2-4 sentences). Pivot paragraphs (1 sentence, full stop). Story paragraphs (3-5 sentences, conversational).
- ASIDES ARE VOICE: "(all, ironically, in the name of efficiency)" — these build trust
- POSITIONS, NOT EXPLANATIONS: Don't state facts generically. Make arguments with perspective.
- EACH SECTION EARNS ITS SHAPE: metaphor → contrast → punchline / data dump → position / personal narrative → numbers → reflection. Never repeat a skeleton.

${NATHAN_STYLE_GUIDE}`;


/** THE KILL LIST — Never use any of these */
export const BANNED_FILLER_PHRASES = [
  // Corporate speak
  "in today's rapidly evolving", "in today's fast-paced", "in today's",
  "in the modern", "in an era where",
  "it's no secret that", "at the end of the day",
  "in the ever-changing landscape", "in the ever-evolving landscape",
  "in this day and age", "as we all know",
  // Filler openers
  "let's dive in", "let's explore", "let's unpack",
  "without further ado", "buckle up",
  "it goes without saying", "needless to say",
  "the fact of the matter is", "when all is said and done",
  "last but not least", "in conclusion", "to summarize",
  "it's important to note that", "it's worth noting that",
  "it's important to note", "it's worth noting",
  // Transitions that add nothing
  "the reality is", "the truth is", "here's the thing",
  "here's the deal", "the bottom line is", "the bottom line",
  "let's face it", "make no mistake",
  "at its core", "at its heart",
  "moving forward", "going forward",
  "moreover", "furthermore", "additionally",
  // Buzzwords
  "leverage", "synergy", "game-changer", "game-changing",
  "paradigm shift", "paradigm",
  "move the needle", "low-hanging fruit", "north star",
  "circle back", "deep dive", "double down",
  "take it to the next level",
  "robust", "cutting-edge", "best-in-class", "world-class",
  "holistic", "streamline", "empower", "revolutionize",
  "transformative", "disruptive", "innovative solution",
  "unlock the power", "unlock", "harness the potential", "harness",
  "navigate the complexities", "navigate",
  "in the realm of", "the landscape of", "landscape",
  "look no further", "comprehensive", "seamless", "seamlessly",
  "ecosystem", "a myriad of", "myriad",
  // AI/lazy writing patterns
  "this is where [", "enter [", "think of it as",
  "simply put", "interestingly", "fascinatingly", "remarkably",
  "let me explain", "allow me to",
  "the key takeaway", "key takeaways",
  "so what does this mean", "what does this look like in practice",
  "arguably",
  // Structural phrases to avoid
  "whether you're a",
  "in order to", // just use "to"
  "at scale",
  "full stop.", "period.", // for emphasis
];


/** Run banned pattern scan — returns all violations found */
export function scanBannedPatterns(text: string): Array<{ pattern: string; matches: string[]; type: string }> {
  const violations: Array<{ pattern: string; matches: string[]; type: string }> = [];

  // Banned filler phrases
  for (const phrase of BANNED_FILLER_PHRASES) {
    // Handle phrases with brackets by escaping them
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const matches = Array.from(text.matchAll(regex)).map((m) => {
      const start = Math.max(0, (m.index || 0) - 20);
      const end = Math.min(text.length, (m.index || 0) + m[0].length + 20);
      return "..." + text.slice(start, end) + "...";
    });
    if (matches.length > 0) violations.push({ pattern: phrase, matches, type: "filler" });
  }

  // Em/en dashes (Unicode and double-hyphen variants)
  const dashRegex = /[\u2014\u2013]|(?<=[a-zA-Z0-9])\s*--\s*(?=[a-zA-Z])/g;
  const dashMatches = Array.from(text.matchAll(dashRegex)).map((m) => {
    const start = Math.max(0, (m.index || 0) - 30);
    const end = Math.min(text.length, (m.index || 0) + 31);
    return text.slice(start, end);
  });
  if (dashMatches.length > 0) violations.push({ pattern: "em/en dash", matches: dashMatches, type: "dash" });

  // Colons in headings
  const colonHeadingRegex = /^(#{1,6}\s+.+:.+)$/gm;
  const colonMatches = Array.from(text.matchAll(colonHeadingRegex)).map((m) => m[1]);
  if (colonMatches.length > 0) violations.push({ pattern: "colon in heading", matches: colonMatches, type: "heading" });

  // Exclamation clusters (2+ within 80 chars)
  const exclRegex = /![^!]{0,80}!/g;
  const exclMatches = Array.from(text.matchAll(exclRegex)).map((m) => m[0].slice(0, 60));
  if (exclMatches.length > 0) violations.push({ pattern: "exclamation cluster", matches: exclMatches, type: "exclamation" });

  // "It's not about X, it's about Y" and all variants — THE major AI tell
  // Catches: "It's not X, it's Y", "isn't about X. It's about Y", "This isn't about X",
  // "The problem isn't X", "ROI measurement isn't about X. It's about Y"
  const notAboutPatterns = [
    /.{3,40}\s+isn'?t\s+about\s+.{5,120}[.]\s*It'?s\s+about\s+/g,       // "X isn't about... It's about"
    /[Ii]t'?s\s+not\s+about\s+.{5,120}[.—,]\s*[Ii]t'?s\s+about\s+/g,    // "It's not about... it's about"
    /[Tt]his\s+isn'?t\s+about\s+.{5,120}[.—,]\s*[Ii]t'?s\s+about\s+/g,  // "This isn't about... it's about"
    /[Ii]t'?s\s+not\s+.{2,40}[\s,;.]+[Ii]t'?s\s+/g,                     // Generic "it's not X, it's Y"
    /[Tt]he\s+problem\s+isn'?t\s+/g,                                      // "The problem isn't"
    /[Tt]his\s+isn'?t\s+about\s+/g,                                       // "This isn't about"
  ];
  const itsNotMatches: string[] = [];
  for (const regex of notAboutPatterns) {
    const matches = Array.from(text.matchAll(regex));
    for (const m of matches) {
      const start = Math.max(0, (m.index || 0) - 10);
      const end = Math.min(text.length, (m.index || 0) + m[0].length + 10);
      itsNotMatches.push(text.slice(start, end));
    }
  }
  if (itsNotMatches.length > 0) violations.push({ pattern: "it's not X, it's Y / isn't about X", matches: Array.from(new Set(itsNotMatches)), type: "construction" });

  // Paragraphs — we now ALLOW 3-5 sentence paragraphs for essay depth.
  // Only flag paragraphs with 6+ sentences as genuinely too long.
  const paragraphs = text.split(/\n\n+/);
  const longParas: string[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("1.")) continue;
    const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
    if (sentences.length >= 6) {
      longParas.push(trimmed.slice(0, 80) + "...");
    }
  }
  if (longParas.length > 0) violations.push({ pattern: "paragraph with 6+ sentences (split needed)", matches: longParas, type: "structure" });

  // Consecutive paragraphs starting with same word
  const paraStarts: string[] = [];
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const firstWord = trimmed.split(/\s/)[0]?.toLowerCase();
    if (firstWord) paraStarts.push(firstWord);
  }
  const repetitions: string[] = [];
  for (let i = 2; i < paraStarts.length; i++) {
    if (paraStarts[i] === paraStarts[i - 1] && paraStarts[i] === paraStarts[i - 2]) {
      repetitions.push(`3 consecutive paragraphs starting with "${paraStarts[i]}"`);
    }
  }
  if (repetitions.length > 0) violations.push({ pattern: "consecutive paragraphs same start word", matches: repetitions, type: "structure" });

  // "From X to Y" pattern
  const fromToRegex = /\bFrom\s+.{5,40}\s+to\s+.{5,40}[,.]/g;
  const fromToMatches = Array.from(text.matchAll(fromToRegex)).map((m) => m[0].slice(0, 60));
  if (fromToMatches.length > 1) violations.push({ pattern: "repeated 'From X to Y' construction", matches: fromToMatches, type: "construction" });

  return violations;
}

/** Quality gates — returns pass/fail for each */
export function runQualityGates(
  text: string,
  targetWordCount?: number
): Array<{ name: string; passed: boolean; detail: string }> {
  const gates: Array<{ name: string; passed: boolean; detail: string }> = [];
  const wordCount = text.split(/\s+/).length;

  // FAQ section
  const hasFaq = /##\s*FAQ|##\s*Frequently Asked/i.test(text);
  gates.push({ name: "FAQ Section", passed: hasFaq, detail: hasFaq ? "Found" : "Missing FAQ section" });

  // Internal links (markdown links)
  const internalLinks = Array.from(text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g));
  const internalCount = internalLinks.length;
  gates.push({ name: "Internal Links >= 5", passed: internalCount >= 5, detail: `${internalCount} found` });

  // External citations
  const urlLinks = internalLinks.filter((m) => m[2].startsWith("http"));
  gates.push({ name: "External Citations >= 3", passed: urlLinks.length >= 3, detail: `${urlLinks.length} found` });

  // Duplicate links
  const urlMap = new Map<string, number>();
  for (const m of internalLinks) {
    const url = m[2].split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
    urlMap.set(url, (urlMap.get(url) || 0) + 1);
  }
  const dupes = Array.from(urlMap.entries()).filter(([, c]) => c > 1);
  gates.push({ name: "No Duplicate Links", passed: dupes.length === 0, detail: dupes.length === 0 ? "Clean" : `${dupes.length} duplicated URLs` });

  // Word count — must be within ±10% of target
  if (targetWordCount) {
    const pct = (wordCount / targetWordCount) * 100;
    const withinRange = pct >= 90 && pct <= 110;
    gates.push({
      name: `Word Count ±10% of ${targetWordCount}`,
      passed: withinRange,
      detail: `${wordCount} words (${pct.toFixed(0)}%)${pct > 110 ? ` — ${wordCount - targetWordCount} words OVER target` : pct < 90 ? ` — ${targetWordCount - wordCount} words UNDER target` : ""}`,
    });
  }

  // H2 subheadings
  const h2s = Array.from(text.matchAll(/^## /gm));
  gates.push({ name: "H2 Subheadings >= 3", passed: h2s.length >= 3, detail: `${h2s.length} found` });

  // Banned patterns remaining
  const violations = scanBannedPatterns(text);
  const totalViolations = violations.reduce((s, v) => s + v.matches.length, 0);
  gates.push({ name: "Zero Banned Patterns", passed: totalViolations === 0, detail: totalViolations === 0 ? "Clean" : `${totalViolations} violations` });

  // Paragraph length (6+ sentences is too long, 3-5 is fine for essay depth)
  const longParaViolation = violations.find((v) => v.pattern.includes("6+ sentences"));
  gates.push({ name: "No 6+ Sentence Paragraphs", passed: !longParaViolation, detail: longParaViolation ? `${longParaViolation.matches.length} overly long paragraphs` : "Clean" });

  // FAQ format: must be ## FAQ with ### questions
  const faqH2Match = text.match(/^## (?:FAQ|Frequently Asked Questions?)/m);
  const faqH3s = text.match(/^### .+\?$/gm);
  const faqFormatOk = !!faqH2Match && !!faqH3s && faqH3s.length >= 3;
  gates.push({ name: "FAQ Format (H2 + H3 questions)", passed: faqFormatOk, detail: faqFormatOk ? `${faqH3s?.length || 0} H3 questions under H2` : faqH2Match ? `FAQ H2 found but ${faqH3s?.length || 0} H3 questions (need 3+)` : "Missing ## FAQ heading" });

  // External citation count — these must survive editing
  const externalCitations = internalLinks.filter((m) => m[2].startsWith("http") && !m[2].includes("sequel.io"));
  gates.push({ name: "External Citations >= 3", passed: externalCitations.length >= 3, detail: `${externalCitations.length} external citations` });

  // ── Structural repetition check ──
  const h2Sections = text.split(/^## /gm).filter((s) => s.trim().length > 50);
  if (h2Sections.length >= 3) {
    const openingPatterns: string[] = [];
    const closingPatterns: string[] = [];

    for (const section of h2Sections) {
      const lines = section.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      const firstLine = (lines[0] || "").trim();
      if (!firstLine) { openingPatterns.push("unknown"); closingPatterns.push("unknown"); continue; }

      // Classify opening
      if (/^most\s+(companies|teams|organizations|brands|marketers|people)/i.test(firstLine)) {
        openingPatterns.push("most-companies");
      } else if (firstLine.endsWith("?")) {
        openingPatterns.push("question");
      } else if (/^\d|^\$|percent|%/.test(firstLine)) {
        openingPatterns.push("data");
      } else if (/^(1\.|[-*]\s)/.test(firstLine)) {
        openingPatterns.push("list");
      } else if (firstLine.length < 60 && !firstLine.includes(",")) {
        openingPatterns.push("bold-declarative");
      } else {
        openingPatterns.push("prose");
      }

      // Classify closing — last non-empty line
      const lastLine = lines.filter((l) => l.trim()).pop()?.trim() || "";
      if (lastLine.endsWith("?")) {
        closingPatterns.push("rhetorical-question");
      } else if (/^That['']s\s/.test(lastLine) && lastLine.endsWith(".")) {
        closingPatterns.push("thats-noun");
      } else {
        closingPatterns.push("other");
      }
    }

    // Check for 3+ consecutive same opening pattern
    let maxConsecutiveOpen = 1;
    let currentRunOpen = 1;
    for (let i = 1; i < openingPatterns.length; i++) {
      if (openingPatterns[i] === openingPatterns[i - 1]) {
        currentRunOpen++;
        maxConsecutiveOpen = Math.max(maxConsecutiveOpen, currentRunOpen);
      } else {
        currentRunOpen = 1;
      }
    }
    gates.push({
      name: "Structural Variety (Openers)",
      passed: maxConsecutiveOpen < 3,
      detail: maxConsecutiveOpen < 3
        ? `${new Set(openingPatterns).size} different patterns across ${openingPatterns.length} sections`
        : `${maxConsecutiveOpen} consecutive sections with same opening pattern`,
    });

    // Check "Most companies..." opener overuse (max 2 per article)
    const mostCompaniesCount = openingPatterns.filter((p) => p === "most-companies").length;
    gates.push({
      name: '"Most companies..." Opener Limit',
      passed: mostCompaniesCount <= 2,
      detail: mostCompaniesCount <= 2
        ? `${mostCompaniesCount} uses (OK)`
        : `${mostCompaniesCount} sections open with "Most companies..." pattern (max 2)`,
    });

    // Check rhetorical question closers (max 1 per article)
    const rhetoricalCount = closingPatterns.filter((p) => p === "rhetorical-question").length;
    gates.push({
      name: "Rhetorical Question Closers (max 1)",
      passed: rhetoricalCount <= 1,
      detail: rhetoricalCount <= 1
        ? `${rhetoricalCount} (OK)`
        : `${rhetoricalCount} sections end with rhetorical questions (max 1 per article)`,
    });

    // Check "That's [noun]." closers (max 1 per article)
    const thatsCount = closingPatterns.filter((p) => p === "thats-noun").length;
    gates.push({
      name: '"That\'s [noun]." Closer Limit',
      passed: thatsCount <= 1,
      detail: thatsCount <= 1
        ? `${thatsCount} (OK)`
        : `${thatsCount} sections end with "That's [noun]." pattern (max 1)`,
    });
  }

  // ── List content ratio ──
  const allLines = text.split("\n");
  const listLines = allLines.filter((l) => /^\s*[-*]\s|^\s*\d+\.\s/.test(l));
  const bulletLists = text.split(/\n(?=\s*[-*]\s)/); // rough count of list blocks
  const numberedLists = text.split(/\n(?=\s*1\.\s)/);
  const totalLists = (bulletLists.length - 1) + (numberedLists.length - 1);
  const listRatio = allLines.length > 0 ? (listLines.length / allLines.length) * 100 : 0;

  gates.push({
    name: "List Content >= 25%",
    passed: listRatio >= 25,
    detail: `${listRatio.toFixed(0)}% of lines are list items (${listLines.length}/${allLines.length})`,
  });

  gates.push({
    name: "Minimum 3 List Blocks",
    passed: totalLists >= 3,
    detail: totalLists >= 3
      ? `${totalLists} list blocks found`
      : `Only ${totalLists} list blocks (need at least 3 bullet or numbered lists)`,
  });

  // ── Link quality ──
  const linkLines2 = text.split("\n").filter((l) => /\[.+\]\(.+\)/.test(l));
  let seoStyleLinks = 0;
  for (const line of linkLines2) {
    const trimmed = line.trim();
    if (/^(related|read more|check out|learn more|see our|for more)/i.test(trimmed)) {
      seoStyleLinks++;
    }
    const linkTextMatch = trimmed.match(/\[([^\]]+)\]/);
    if (linkTextMatch && linkTextMatch[1].length > trimmed.length * 0.5) {
      seoStyleLinks++;
    }
  }
  if (linkLines2.length > 0) {
    gates.push({
      name: "Natural Link Integration",
      passed: seoStyleLinks === 0,
      detail: seoStyleLinks === 0
        ? "All links woven naturally"
        : `${seoStyleLinks} links read as SEO references instead of natural text`,
    });
  }

  return gates;
}
