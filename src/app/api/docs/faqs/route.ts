import { NextResponse } from "next/server";
import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ faqs: [] });

  const { data, error } = await supabase
    .from("docs_faqs")
    .select("*, docs_categories(name)")
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faqs: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Generate FAQs from existing articles
  if (body.generate_from === "articles") {
    const { data: articles } = await supabase
      .from("docs_articles")
      .select("id, title, content_markdown, category_id, product_area")
      .eq("status", "published")
      .limit(50);

    if (!articles || articles.length === 0) {
      return NextResponse.json({ error: "No published articles to generate FAQs from" }, { status: 400 });
    }

    const claude = getClaudeClient();
    const articleSummaries = articles.map((a, i) =>
      `${i + 1}. ${a.title}\n${(a.content_markdown || "").slice(0, 500)}`
    ).join("\n\n");

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [{ type: "text", text: `Generate FAQ entries from these help articles. Each FAQ should be a common question a customer would ask, with a clear concise answer. Return JSON: { "faqs": [{ "question": "...", "answer": "...", "category_id": "if available" }] }` }],
      messages: [{ role: "user", content: articleSummaries }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const result = JSON.parse(cleaned);

      if (result.faqs) {
        const faqRows = result.faqs.map((f: { question: string; answer: string }, i: number) => {
          const schemaMarkup = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer },
          });
          return {
            question: f.question,
            answer: f.answer,
            source_type: "faq_generated",
            schema_markup: schemaMarkup,
            display_order: i,
            status: "draft",
          };
        });

        const { data } = await supabase.from("docs_faqs").insert(faqRows).select();
        return NextResponse.json({ faqs: data, generated: (data || []).length });
      }
    } catch {
      return NextResponse.json({ raw: rawText, parsed: false });
    }
  }

  // Manual FAQ creation
  if (body.question && body.answer) {
    const schemaMarkup = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Question",
      "name": body.question,
      "acceptedAnswer": { "@type": "Answer", "text": body.answer },
    });

    const { data, error } = await supabase
      .from("docs_faqs")
      .insert({
        question: body.question,
        answer: body.answer,
        category_id: body.category_id || null,
        source_type: "manual",
        schema_markup: schemaMarkup,
        status: "draft",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ faq: data });
  }

  // Update existing FAQ
  if (body.id && body.status) {
    const { data, error } = await supabase
      .from("docs_faqs")
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ faq: data });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
