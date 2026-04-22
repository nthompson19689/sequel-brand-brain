import { getClaudeClient } from "@/lib/claude";
import { WRITER_SYSTEM_PROMPT } from "@/lib/content/writer-prompt";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks, getArticleLinkReference } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 300;

// ── Prompts ──────────────────────────────────────────────────────────────────

const BLOG_PROMPT = `Write a 1,500-2,500 word thought leadership blog post from the transcript quotes and themes provided.

RULES:
- Pull the brand voice and writing guidelines from the Brand Brain context above
- Use direct quotes as blockquotes with speaker attribution — these are the backbone of the piece
- Structure around key themes, NOT chronologically through the transcript
- Write original connective tissue, context, and analysis BETWEEN quotes — add value beyond "here's what they said"
- Open with a compelling intro framing why this topic matters RIGHT NOW
- Close with a clear takeaway or call to action
- Weave in relevant internal links from the link reference provided (3-5 links minimum)
- Generate: meta_title (<60 chars), meta_description (<155 chars), tags (3-5)
- Generate 2-3 FAQ schema suggestions based on questions addressed in the transcript

Return JSON:
{
  "title": "blog post title",
  "body": "full markdown blog post with blockquotes for quotes",
  "meta_title": "SEO title",
  "meta_description": "SEO description",
  "tags": ["tag1", "tag2"],
  "faqs": [{"question": "...", "answer": "..."}]
}`;

const NEWSLETTER_PROMPT = `Write a 600-1,000 word newsletter edition from the transcript quotes and themes.

RULES:
- Pull brand voice from the Brand Brain
- Open with a 2-3 sentence editorial hook — why should the reader care NOW
- Use 3-5 of the STRONGEST quotes, each followed by a "Why this matters" insight (1-2 sentences)
- Sound like a smart friend sending highlights, not a company promoting content
- End with a link to the full blog post placeholder
- Format for scanning: short paragraphs, bold key phrases, clear structure
- Generate a subject line: specific, curiosity-driven, not generic

Return JSON:
{
  "title": "newsletter subject line",
  "body": "full newsletter in markdown"
}`;

const LINKEDIN_BLOG_PROMPT = `Write a LinkedIn post (150-250 words) promoting the blog post.

RULES:
- First line MUST stop the scroll: surprising quote, contrarian take, or specific stat
- 3-4 key insights as short punchy lines with → arrows
- One standalone direct quote from the speaker
- Clear CTA: "Full post in comments" or "Link in comments"
- NO inline hashtags — add 5-7 relevant hashtags in a single row at the very end after a line break
- Sound like a human sharing something valuable, NOT a brand promoting content

Return JSON:
{
  "title": "LinkedIn post",
  "body": "the post text with hashtags at the end"
}`;

const LINKEDIN_NEWSLETTER_PROMPT = `Write a LinkedIn post (100-200 words) promoting the newsletter edition.

RULES:
- Tease the content without giving away all insights
- Pull one compelling quote from the newsletter
- Create FOMO: "This week's edition covers..." framing
- CTA to subscribe or read with link placeholder
- 5-7 hashtags at the very end after a line break, NOT inline
- Shorter and punchier than the blog promo

Return JSON:
{
  "title": "LinkedIn newsletter promo",
  "body": "the post text"
}`;

const PROMPTS: Record<string, string> = {
  blog_post: BLOG_PROMPT,
  newsletter: NEWSLETTER_PROMPT,
  linkedin_blog_promo: LINKEDIN_BLOG_PROMPT,
  linkedin_newsletter_promo: LINKEDIN_NEWSLETTER_PROMPT,
};

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { source_id, output_types } = await request.json();
  if (!source_id || !Array.isArray(output_types) || output_types.length === 0) {
    return Response.json({ error: "source_id and output_types[] required" }, { status: 400 });
  }

  // Load source
  const { data: source, error: srcErr } = await supabase
    .from("studio_sources")
    .select("*")
    .eq("id", source_id)
    .single();

  if (srcErr || !source) return Response.json({ error: "Source not found" }, { status: 404 });

  const sourceContext = `
=== SOURCE MATERIAL ===
Speaker: ${source.speaker_name || "Unknown"} (${source.speaker_title || ""} at ${source.speaker_company || ""})
Topic: ${source.topic_summary || "See transcript"}

Key Themes:
${JSON.stringify(source.key_themes || [], null, 2)}

Key Quotes:
${(source.key_quotes || []).map((q: { quote: string; topic_tag?: string }, i: number) =>
  `${i + 1}. "${q.quote}" [${q.topic_tag || "general"}]`
).join("\n")}

Full Transcript:
${source.raw_transcript}
`;

  const claude = getClaudeClient();
  const results: Array<{ output_type: string; title: string; body: string }> = [];

  // Generate each output type sequentially (they can reference each other)
  for (const outputType of output_types) {
    const prompt = PROMPTS[outputType];
    if (!prompt) continue;

    try {
      // Blog post gets internal links, others don't need them
      const includeArticleRef = outputType === "blog_post";
      const articleRef = includeArticleRef ? await getArticleLinkReference() : "";
      const additionalContext = prompt + "\n\n" + sourceContext +
        (articleRef ? `\n\n${articleRef}` : "") +
        (results.length > 0 ? `\n\n=== PREVIOUSLY GENERATED ===\n${results.map((r) => `[${r.output_type}] ${r.title}`).join("\n")}` : "");

      const { blocks } = await buildSystemBlocks({
        includeWritingStandards: outputType === "blog_post",
        additionalContext,
      });

      const response = await claude.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: outputType === "blog_post" ? 8192 : 4096,
        system: blocks,
        messages: [{
          role: "user",
          content: `Generate a ${outputType.replace(/_/g, " ")} from the source material above. Use the brand voice. ${
            outputType === "blog_post" ? "Include internal links from the link reference." :
            outputType === "newsletter" ? "Reference the blog post at the end." :
            outputType === "linkedin_blog_promo" ? "This promotes the blog post." :
            "This promotes the newsletter edition."
          }`,
        }],
      });

      let rawText = "";
      for (const block of response.content) {
        if (block.type === "text") rawText += block.text;
      }

      let parsed;
      try {
        const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { title: outputType.replace(/_/g, " "), body: rawText };
      }

      results.push({
        output_type: outputType,
        title: parsed.title || outputType,
        body: typeof parsed.body === "string" ? parsed.body : JSON.stringify(parsed, null, 2),
      });
    } catch (err) {
      console.error(`[Studio Generate] ${outputType} failed:`, err);
      results.push({
        output_type: outputType,
        title: `${outputType} (failed)`,
        body: `Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  // Save all outputs
  if (results.length > 0) {
    const rows = results.map((r) => ({
      source_id,
      output_type: r.output_type,
      title: r.title,
      body: r.body,
      status: "draft",
    }));

    await supabase.from("studio_outputs").insert(rows);
  }

  return Response.json({ source_id, outputs: results, count: results.length });
}
