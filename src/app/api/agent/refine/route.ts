import { getClaudeClient, CHAT_MODEL, MAX_TOKENS } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { currentOutput, instruction, systemPrompt } = (await request.json()) as {
      currentOutput: string;
      instruction: string;
      systemPrompt?: string;
    };

    if (!currentOutput || !instruction) {
      return Response.json({ error: "currentOutput and instruction are required" }, { status: 400 });
    }

    const claude = getClaudeClient();

    const additionalContext = [
      systemPrompt || "You are a helpful writing assistant.",
      "The user has an existing piece of content and wants you to refine it based on their instructions.",
      "Return ONLY the complete updated content. No preamble, commentary, or explanation.",
    ].join("\n\n");

    // Block 1: brand docs (CACHED), Block 3: refine prompt (not cached)
    const { blocks } = await buildSystemBlocks({ additionalContext });

    const stream = await claude.messages.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: blocks,
      messages: [{ role: "user", content: `Here is the current content:\n\n${currentOutput}\n\n---\n\nPlease apply this change: ${instruction}` }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`));
          }
        }
        const finalMsg = await stream.finalMessage();
        logCachePerformance("/api/agent/refine", finalMsg.usage);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Refine failed" }, { status: 500 });
  }
}
