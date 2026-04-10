import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const TICKET_ANALYSIS_PROMPT = `You are a support operations analyst. Analyze the batch of support tickets below and generate a documentation gaps report.

Your process:
1. Cluster tickets by topic to find the most frequently asked questions
2. Rank the top 10-20 recurring issues by frequency
3. For each cluster, determine if documentation likely exists or is missing
4. Generate draft articles for the top undocumented topics

Return ONLY valid JSON:
{
  "clusters": [
    {
      "topic": "topic name",
      "ticket_count": 5,
      "sample_questions": ["actual question from a ticket", "another one"],
      "has_documentation": false,
      "documentation_gap": "what's missing or broken about existing docs",
      "priority": "high|medium|low"
    }
  ],
  "draft_articles": [
    {
      "title": "How to...",
      "excerpt": "summary",
      "content_markdown": "full article",
      "product_area": "feature area",
      "search_keywords": ["kw1", "kw2"]
    }
  ],
  "insights": {
    "trending_up": ["topics increasing in frequency"],
    "needs_improvement": ["topics with docs that aren't preventing tickets"],
    "total_analyzed": 0
  }
}`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // CSV import of tickets
  if (Array.isArray(body.tickets)) {
    const rows = body.tickets.map((t: Record<string, unknown>) => ({
      ticket_subject: t.ticket_subject || t.subject || t.title || "",
      ticket_body: t.ticket_body || t.body || t.description || null,
      ticket_source: t.ticket_source || t.source || "email",
      customer_email: t.customer_email || t.email || null,
      customer_company: t.customer_company || t.company || null,
      product_area: t.product_area || null,
      resolution: t.resolution || null,
    }));

    const { data, error } = await supabase.from("docs_support_tickets").insert(rows).select();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ imported: (data || []).length });
  }

  // Analyze existing tickets
  if (body.analyze) {
    const { data: tickets } = await supabase
      .from("docs_support_tickets")
      .select("ticket_subject, ticket_body, product_area")
      .order("imported_at", { ascending: false })
      .limit(200);

    if (!tickets || tickets.length === 0) {
      return Response.json({ error: "No tickets to analyze" }, { status: 400 });
    }

    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({ additionalContext: TICKET_ANALYSIS_PROMPT });

    const ticketSummary = tickets.map((t, i) =>
      `${i + 1}. [${t.product_area || "general"}] ${t.ticket_subject}\n${(t.ticket_body || "").slice(0, 200)}`
    ).join("\n\n");

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: blocks,
      messages: [{
        role: "user",
        content: `Analyze these ${tickets.length} support tickets and generate a documentation gaps report:\n\n${ticketSummary}`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      // Auto-create draft articles for top gaps
      if (result.draft_articles && result.draft_articles.length > 0) {
        const articleRows = result.draft_articles.map((a: { title: string; excerpt: string; content_markdown: string; product_area: string; search_keywords: string[] }) => ({
          title: a.title,
          slug: a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36),
          content_markdown: a.content_markdown,
          excerpt: a.excerpt || "",
          source_type: "support_ticket",
          status: "review",
          product_area: a.product_area || null,
          search_keywords: a.search_keywords || [],
          created_by: "system",
        }));

        await supabase.from("docs_articles").insert(articleRows);
      }

      return Response.json({ analysis: result, parsed: true });
    } catch {
      return Response.json({ raw: rawText, parsed: false });
    }
  }

  return Response.json({ error: "Invalid request" }, { status: 400 });
}
