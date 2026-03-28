import { getClaudeClient, CHAT_MODEL, MAX_TOKENS } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import type { ArticleResult } from "@/lib/search";
import { formatArticlesForPrompt, searchArticlesByText } from "@/lib/search";

export const runtime = "nodejs";

const DEFAULT_SYSTEM_PROMPT = `You are the Sequel Brand Brain assistant. You help the Sequel team with questions about brand voice, content strategy, competitive positioning, and marketing.

You have access to:
1. Brand guidelines and governance documents (voice, tone, editorial standards)
2. The full content library — blog posts, case studies, product pages, and more
3. Battle cards and competitive intelligence

When answering questions about existing content (blog posts, case studies, etc.), ALWAYS reference the specific articles provided in the RETRIEVED CONTENT section below. Cite them by title and URL. If retrieved content is relevant, use it directly in your answer.

Ground your answers in real company data whenever possible. Be direct, specific, and helpful.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages: ChatMessage[];
      systemPrompt?: string;
    };
    const { messages, systemPrompt: agentPrompt } = body;

    if (!messages || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    const claude = getClaudeClient();

    // Search articles using the latest user message as the query
    const latestUserMessage = messages.filter((m) => m.role === "user").pop()?.content || "";
    let articles: ArticleResult[] = [];
    try {
      articles = await searchArticlesByText(latestUserMessage, 8);
      if (articles.length > 0) {
        console.log(`[Chat] Found ${articles.length} relevant articles for: "${latestUserMessage.slice(0, 60)}..."`);
      }
    } catch (err) {
      console.warn("[Chat] Article search failed:", err);
    }

    const basePrompt = agentPrompt || DEFAULT_SYSTEM_PROMPT;
    const articleContext = formatArticlesForPrompt(articles);
    const additionalContext = [basePrompt, articleContext].filter(Boolean).join("\n\n");

    // Build system blocks: Block 1 (brand docs, cached) + Block 3 (chat prompt, not cached)
    const { blocks, docs: brandDocs } = await buildSystemBlocks({
      additionalContext,
    });

    const sources = [
      ...brandDocs.map((d) => ({
        type: "brand_doc" as const,
        id: d.id,
        name: d.name,
        doc_type: d.doc_type,
      })),
      ...articles.map((a) => ({
        type: "article" as const,
        id: a.id,
        name: a.title,
        url: a.url,
        similarity: a.similarity,
      })),
    ];

    const stream = await claude.messages.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: blocks,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`)
          );

          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
              );
            }
          }

          // Log cache performance
          const finalMessage = await stream.finalMessage();
          logCachePerformance("/api/chat", finalMessage.usage);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Chat API error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
