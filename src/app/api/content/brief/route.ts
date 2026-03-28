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

  // Get ALL existing Sequel articles for internal link reference (we want 5-10 in the brief)
  let existingArticles: Array<{ title: string; slug: string; primary_keyword: string; url: string }> = [];
  if (supabase) {
    const { data } = await supabase
      .from("articles")
      .select("title, slug, primary_keyword, url")
      .not("url", "is", null)
      .order("title")
      .limit(300);
    existingArticles = ((data || []) as typeof existingArticles).filter(a => a.url && a.url.includes("sequel.io"));
  }

  const linkRef = existingArticles.length > 0
    ? "\n\n=== INTERNAL LINK REFERENCE — SEQUEL BLOG POSTS (SELECT 5-10 FOR THIS ARTICLE) ===\n" +
      "You MUST select 5-10 links from this list to include in the brief. Pick the most topically relevant ones.\n" +
      "Spread links naturally throughout different sections — do NOT cluster them.\n" +
      "Use the EXACT URLs listed below. NEVER invent a URL. ONLY use sequel.io URLs from this list.\n" +
      `Total articles available: ${existingArticles.length}\n\n` +
      existingArticles.map((a, i) => {
        return `${i + 1}. "${a.title}" → ${a.url} (keyword: ${a.primary_keyword || "n/a"})`;
      }).join("\n")
    : "";

  // Block 1: brand docs (CACHED, shared with chat/agents)
  // Block 2: writing standards (CACHED, shared with write/edit)
  // Block 3: brief-specific prompt (NOT cached)
  const { blocks: systemBlocks } = await buildSystemBlocks({
    includeWritingStandards: true,
    additionalContext: BRIEF_SYSTEM + linkRef,
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

        let gapContext = "";
        if (existingArticles.length > 0) {
          gapContext = `\n\nOur existing Sequel blog content (${existingArticles.length} articles):\n${existingArticles.slice(0, 50).map((a) => `- "${a.title}" → ${a.url}`).join("\n")}`;
        }

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
There are ${existingArticles.length} Sequel blog posts available. You MUST select 5-10 of the most topically relevant ones. For EACH link:
- Provide the EXACT URL from the reference table (sequel.io URLs only)
- Specify which H2 section it belongs in
- Suggest natural anchor text (2-4 words, not the full title)
- Each link should be in a DIFFERENT section — spread them throughout
- NEVER use placeholder text like "[Will be added later]" — the library has ${existingArticles.length} articles to choose from right now

### AEO Optimization Notes
[Answer Engine Optimization suggestions]

### SEO Notes
[Meta title suggestion, meta description, secondary keywords]`;

        const stream = await claude.messages.stream({
          model: resolveModel("claude-sonnet-4-6"),
          max_tokens: MAX_TOKENS * 2,
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
