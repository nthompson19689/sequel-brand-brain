import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";
import { deepResearch } from "@/lib/perplexity";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPerplexityQueries(prospect: {
  first_name: string;
  last_name: string;
  company_name: string | null;
  company_domain: string | null;
  title: string | null;
  seniority_level: string | null;
  industry: string | null;
  employee_count: string | null;
}): string[] {
  const company = prospect.company_name || prospect.company_domain || "";
  if (!company) return [];

  const queries: string[] = [
    `${company} recent news funding announcements 2026`,
    `${company} product launches updates 2026`,
    `${company} leadership changes hiring`,
    `${company} tech stack tools they use`,
    `${company} competitors market position`,
  ];

  // Smart queries based on prospect role
  const titleLower = (prospect.title || "").toLowerCase();
  if (titleLower.includes("marketing") || titleLower.includes("cmo") || titleLower.includes("growth")) {
    queries.push(`${company} marketing strategy content approach`);
  }
  if (titleLower.includes("sales") || titleLower.includes("cro") || titleLower.includes("revenue")) {
    queries.push(`${company} sales process go-to-market strategy`);
  }
  if (titleLower.includes("product") || titleLower.includes("cpo") || titleLower.includes("engineering")) {
    queries.push(`${company} product roadmap engineering culture`);
  }

  // Smart queries based on company size
  const sizeStr = (prospect.employee_count || "").toLowerCase();
  const isSmall = sizeStr.includes("1-") || sizeStr.includes("10") || sizeStr.includes("50") || parseInt(sizeStr) < 50;
  if (isSmall) {
    queries.push(`${company} funding stage investors seed series`);
  }

  // Smart queries based on industry
  const industryLower = (prospect.industry || "").toLowerCase();
  if (industryLower.includes("saas") || industryLower.includes("software")) {
    queries.push(`${company} pricing model customers case studies`);
  }

  return queries;
}

async function logApiUsage(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  service: string,
  endpoint: string,
  tokensUsed: number,
  costEstimate: number,
  triggeredBy: string
) {
  if (!supabase) return;
  try {
    await supabase.from("api_usage_log").insert({
      service, endpoint, tokens_used: tokensUsed,
      cost_estimate: costEstimate, triggered_by: triggeredBy,
    });
  } catch { /* non-critical */ }
}

// ── Synthesis Prompt ─────────────────────────────────────────────────────────

