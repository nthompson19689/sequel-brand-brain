import { getClaudeClient, MAX_TOKENS, resolveModel } from "@/lib/claude";
import { buildSystemBlocks, logCachePerformance } from "@/lib/brand-context";
import { deepResearch } from "@/lib/perplexity";
import type { WorkflowStep } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RunRequest {
  input: string;
  systemPrompt: string;
  steps: WorkflowStep[];
  referenceExamples?: string;
  model?: string;
  resumeFromStep?: number;
  previousOutputs?: Record<string, string>;
}

/**
 * Build the full user message for a step.
 * Always includes ALL previous step outputs as labeled context,
 * plus the step's own prompt with {{input}} and {{step_N}} interpolated.
 *
 * This ensures every step has the complete accumulated context,
 * even if the step prompt doesn't explicitly reference {{step_N}}.
 */
/** Max characters for previous step context before summarization kicks in */
const MAX_CONTEXT_CHARS = 8000;

/**
 * Summarize a step output to its first 500 chars + a truncation notice.
 * Used for older steps when context grows too large.
 */
function summarizeOutput(text: string, maxChars = 500): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n... [truncated — ${text.length} chars total. Key details above.]`;
}

function buildStepMessage(
  step: WorkflowStep,
  stepIndex: number,
  input: string,
  stepOutputs: Record<string, string>,
  allSteps: WorkflowStep[]
): string {
  const parts: string[] = [];

  // Include all previous step outputs as labeled context
  const prevStepNums = Object.keys(stepOutputs)
    .map(Number)
    .filter((n) => n <= stepIndex)
    .sort((a, b) => a - b);

  if (prevStepNums.length > 0) {
    // Calculate total context size
    const totalContextSize = prevStepNums.reduce((sum, n) => sum + (stepOutputs[String(n)]?.length || 0), 0);
    const shouldSummarize = totalContextSize > MAX_CONTEXT_CHARS && prevStepNums.length > 3;

    parts.push("=== CONTEXT FROM PREVIOUS STEPS ===\n");
    for (const n of prevStepNums) {
      const prevStep = allSteps[n - 1];
      const label = prevStep?.name || `Step ${n}`;
      const type = prevStep?.type || "unknown";
      parts.push(`--- STEP ${n} OUTPUT (${label} — ${type}) ---`);

      // Keep recent steps (last 2) at full length, summarize older ones
      const isRecent = n >= prevStepNums[prevStepNums.length - 1] - 1;
      if (shouldSummarize && !isRecent) {
        parts.push(summarizeOutput(stepOutputs[String(n)]));
      } else {
        parts.push(stepOutputs[String(n)]);
      }
      parts.push("");
    }
    parts.push("=== END OF PREVIOUS CONTEXT ===\n");
  }

  // Interpolate the step's own prompt
  let prompt = step.prompt.replace(/\{\{input\}\}/g, input);
  prompt = prompt.replace(/\{\{step_(\d+)\}\}/g, (_, n) => {
    return stepOutputs[n] || `[Step ${n} output not available]`;
  });

  parts.push(`=== YOUR TASK (Step ${stepIndex + 1}: ${step.name || "Execute"}) ===`);
  parts.push(prompt);

  return parts.join("\n");
}

async function runWebResearch(
  claude: ReturnType<typeof getClaudeClient>,
  systemBlocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>,
  userPrompt: string,
  modelId?: string
): Promise<string> {
  const response = await claude.messages.create({
    model: resolveModel(modelId),
    max_tokens: MAX_TOKENS,
    system: systemBlocks,
    tools: [{ type: "web_search_20250305" as const, name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: userPrompt }],
  });

  logCachePerformance("/api/agent/run[web]", response.usage);

  let output = "";
  for (const block of response.content) {
    if (block.type === "text") output += block.text;
  }
  return output;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RunRequest;
    const { input, systemPrompt, steps, referenceExamples, model: agentModel, resumeFromStep, previousOutputs } = body;

    if (!input || !steps || steps.length === 0) {
      return Response.json({ error: "Input and steps are required" }, { status: 400 });
    }

    const claude = getClaudeClient();

    // Build reference examples section
    let examplesSection = "";
    if (referenceExamples && referenceExamples.trim()) {
      examplesSection = `\n\n=== REFERENCE EXAMPLES ===\nHere are examples of the quality and format the user expects. Match this style, structure, voice, and length:\n\n${referenceExamples.trim()}`;
    }

    const additionalContext = [systemPrompt, examplesSection].filter(Boolean).join("\n\n");

    // Block 1: brand docs (CACHED, shared with chat/content)
    // Block 3: agent system prompt + reference examples (NOT cached)
    const { blocks: systemBlocks } = await buildSystemBlocks({ additionalContext });

    const encoder = new TextEncoder();
    const startIndex = resumeFromStep ?? 0;
    const stepOutputs: Record<string, string> = previousOutputs ? { ...previousOutputs } : {};

    const readable = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        try {
          for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            const stepNum = i + 1;

            send({ type: "step_start", stepIndex: i, stepName: step.name, stepType: step.type, totalSteps: steps.length });

            const fullMessage = buildStepMessage(step, i, input, stepOutputs, steps);

            if (step.type === "human_review") {
              send({ type: "human_review", stepIndex: i, stepName: step.name, prompt: fullMessage, previousOutputs: stepOutputs });
              send({ type: "paused", stepIndex: i });
              controller.close();
              return;
            }

            const stepModel = step.model || agentModel;
            const resolvedModel = resolveModel(stepModel);
            let stepContent = "";

            if (step.type === "deep_research") {
              send({ type: "step_delta", stepIndex: i, text: "Researching with Perplexity...\n\n" });
              try {
                const result = await deepResearch(fullMessage, systemBlocks.map((b) => b.text).join("\n\n"));
                stepContent = result.content;
                if (result.citations.length > 0) {
                  stepContent += "\n\n---\n**Sources:**\n";
                  result.citations.forEach((c, idx) => {
                    stepContent += `${idx + 1}. [${c.title || c.url}](${c.url})\n`;
                  });
                }
                send({ type: "step_delta", stepIndex: i, text: stepContent });
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Perplexity failed";
                send({ type: "step_delta", stepIndex: i, text: `Perplexity unavailable (${msg}), falling back...\n\n` });
                stepContent = await runWebResearch(claude, systemBlocks, fullMessage, stepModel);
                send({ type: "step_delta", stepIndex: i, text: stepContent });
              }
            } else if (step.type === "web_research") {
              send({ type: "step_delta", stepIndex: i, text: "Searching the web...\n\n" });
              stepContent = await runWebResearch(claude, systemBlocks, fullMessage, stepModel);
              send({ type: "step_delta", stepIndex: i, text: stepContent });
            } else {
              // ai_generation and search_knowledge_base — stream
              const stepBlocks = [...systemBlocks];
              if (step.type === "search_knowledge_base") {
                stepBlocks.push({
                  type: "text",
                  text: "\n\nYou are searching the company knowledge base. Return all relevant context you find.",
                });
              }

              const stream = await claude.messages.stream({
                model: resolvedModel,
                max_tokens: MAX_TOKENS,
                system: stepBlocks,
                messages: [{ role: "user", content: fullMessage }],
              });

              for await (const event of stream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  stepContent += event.delta.text;
                  send({ type: "step_delta", stepIndex: i, text: event.delta.text });
                }
              }

              const finalMsg = await stream.finalMessage();
              logCachePerformance(`/api/agent/run[step${stepNum}]`, finalMsg.usage);
            }

            stepOutputs[String(stepNum)] = stepContent;
            send({ type: "step_complete", stepIndex: i, stepName: step.name, output: stepContent });
          }

          send({ type: "pipeline_complete", outputs: stepOutputs });
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Pipeline error";
          send({ type: "error", error: message });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Agent run error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
