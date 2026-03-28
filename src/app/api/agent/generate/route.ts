import { getClaudeClient } from "@/lib/claude";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { description } = (await request.json()) as {
      description: string;
    };

    if (!description?.trim()) {
      return Response.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    const claude = getClaudeClient();

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are an expert agent builder. The user describes what they want an AI agent to do. You design the optimal multi-step workflow pipeline.

Available step types:
- "ai_generation": Calls Claude to generate, analyze, synthesize, or write content. Best for: compiling research into a deliverable, writing briefs/reports, analyzing data, making recommendations.
- "web_research": Uses Claude with live web search to find real, current data from the internet. Best for: quick lookups, checking what content exists on a topic, finding recent news.
- "deep_research": Uses Perplexity Sonar Pro for thorough, citation-backed web research. Best for: detailed competitor research, comprehensive market analysis, finding statistics and data points, in-depth topic exploration. Returns results with source citations. PREFER this over web_research when the step needs comprehensive, well-sourced research.
- "search_knowledge_base": Searches the company's internal Supabase database (articles, battle cards, call insights). Best for: finding internal content, past call data, competitive intel already collected.
- "human_review": Pauses the pipeline for the user to review and approve before continuing. Best for: quality gates between research and writing, reviewing drafts before final output.

Rules:
- Design 2-5 steps. Keep it focused.
- Each step's prompt can reference {{input}} (user's input when they run the agent) and {{step_N}} (output of step N, 1-indexed).
- Research steps should come BEFORE synthesis/writing steps.
- The final step should usually be ai_generation that compiles everything into the deliverable.
- Write step prompts that are specific and actionable, not vague.
- Web research steps should tell Claude exactly what to search for.
- Do NOT include human_review unless the user specifically asks for approval gates.

Respond with ONLY valid JSON in this exact format, no markdown fences:
{
  "name": "Short agent name",
  "icon": "single emoji",
  "system_prompt": "The agent's role/identity in 1-2 sentences",
  "output_format": "What the final output looks like",
  "tools": ["articles", "battle_cards", "call_insights"],
  "steps": [
    {
      "name": "Step name",
      "type": "web_research|deep_research|search_knowledge_base|ai_generation|human_review",
      "prompt": "What this step does. Use {{input}} and {{step_N}} references."
    }
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Design an agent workflow for this description:\n\n${description.trim()}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response — handle possible markdown fences
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const workflow = JSON.parse(jsonStr);

    // Add IDs to steps
    if (workflow.steps) {
      workflow.steps = workflow.steps.map(
        (s: Record<string, string>, i: number) => ({
          ...s,
          id: "s" + (i + 1),
        })
      );
    }

    return Response.json(workflow);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate workflow";
    console.error("Generate error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