const SYNTHESIS_PROMPT = `You are a senior sales research analyst synthesizing raw research data into a prospect brief.

CRITICAL RULES:
- Only include facts that appear in the source material provided below
- Tag EVERY claim with its source using these tags:
  [PERPLEXITY — query: "the query that found this"]
  [WEB — URL or description]
  [BRAND_BRAIN — article or doc title]
  [INFERRED — your reasoning]
- Do NOT generate statistics, case studies, or quotes that are not in the provided sources
- If a field cannot be filled from the available data, say "not found" rather than inferring
- Personal hooks must reference SPECIFIC content the prospect actually created

Return ONLY valid JSON:
{
  "company_summary": "2-3 sentences with source tags",
  "role_analysis": "2-3 sentences about what this person likely cares about [with source tags]",
  "recent_activity": ["specific finding [SOURCE_TAG]"],
  "pain_points": ["pain point [SOURCE_TAG]"],
  "personal_hooks": ["specific thing about THEM [SOURCE_TAG]"],
  "tech_stack_signals": ["tool [SOURCE_TAG]"],
  "timing_triggers": ["trigger with date [SOURCE_TAG]"],
  "recommended_opening": "The exact first 2 sentences for a cold email, referencing sourced facts",
  "recommended_product_angle": "Which value prop to lead with and why [SOURCE_TAG]",
  "relevant_proof_points": ["proof point from Brand Brain [SOURCE_TAG]"]
}`;

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { prospect_id, refresh } = await request.json();
  if (!prospect_id) return Response.json({ error: "prospect_id required" }, { status: 400 });

  // Load prospect
  const { data: prospect, error: pErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (pErr || !prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  // ── Freshness Check ────────────────────────────────────────────────────────
  // Skip Passes 1 & 2 if research exists from within the last 7 days (unless refresh=true)
  let existingSources: Array<{ query: string; source: string; raw_response: string; extracted_facts: unknown[] }> = [];
  let skipCollection = false;

  if (!refresh) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSources } = await supabase
      .from("prospect_research_sources")
      .select("query, source, raw_response, extracted_facts")
      .eq("prospect_id", prospect_id)
      .gte("retrieved_at", sevenDaysAgo);

    if (recentSources && recentSources.length >= 3) {
      existingSources = recentSources;
      skipCollection = true;
      console.log(`[Research] Using ${recentSources.length} cached sources for ${prospect.first_name} ${prospect.last_name} (< 7 days old)`);
    }
  }

  try {
    // ── PASS 1: Perplexity Company Deep Dive ─────────────────────────────────
    if (!skipCollection) {
      const queries = buildPerplexityQueries(prospect);
      console.log(`[Research] Pass 1: Running ${queries.length} Perplexity queries for ${prospect.company_name || prospect.company_domain}`);

      const perplexityResults: Array<{ query: string; content: string; citations: Array<{ url: string }> }> = [];

      // Run Perplexity queries (batch of 3 at a time)
      for (let i = 0; i < queries.length; i += 3) {
        const batch = queries.slice(i, i + 3);
        const results = await Promise.allSettled(
          batch.map(async (q) => {
            try {
              const result = await deepResearch(q, "Provide specific, factual information with dates and numbers. Be concise.");
              await logApiUsage(supabase, "perplexity", "sonar-pro", 4096, 0.005, "prospect_research");
              return { query: q, content: result.content, citations: result.citations };
            } catch (err) {
              console.warn(`[Research] Perplexity query failed: "${q}"`, err);
              return { query: q, content: "", citations: [] };
            }
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") perplexityResults.push(r.value);
        }

        // Small delay between batches
        if (i + 3 < queries.length) await new Promise(r => setTimeout(r, 500));
      }

      // Store Perplexity results
      const sourceRows = perplexityResults
        .filter(r => r.content)
        .map(r => ({
          prospect_id,
          query: r.query,
          source: "perplexity" as const,
          raw_response: r.content,
          extracted_facts: r.citations.map(c => c.url),
        }));

      if (sourceRows.length > 0) {
        await supabase.from("prospect_research_sources").insert(sourceRows);
      }

      // ── PASS 2: Web Search for the Individual ──────────────────────────────
      console.log(`[Research] Pass 2: Web search for ${prospect.first_name} ${prospect.last_name}`);

      const claude = getClaudeClient();
      const webSearchResponse = await claude.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: [{ type: "text", text: "Search for this person's recent public content, LinkedIn posts, articles, podcast appearances, and conference talks. Return a summary of what you found with specific details." }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{
          role: "user",
          content: `Find recent public content and activity for: ${prospect.first_name} ${prospect.last_name}, ${prospect.title || ""} at ${prospect.company_name || prospect.company_domain || ""}. LinkedIn: ${prospect.linkedin_url || "not provided"}`,
        }],
      });

      let webSearchText = "";
      for (const block of webSearchResponse.content) {
        if (block.type === "text") webSearchText += block.text;
      }

      await logApiUsage(supabase, "web_search", "claude-web-search", 2048, 0.003, "prospect_research");

      if (webSearchText) {
        await supabase.from("prospect_research_sources").insert({
          prospect_id,
          query: `${prospect.first_name} ${prospect.last_name} LinkedIn content activity`,
          source: "web_search",
          raw_response: webSearchText,
          extracted_facts: [],
        });
      }

      // Reload all sources for synthesis
      const { data: allSources } = await supabase
        .from("prospect_research_sources")
        .select("query, source, raw_response, extracted_facts")
        .eq("prospect_id", prospect_id)
        .order("retrieved_at", { ascending: false });

      existingSources = allSources || [];
    }

    // ── PASS 3: Claude Synthesis with Source Attribution ──────────────────────
    console.log(`[Research] Pass 3: Claude synthesis from ${existingSources.length} sources`);

    // Build source material block
    const sourceMaterial = existingSources.map((s, i) =>
      `--- SOURCE ${i + 1} [${s.source.toUpperCase()} — query: "${s.query}"] ---\n${s.raw_response || "No data returned"}`
    ).join("\n\n");

    // Pull Brand Brain context for value prop matching
    const { blocks } = await buildSystemBlocks({
      additionalContext: SYNTHESIS_PROMPT,
    });

    const claude = getClaudeClient();
    const synthesisResponse = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      messages: [{
        role: "user",
        content: `Synthesize research for this prospect. ONLY use facts from the source material below. Tag every claim.

PROSPECT:
Name: ${prospect.first_name} ${prospect.last_name}
Title: ${prospect.title || "Unknown"}
Company: ${prospect.company_name || "Unknown"}
Domain: ${prospect.company_domain || "Unknown"}
Seniority: ${prospect.seniority_level || "Unknown"}
Industry: ${prospect.industry || "Unknown"}
Company Size: ${prospect.employee_count || "Unknown"}

SOURCE MATERIAL (${existingSources.length} sources):

${sourceMaterial}

Match their pain points against OUR product value props from the Brand Brain above. Tag any Brand Brain matches as [BRAND_BRAIN — doc name].`,
      }],
    });

    await logApiUsage(supabase, "anthropic", "claude-sonnet-synthesis", 4096, 0.015, "prospect_research");

    let rawText = "";
    for (const block of synthesisResponse.content) {
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

      return Response.json({
        prospect_id,
        raw: rawText,
        sources_used: existingSources.length,
        from_cache: skipCollection,
        parsed: false,
      });
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

    return Response.json({
      prospect_id,
      research,
      sources_used: existingSources.length,
      from_cache: skipCollection,
      parsed: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Research failed";
    console.error("[Outbound Research]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
