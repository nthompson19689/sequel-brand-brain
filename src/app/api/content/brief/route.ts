import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const BRIEF_SYSTEM = `You are a senior SEO content strategist building a brief for a writer. Your job is to research the keyword, analyze the SERPs, and produce a brief so specific that any competent writer could execute it without guessing.

Rules:
- Never use em dashes
- Every statistic or external claim MUST have a source URL. If you cannot find a credible source for a stat, DO NOT include it. Write around it.
- Include specific internal links with full URLs from the reference table
- Spread links naturally throughout different sections, not clustered at ends
- Be honest about competitor strengths. Credibility > sales pitch.
- Concrete > abstract. Numbers > adjectives. Examples > principles.

=== CONTENT TYPE RULES ===

FOR LISTICLES (e.g., "12 Webinar Presentation Tips"):
- The H1 number and actual item count MUST match exactly
- Each list item gets its own H2 with a clear, descriptive title
- Each item must be independently valuable (a skimmer should get value from any single item)
- Order: strongest/most unique items at positions 1-3 and the final position
- DO NOT merge items or use one H2 to cover "two bonus tips"

FOR HOW-TO GUIDES (e.g., "How to Host a Webinar"):
- Steps must be sequential, a reader follows them in order
- Each step gets an H2 with an action verb: "Set Up..." "Configure..." "Test..."
- Include expected time/effort per step where relevant
- Flag common mistakes at each step, not in a separate "mistakes" section
- End with a "what good looks like" example or checklist

FOR COMPARISON POSTS (e.g., "Livestorm Alternatives"):
- Lead with a summary comparison table before detailed sections
- Each alternative gets an H2 with the product name
- Cover the same evaluation criteria for each (features, pricing, pros, cons, best for)
- Be honest about competitors, credibility > sales pitch
- Position Sequel's differentiator through evaluation criteria, not through bias

FOR DEFINITION/EXPLAINER POSTS (e.g., "What Is a Webinar?"):
- Answer the core question in the first 2 sentences (featured snippet target)
- Then go deeper, the rest of the article justifies the depth
- Include "why it matters" context, not just definition
- Add practical examples early
- Include a "vs" section comparing to related concepts

FOR PILLAR PAGES (e.g., "Complete Guide to Revenue-Driven Webinars"):
- Comprehensive but not exhaustive, link to spokes for depth
- Each H2 should stand as its own mini-article
- Include a table of contents
- Internal links to spoke pages REQUIRED in every section
- Target 3,000-5,000 words`;

