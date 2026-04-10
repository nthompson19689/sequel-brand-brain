import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const RESEARCH_PROMPT = `You are a senior sales research analyst preparing a prospect briefing for an outbound rep.

Your research must find SPECIFIC, ACTIONABLE intelligence — not generic company facts. Think like a rep who needs to write a message that gets a reply.

Research these layers:
1. THE PERSON — Search for their LinkedIn posts, articles, podcast appearances, conference talks, opinions they've shared publicly. Find something specific and human to reference.
2. THE COMPANY — Website, about page, careers page (what are they hiring for? → infer priorities), blog, press releases, recent news.
3. ROLE-SPECIFIC PAINS — What does someone with this title at this type/size of company typically struggle with?
4. TIMING TRIGGERS — New hire announcements, funding, leadership changes, product launches, rapid hiring = urgency signals.
5. TECH STACK — Infer from website source, job postings, G2/BuiltWith signals.
6. PERSONAL HOOK — The ONE thing you'd lead with in a cold email to show you actually looked at them as a person.

Return ONLY valid JSON:
{
  "company_summary": "2-3 sentences on what the company does and who they serve",
  "role_analysis": "2-3 sentences on what this person likely cares about given their title and company stage",
  "recent_activity": ["specific LinkedIn post or article they wrote", "conference talk", "podcast appearance"],
  "pain_points": ["role-specific pain 1", "company-stage pain 2", "timing-based pain 3"],
  "personal_hooks": ["specific thing about THEM — a post, opinion, career move, mutual connection"],
  "tech_stack_signals": ["tool1", "tool2"],
  "timing_triggers": ["trigger 1 with date", "trigger 2"],
  "recommended_opening": "The exact first 2 sentences you'd write in a cold email to this person",
  "recommended_product_angle": "Which specific value prop to lead with and why",
  "relevant_proof_points": ["case study or stat that would resonate with them"]
}`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { prospect_id } = await request.json();
  if (!prospect_id) return Response.json({ error: "prospect_id required" }, { status: 400 });

  // Load prospect
  const { data: prospect, error: pErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (pErr || !prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  try {
    const claude = getClaudeClient();

    // Pull brand context so research understands what WE sell (for value prop matching)
    const { blocks } = await buildSystemBlocks({
      additionalContext: RESEARCH_PROMPT,
    });

    const searchQueries = [
      `${prospect.first_name} ${prospect.last_name} ${prospect.company_name || ""} LinkedIn`,
      `${prospect.company_domain || prospect.company_name} company overview`,
      `${prospect.company_domain || prospect.company_name} news funding`,
      `${prospect.company_domain || prospect.company_name} careers hiring`,
    ].filter(Boolean);

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      messages: [{
        role: "user",
        content: `Research this prospect for outbound sales:

Name: ${prospect.first_name} ${prospect.last_name}
Title: ${prospect.title || "Unknown"}
Company: ${prospect.company_name || "Unknown"}
Domain: ${prospect.company_domain || "Unknown"}
LinkedIn: ${prospect.linkedin_url || "Not provided"}
Seniority: ${prospect.seniority_level || "Unknown"}
Industry: ${prospect.industry || "Unknown"}

Search for:
${searchQueries.map((q, i) => `${i + 1}. "${q}"`).join("\n")}

Then match their pain points against OUR product value props from the Brand Brain above. What should we lead with?

Return the structured JSON as specified.`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let research;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      research = JSON.parse(cleaned);
    } catch {
      // Save raw text if JSON fails
      await supabase.from("prospect_research").upsert({
        prospect_id,
        company_summary: rawText,
        researched_at: new Date().toISOString(),
      }, { onConflict: "prospect_id" });

      return Response.json({ prospect_id, raw: rawText, parsed: false });
    }

    // Upsert research record
    await supabase.from("prospect_research").upsert({
      prospect_id,
      company_summary: research.company_summary || null,
      role_analysis: research.role_analysis || null,
      recent_activity: research.recent_activity || [],
      pain_points: research.pain_points || [],
      personal_hooks: research.personal_hooks || [],
      tech_stack_signals: research.tech_stack_signals || [],
      timing_triggers: research.timing_triggers || [],
      recommended_opening: research.recommended_opening || null,
      recommended_product_angle: research.recommended_product_angle || null,
      relevant_proof_points: research.relevant_proof_points || [],
      researched_at: new Date().toISOString(),
    }, { onConflict: "prospect_id" });

    // Update prospect tech_stack if found
    if (research.tech_stack_signals && research.tech_stack_signals.length > 0) {
      await supabase.from("prospects").update({
        tech_stack: research.tech_stack_signals,
        updated_at: new Date().toISOString(),
      }).eq("id", prospect_id);
    }

    return Response.json({ prospect_id, research, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Research failed";
    console.error("[Outbound Research]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
