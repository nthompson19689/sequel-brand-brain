import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const BRIEF_SYSTEM = `You are a content strategist. Your job is to generate a detailed writing brief for a blog post based on keyword research data.

Rules:
- Never use em dashes
- Include specific stats with sources
- Specify exact internal links with full URLs where possible
- Weave links naturally throughout, not clustered at ends

Post type rules:
- Pillar: 5-8 H2 sections with full H2+H3 structure, comprehensive coverage
- Supporting: 3-5 H2 sections, connect to pillar topic, more focused
- Question: 2-3 H2 sections, direct answer in opening 2 sentences, concise`;

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
        // Step 1: Web research
        send({ type: "status", step: "research", message: "Researching top-ranking articles..." });

        const researchResponse = await claude.messages.create({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS,
          system: systemBlocks,
          tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
          messages: [{ role: "user", content: `Research the keyword "${keyword}". Find the top 5-10 ranking articles. For each, note: title, URL, main headings/topics covered, approximate word count, unique angles. Also identify common questions people ask about this topic.` }],
        });

        logCachePerformance("/api/content/brief[research]", researchResponse.usage);

        let researchText = "";
        for (const block of researchResponse.content) {
          if (block.type === "text") researchText += block.text;
        }

        send({ type: "status", step: "gaps", message: "Analyzing content gaps..." });

        // Article list is already in the system blocks (Block 2b, cached).
        // Just remind the model to use it for gap analysis.
        const gapContext = "\n\nRefer to the INTERNAL LINK REFERENCE in your system context for our existing blog content. Identify gaps relative to what competitors cover.";

        send({ type: "status", step: "brief", message: "Generating detailed brief..." });

        const briefPrompt = `Generate a detailed writing brief for this post:

Keyword: ${keyword}
Post Type: ${postType || "supporting"}
Search Intent: ${searchIntent || "informational"}
Target Word Count: ${wordCount || 1800}

Research findings:
${researchText}
${gapContext}

Follow this exact format:

## BRIEF: ${keyword}

### Metadata
- Keyword: ${keyword}
- Post Type: ${postType || "supporting"}
- Target Word Count: ${wordCount || 1800}
- Search Intent: ${searchIntent || "informational"}

### Purpose
[One sentence on why this post exists and what it achieves]

### Reader Context
[Who is reading this, what did they search, what do they need]

### Outline
#### H1: [Suggested title]
#### Intro (150-250 words)
[What the intro should cover]

[For each H2 section:]
#### H2: [Section heading - NO colons]
[What this section covers, key points, data to include]

#### Closing (100-150 words)
[How to close]

### Data Points to Include
- [Stat 1 with source URL]
- [Stat 2 with source URL]
- [At least 3 stats]

### Internal Links (Required: 5-10 links from the reference table above)
Refer to the INTERNAL LINK REFERENCE in your system context. You MUST select 5-10 of the most topically relevant ones. For EACH link:
- Provide the EXACT URL from the reference table (sequel.io URLs only)
- Specify which H2 section it belongs in
- Suggest natural anchor text (2-4 words, not the full title)
- Each link should be in a DIFFERENT section — spread them throughout
- NEVER use placeholder text like "[Will be added later]" — select from the articles listed in your system context

### AEO Optimization Notes
[Answer Engine Optimization suggestions]

### SEO Notes
[Meta title suggestion, meta description, secondary keywords]`;

        const stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: 12288, // Briefs are detailed (outline + data points + 5-10 links + SEO notes)
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
          const titleMatch = briefContent.match(/#### H1:\s*(.+)/);
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