export async function POST(request: Request) {
  const { postId, keyword, postType, searchIntent, wordCount } = await request.json();

  const supabase = getSupabaseServerClient();
  const claude = getClaudeClient();

  // Block 1: brand docs (CACHED, shared with chat/agents)
  // Block 2: writing standards (CACHED, shared with write/edit)
  // Block 2b: article link reference (CACHED, shared with write route)
  // Block 3: brief-specific prompt (NOT cached)
  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    includeArticleReference: true,
    additionalContext: BRIEF_SYSTEM + "\n\nYou MUST select 5-10 links from the INTERNAL LINK REFERENCE to include in the brief. Pick the most topically relevant ones. Spread links naturally throughout different sections — do NOT cluster them.",
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (d: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));

      try {
        // ═══════════════════════════════════════
        // STEP 1: Multi-query SERP research
        // ═══════════════════════════════════════
        send({ type: "status", step: "research", message: "Researching top-ranking articles and SERP landscape..." });

        const researchResponse = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 16384,
          system: systemBlocks,
          tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 10 }],
          messages: [{ role: "user", content: `You are researching the keyword "${keyword}" to build a content brief. Complete ALL of these research tasks:

1. SERP ANALYSIS: Search "${keyword}" and analyze the top 5-7 ranking pages. For each, note:
   - Title, URL
   - Main H2 headings/topics covered
   - Approximate word count
   - Content type (listicle, how-to, comparison, guide, definition)
   - Unique angles or frameworks they use
   - What they do well vs. where they're thin

2. LONG-TAIL EXPLORATION: Search 2-3 related long-tail variations of "${keyword}" to understand the full intent landscape. Note what additional subtopics surface.

3. PEOPLE ALSO ASK: Note any "People Also Ask" questions and related searches you find for this keyword.

4. DATA POINT HUNTING: Search for recent, credible statistics related to "${keyword}". For each stat:
   - The exact claim/number
   - Source publication or study name
   - Full source URL
   - Year published
   Find at least 3-5 data points. Prefer primary sources (research reports, company blogs) over aggregator articles. If you cannot find a credible URL for a stat, DO NOT include it.

5. COMPETITIVE GAPS: Based on your analysis, identify:
   - TABLE STAKES: Topics every top ranker covers (we MUST include)
   - GAPS: Topics top rankers miss or underserve (our differentiation opportunities)
   - SEQUEL-SPECIFIC ANGLES: Things only Sequel can credibly say (tied to product capabilities, customer outcomes, or unique POV on webinars/events as revenue infrastructure)

Output your findings in a structured format with clear section headers.` }],
        });

        logCachePerformance("/api/content/brief[research]", researchResponse.usage);

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        send({ type: "research_complete", research: researchText });

        // ═══════════════════════════════════════
        // STEP 2: Generate the detailed brief
        // ═══════════════════════════════════════
        send({ type: "status", step: "brief", message: "Generating detailed brief..." });

        // Article list is already in the system blocks (Block 2b, cached).
        const gapContext = "\n\nRefer to the INTERNAL LINK REFERENCE in your system context for our existing blog content. Use it for internal linking AND to identify content gaps relative to competitors.";

        const targetWC = wordCount || 1800;
        const contentType = postType || "supporting";

        const briefPrompt = `Generate a detailed writing brief using the research below.

Keyword: ${keyword}
Post Type: ${contentType}
Search Intent: ${searchIntent || "informational"}
Target Word Count: ${targetWC}

Research findings:
${researchText}
${gapContext}

Follow this EXACT format. Every section is required. Do not skip any.

---

# Content Brief: ${keyword}

## Metadata
- **Target Keyword:** ${keyword}
- **Secondary Keywords:** [3-5 related terms found in SERP research, to include naturally]
- **URL Slug:** /${keyword.replace(/\s+/g, "-").toLowerCase()}/
- **Meta Title:** [under 60 characters, keyword front-loaded]
- **Meta Description:** [under 155 characters, includes keyword + compelling hook, starts with action verb]
- **Target Word Count:** ${targetWC}
- **Content Type:** [listicle | how-to guide | comparison | definition post | pillar page — based on what the SERPs reward]

## Search Intent Analysis
- **Primary Intent:** [informational | commercial | transactional | navigational]
- **Searcher Stage:** [awareness | consideration | decision]
- **Who is searching this:** [specific persona description, not just "marketers"]
- **What they want to DO after reading:** [specific action or decision]
- **What they already know:** [assumed baseline knowledge]
- **What they're frustrated by:** [why existing content hasn't solved their problem]

## SERP Competitive Analysis

### Table Stakes (every top ranker covers these, we MUST include):
1. [topic/section]
2. [topic/section]
3. [topic/section]
[add more if needed]

### Gaps (top rankers miss or underserve these, our differentiation):
1. [gap + why it matters to the reader]
2. [gap + why it matters to the reader]
3. [gap + why it matters to the reader]

### Sequel-Specific Angles (things only we can credibly say):
- [angle tied to product capability, customer story, or unique POV]
- [angle tied to product capability, customer story, or unique POV]

## Required Data Points & Sources

Every statistic or external claim in the article MUST have a source. If you cannot find a credible source, DO NOT include the stat.

| Claim/Stat | Source | URL | Year |
|---|---|---|---|
| [stat] | [publication/study] | [full URL] | [year] |
| [stat] | [publication/study] | [full URL] | [year] |
| [stat] | [publication/study] | [full URL] | [year] |
[minimum 3 rows, prefer 5+]

## Article Structure

### Title: [Exact H1, include the keyword and a compelling modifier]

${contentType === "listicle" ? "**LISTICLE RULE:** The H1 must include the number. The article must contain exactly that many items, each as its own H2.\n" : ""}${contentType === "how-to" || contentType === "question" ? "**HOW-TO RULE:** Steps must be sequential and actionable. Each step H2 starts with an action verb.\n" : ""}${contentType === "comparison" ? "**COMPARISON RULE:** Lead with a summary comparison table. Cover the same criteria for each alternative.\n" : ""}${contentType === "pillar" ? "**PILLAR RULE:** Each H2 stands alone as a mini-article. Internal links to spoke pages required in every section. Include a table of contents.\n" : ""}

### Introduction (100-150 words)
- **Hook:** [specific hook: stat, counterintuitive claim, or pain point]
- **Context:** [1-2 sentences framing why this matters NOW]
- **Promise:** [exactly what the reader will walk away with]
- **Transition:** [bridge to the first section]

[For each H2 section, use this format:]

### H2: [Section Title, descriptive, keyword-aware, NO colons]
- **Core argument:** [one sentence: what is the POINT of this section?]
- **Must include:** [specific examples, data points from the table above, or frameworks required]
- **Sequel angle:** [how does this connect to what Sequel does or believes?]
- **Word count:** [target for this section, all section targets must sum to ${targetWC}]

[Provide the full outline with ALL H2 sections. Typical counts:
- Under 1,500 words: 3-4 H2 sections
- 1,500-2,000 words: 4-5 H2 sections
- 2,000-3,000 words: 5-7 H2 sections
- Over 3,000 words: 6-8+ H2 sections]

### Conclusion (100-150 words)
- **Summary approach:** [recap key points | call to action | forward-looking statement]
- **CTA:** [what do we want them to do next, specific page, resource, or action]

## FAQ Section
3-5 questions sourced from People Also Ask, related searches, and competitor content.

| Question | Answer Summary (2-3 sentences) |
|---|---|
| [question] | [concise, self-contained answer] |

## Internal Linking Requirements (5-10 links from the INTERNAL LINK REFERENCE)
Select the most topically relevant articles. Each link in a DIFFERENT section. Use the EXACT URLs from the reference table.

| Anchor Text (2-4 words) | Target URL | Placement (which H2) |
|---|---|---|
| [natural anchor] | [full sequel.io URL from reference] | [section name] |
[5-10 rows, each URL used only once, each in a different section]

## Tone & Voice Constraints
- Write for a senior B2B marketer who has run webinars/events before
- No fluff: "In today's digital landscape," "It's no secret that," "Let's dive in"
- No filler transitions: "Now that we've covered X, let's look at Y"
- Assume competence, don't over-explain basics
- Use "you" and "your," direct address
- Concrete > abstract. Numbers > adjectives. Examples > principles.
- Every claim backed by a specific example or data point
- Match Sequel's POV: webinars are infrastructure, not events. Data and pipeline matter, not vanity metrics.`;

        const stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 16384,
          system: systemBlocks,
          messages: [{ role: "user", content: briefPrompt }],
        });

        let briefContent = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            briefContent += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const finalMsg = await stream.finalMessage();
        logCachePerformance("/api/content/brief[generate]", finalMsg.usage);

        if (supabase && postId) {
          const titleMatch = briefContent.match(/### Title:\s*(.+)/) || briefContent.match(/#### H1:\s*(.+)/);
          const title = titleMatch ? titleMatch[1].trim() : keyword;
          await supabase.from("content_posts").update({ brief: briefContent, title, status: "brief_generated" }).eq("id", postId);
        }

        send({ type: "complete", brief: briefContent });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Brief generation failed" });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
