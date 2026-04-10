import { NextResponse } from "next/server";
import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ changelogs: [] });

  const { data, error } = await supabase
    .from("docs_changelogs")
    .select("*")
    .order("release_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changelogs: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  if (body.generate && body.update_description) {
    // AI generates changelog + finds affected articles
    const claude = getClaudeClient();

    // Get all published articles to scan for affected ones
    const { data: articles } = await supabase
      .from("docs_articles")
      .select("id, title, product_area, content_markdown")
      .eq("status", "published")
      .limit(100);

    const articleList = (articles || []).map((a, i) =>
      `${i + 1}. [${a.id}] "${a.title}" (${a.product_area || "general"})\n${(a.content_markdown || "").slice(0, 200)}`
    ).join("\n");

    const { blocks } = await buildSystemBlocks({
      additionalContext: `You are a product documentation specialist. Generate a customer-facing changelog entry and identify affected articles.

Return JSON:
{
  "title": "changelog title in plain language",
  "summary": "1-2 sentence summary for customers",
  "details_markdown": "full changelog in markdown, written for customers not developers",
  "affected_article_ids": ["article-id-1", "article-id-2"],
  "update_recommendations": [
    { "article_id": "...", "article_title": "...", "what_to_change": "specific edit needed", "why": "reason" }
  ]
}`,
    });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      messages: [{
        role: "user",
        content: `Product update:\n${body.update_description}\n\nVersion: ${body.version || "N/A"}\n\nExisting help articles to scan for impact:\n${articleList}`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      const { data } = await supabase.from("docs_changelogs").insert({
        version: body.version || null,
        title: result.title,
        summary: result.summary,
        details_markdown: result.details_markdown,
        affected_articles: result.affected_article_ids || [],
        update_status: "drafted",
      }).select().single();

      // Flag affected articles as outdated
      if (result.affected_article_ids && result.affected_article_ids.length > 0) {
        await supabase.from("docs_articles")
          .update({ status: "outdated", updated_at: new Date().toISOString() })
          .in("id", result.affected_article_ids);
      }

      return NextResponse.json({
        changelog: data,
        update_recommendations: result.update_recommendations || [],
        affected_count: (result.affected_article_ids || []).length,
        parsed: true,
      });
    } catch {
      return NextResponse.json({ raw: rawText, parsed: false });
    }
  }

  // Manual changelog creation
  const { data, error } = await supabase.from("docs_changelogs").insert({
    version: body.version || null,
    title: body.title,
    summary: body.summary || null,
    details_markdown: body.details_markdown || null,
    update_status: "drafted",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changelog: data });
}
