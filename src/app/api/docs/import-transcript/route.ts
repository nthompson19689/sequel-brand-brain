import { getClaudeClient } from "@/lib/claude";
import { WRITER_SYSTEM_PROMPT } from "@/lib/content/writer-prompt";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const ANALYZE_PROMPT = `You are a documentation specialist analyzing a support/onboarding/training transcript to generate help articles.

Your process:
1. Identify every distinct question, problem, or topic the customer raised
2. For each topic, generate a complete help article
3. Flag any topics where existing documentation might need updating

RULES for each generated article:
- Title must be a task or question (e.g., "How to connect your CRM" not "CRM Integration")
- Include a one-sentence summary of what the reader will learn
- Step-by-step instructions with numbered steps, each step = one single action
- Include a "Common issues" section based on confusion or mistakes from the transcript
- Mark where screenshots would help as [SCREENSHOT: description of what to capture]
- Use product terminology from the Brand Brain context above

Return ONLY valid JSON:
{
  "articles": [
    {
      "title": "How to...",
      "excerpt": "one sentence summary",
      "content_markdown": "full article in markdown with ## headings, numbered steps, common issues section",
      "product_area": "which feature this relates to",
      "difficulty_level": "beginner|intermediate|advanced",
      "search_keywords": ["keyword1", "keyword2"],
      "screenshot_placeholders": ["description 1", "description 2"]
    }
  ],
  "update_recommendations": [
    {
      "topic": "what needs updating",
      "reason": "why it needs updating based on what the transcript revealed",
      "suggested_edit": "specific change to make"
    }
  ],
  "gaps_identified": [
    "topic that should have documentation but doesn't"
  ],
  "sentiment_signals": {
    "frustrated_topics": ["topic where customer showed frustration"],
    "confused_topics": ["topic where customer was confused"],
    "positive_topics": ["topic where customer was satisfied"]
  }
}`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  if (!body.transcript_text) return Response.json({ error: "transcript_text required" }, { status: 400 });

  // Create import record
  const { data: importRecord, error: impErr } = await supabase
    .from("docs_transcript_imports")
    .insert({
      transcript_text: body.transcript_text,
      transcript_source: body.transcript_source || "support_call",
      customer_name: body.customer_name || null,
      customer_company: body.customer_company || null,
      import_status: "processing",
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (impErr) return Response.json({ error: impErr.message }, { status: 500 });

  try {
    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({
      additionalContext: WRITER_SYSTEM_PROMPT + "\n\n" + ANALYZE_PROMPT,
    });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: blocks,
      messages: [{
        role: "user",
        content: `Analyze this ${body.transcript_source || "support call"} transcript and generate help articles:\n\n${body.transcript_text}`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    let result;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      await supabase.from("docs_transcript_imports").update({
        import_status: "review",
        gaps_identified: [{ raw_output: rawText }],
      }).eq("id", importRecord.id);
      return Response.json({ import_id: importRecord.id, raw: rawText, parsed: false });
    }

    // Create articles
    let articlesCreated = 0;
    if (result.articles && result.articles.length > 0) {
      const articleRows = result.articles.map((a: { title: string; excerpt: string; content_markdown: string; product_area: string; difficulty_level: string; search_keywords: string[] }) => {
        const slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
        return {
          title: a.title,
          slug,
          content_markdown: a.content_markdown,
          excerpt: a.excerpt || a.content_markdown.slice(0, 150),
          source_type: "transcript",
          source_id: importRecord.id,
          status: "review",
          product_area: a.product_area || null,
          difficulty_level: a.difficulty_level || "beginner",
          search_keywords: a.search_keywords || [],
          created_by: body.created_by || "system",
        };
      });

      const { data: created } = await supabase.from("docs_articles").insert(articleRows).select();
      articlesCreated = (created || []).length;
    }

    // Update import record
    await supabase.from("docs_transcript_imports").update({
      articles_generated: articlesCreated,
      articles_updated: (result.update_recommendations || []).length,
      gaps_identified: result.gaps_identified || [],
      import_status: "review",
    }).eq("id", importRecord.id);

    return Response.json({
      import_id: importRecord.id,
      articles_generated: articlesCreated,
      update_recommendations: result.update_recommendations || [],
      gaps_identified: result.gaps_identified || [],
      sentiment: result.sentiment_signals || {},
      parsed: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    console.error("[Docs Import]", msg);
    await supabase.from("docs_transcript_imports").update({ import_status: "review" }).eq("id", importRecord.id);
    return Response.json({ error: msg }, { status: 500 });
  }
}
