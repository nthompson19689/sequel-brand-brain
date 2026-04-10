import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const RESEARCH_PROMPT = `You are an expert ABM research analyst. Research the given company and return a comprehensive account brief.

Your research should cover:
1. What the company does (products/services, target market, value proposition)
2. Company size, funding stage, and growth trajectory
3. Their tech stack (inferred from job postings, website, and public data)
4. Key decision makers (search for VP/C-level in Marketing, Sales, Growth, Revenue, Product)
5. Current priorities and pain points (inferred from job postings, blog posts, recent news)
6. Recent news, funding, or product launches
7. Recommended outreach angles based on what you've found

You MUST respond with ONLY valid JSON in this exact structure:
{
  "summary": "2-3 paragraph overview of the company",
  "industry": "their industry",
  "employee_count": "estimated range like '50-200' or '500-1000'",
  "funding_stage": "e.g. Series A, Series B, Public, Bootstrapped",
  "tech_stack": ["tool1", "tool2", "tool3"],
  "key_contacts": [
    {"name": "Full Name", "title": "Job Title", "linkedin": "linkedin URL if found", "email": "email if found"}
  ],
  "pain_points": ["pain point 1", "pain point 2"],
  "outreach_angles": ["angle 1", "angle 2", "angle 3"],
  "recent_news": ["news item 1", "news item 2"]
}`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { account_id, domain } = await request.json();
  if (!account_id || !domain) {
    return Response.json({ error: "account_id and domain required" }, { status: 400 });
  }

  try {
    const claude = getClaudeClient();

    // Use Claude with web search to research the company
    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [{ type: "text", text: RESEARCH_PROMPT }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      messages: [{
        role: "user",
        content: `Research this company thoroughly: ${domain}

Search for:
- Their website and about page
- "${domain}" company overview
- "${domain}" funding news
- "${domain}" leadership team
- "${domain}" job postings hiring
- "${domain}" product launches news

Then synthesize everything into the structured JSON format specified.`,
      }],
    });

    // Extract text from response
    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    // Parse the research results
    let research;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      research = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, save raw text as the brief
      await supabase
        .from("target_accounts")
        .update({
          account_brief: rawText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account_id);

      return Response.json({ account_id, brief: rawText, parsed: false });
    }

    // Update the account with structured research data
    const updates: Record<string, unknown> = {
      account_brief: research.summary || rawText,
      updated_at: new Date().toISOString(),
    };

    if (research.industry) updates.industry = research.industry;
    if (research.employee_count) updates.employee_count = research.employee_count;
    if (research.funding_stage) updates.funding_stage = research.funding_stage;
    if (research.tech_stack) updates.tech_stack = research.tech_stack;
    if (research.key_contacts) updates.key_contacts = research.key_contacts;

    // Store pain points and outreach angles in triggers jsonb
    if (research.pain_points || research.outreach_angles) {
      updates.triggers = {
        pain_points: research.pain_points || [],
        outreach_angles: research.outreach_angles || [],
        recent_news: research.recent_news || [],
      };
    }

    await supabase
      .from("target_accounts")
      .update(updates)
      .eq("id", account_id);

    // Insert any recent news as triggers
    if (research.recent_news && research.recent_news.length > 0) {
      const triggerRows = research.recent_news.slice(0, 5).map((news: string) => ({
        account_id,
        trigger_type: "content_published" as const,
        trigger_detail: news,
        relevance_score: 5,
      }));
      await supabase.from("account_triggers").insert(triggerRows);
    }

    return Response.json({ account_id, research, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Research failed";
    console.error("[ABM Research]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
