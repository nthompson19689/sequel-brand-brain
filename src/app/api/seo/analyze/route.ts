import { getClaudeClient, resolveModel } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a senior SEO analyst reviewing a B2B SaaS content dashboard. Return a prioritized action plan — not observations. Every item must include: what to do, which page, and why.

Analyze using these lenses in order:

1. QUICK WINS — Pages ranking positions 4–15 with high impressions. Recommend whether the fix is content depth, internal linking, title/meta rewrite, or backlinks.

2. CTR GAPS — Compare each page's CTR against expected benchmarks (position 1–3: expect 15–30%, position 4–7: expect 5–12%, position 8–15: expect 2–5%). Flag pages significantly below their expected range. Suggest specific title/meta changes.

3. CONTENT DECAY — Compare current period vs prior period. Flag pages where clicks dropped 20%+ or position worsened by 3+ spots. Recommend refresh, consolidate, or redirect.

4. ENGAGEMENT MISMATCHES — Pages with strong clicks but low engagement rate or high bounce rate from GA4. This signals intent mismatch — the page ranks but doesn't deliver what the searcher expected. Recommend content restructuring.

5. AUTHORITY GAPS — Pages with low UR compared to their position potential. If Ahrefs data is missing, say so and skip.

6. CONVERSION GAPS — Pages with high sessions but zero conversions. Identify whether the issue is likely missing CTAs, wrong intent match, or poor page experience. Recommend specific conversion optimization actions.

7. NEW VS RETURNING ANALYSIS — If returning visitor percentage is high on certain pages but conversions are low, flag potential nurture or retargeting opportunities. If new visitor percentage is high but engagement is low, flag potential intent mismatch.

8. FUNNEL LEAKS — Identify pages where users arrive from organic search but don't progress toward conversion. Look for high-traffic pages with low engagement rates and zero conversions as priority fixes.

Format: Group actions into Do This Week / Do This Month / Monitor. Each action is one sentence: [ACTION] + [PAGE] + [REASON]. Max 15 actions now that we have fuller data. Force-rank. Do not explain SEO basics. The reader is a content marketer who knows the fundamentals.`;

export async function POST(request: Request) {
  try {
    const { pages } = await request.json();

    if (!Array.isArray(pages) || pages.length === 0) {
      return Response.json({ error: "pages array is required" }, { status: 400 });
    }

    const claude = getClaudeClient();

    const response = await claude.messages.create({
      model: resolveModel("claude-sonnet-4-6"),
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      messages: [{
        role: "user",
        content: `Analyze this SEO dashboard data and provide a prioritized action plan.\n\nDashboard data (${pages.length} pages):\n${JSON.stringify(pages, null, 2)}`,
      }],
    });

    let analysis = "";
    for (const block of response.content) {
      if (block.type === "text") analysis += block.text;
    }

    return Response.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("SEO analyze error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
