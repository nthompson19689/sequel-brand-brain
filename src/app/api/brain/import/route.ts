import { getSupabaseServerClient } from "@/lib/supabase";
import { embedAndStore } from "@/lib/embeddings";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/brain/import — Import pages by fetching their content.
 * Accepts { urls: string[] }, fetches each, strips HTML, saves to articles table.
 * Streams progress events back via SSE.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { urls } = (await request.json()) as { urls: string[] };

  if (!urls || urls.length === 0) {
    return Response.json({ error: "No URLs provided" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      let imported = 0;
      let failed = 0;
      let skipped = 0;
      const categoryCounts: Record<string, number> = {};

      for (let i = 0; i < urls.length; i++) {
        const pageUrl = urls[i];

        send({
          type: "progress",
          current: i + 1,
          total: urls.length,
          url: pageUrl,
        });

        try {
          // Check if already imported
          const { data: existing } = await supabase
            .from("articles")
            .select("id")
            .eq("url", pageUrl)
            .limit(1);

          if (existing && existing.length > 0) {
            skipped++;
            send({
              type: "skip",
              url: pageUrl,
              reason: "Already imported",
            });
            continue;
          }

          // Fetch the page
          const pageRes = await fetch(pageUrl, {
            headers: { "User-Agent": "SequelBrandBrain/1.0" },
            signal: AbortSignal.timeout(15000),
          });

          if (!pageRes.ok) {
            failed++;
            send({ type: "fail", url: pageUrl, reason: `HTTP ${pageRes.status}` });
            continue;
          }

          const html = await pageRes.text();

          // Extract title
          const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
          const ogTitleMatch = html.match(
            /<meta\s+(?:property|name)="og:title"\s+content="(.*?)"/i
          );
          const title =
            ogTitleMatch?.[1] || titleMatch?.[1] || new URL(pageUrl).pathname;

          // Extract meta description
          const metaDescMatch = html.match(
            /<meta\s+name="description"\s+content="(.*?)"/i
          );
          const metaDesc = metaDescMatch?.[1] || null;

          // Strip HTML to get clean text
          const fullText = stripHtml(html);

          if (fullText.length < 100) {
            skipped++;
            send({
              type: "skip",
              url: pageUrl,
              reason: "Too little content (< 100 chars)",
            });
            continue;
          }

          // Detect content_type from URL
          const path = new URL(pageUrl).pathname.toLowerCase();
          let category = "other";
          if (path.includes("/blog") || path.includes("/article") || path.includes("/post") || path.includes("/news")) {
            category = "blog";
          } else if (path.includes("/case-stud") || path.includes("/customer-stor") || path.includes("/success")) {
            category = "case_study";
          } else if (path.includes("/product") || path.includes("/feature") || path.includes("/solution") || path.includes("/platform")) {
            category = "product_page";
          }

          // Generate slug from URL path
          const slug = new URL(pageUrl).pathname
            .replace(/^\/|\/$/g, "")
            .replace(/\//g, "-");

          // Save to articles table
          const row: Record<string, unknown> = {
            title: decodeHtmlEntities(title).slice(0, 500),
            url: pageUrl,
            slug,
            full_text: fullText,
            meta_description: metaDesc
              ? decodeHtmlEntities(metaDesc).slice(0, 500)
              : null,
            primary_keyword: category === "blog" ? null : category,
            word_count: fullText.split(/\s+/).length,
            status: "published",
            content_type: category,
          };
          const { data: inserted, error: insertErr } = await supabase
            .from("articles")
            .insert(row)
            .select("id")
            .single();

          if (insertErr) {
            failed++;
            send({ type: "fail", url: pageUrl, reason: insertErr.message });
          } else {
            imported++;
            if (inserted?.id) {
              void embedAndStore({
                supabase,
                table: "articles",
                id: inserted.id,
                text: `${row.title}\n\n${fullText}`,
              });
            }
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
            send({
              type: "imported",
              url: pageUrl,
              title: decodeHtmlEntities(title).slice(0, 100),
              category,
              wordCount: fullText.split(/\s+/).length,
            });
          }
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : "Unknown error";
          send({ type: "fail", url: pageUrl, reason: msg });
        }
      }

      send({
        type: "complete",
        imported,
        failed,
        skipped,
        categories: categoryCounts,
      });

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Strip HTML tags and get readable text */
function stripHtml(html: string): string {
  // Remove script, style, nav, footer, header, aside tags and their content
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Try to get just the main/article content
  const mainMatch = text.match(
    /<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i
  );
  if (mainMatch) {
    text = mainMatch[1];
  }

  // Replace block-level tags with newlines
  text = text
    .replace(/<\/?(p|div|h[1-6]|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return decodeHtmlEntities(text);
}

/** Decode common HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C");
}
