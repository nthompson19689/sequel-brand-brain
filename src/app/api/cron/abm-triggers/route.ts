import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRIGGER_PROMPT = `You are an ABM trigger detection agent. For the given company, search for recent signals that indicate they may be ready to buy or that something noteworthy happened.

Look for:
1. Funding announcements (Series A/B/C, raised money)
2. Leadership changes (new CMO, VP Marketing, CRO, etc.)
3. Job postings related to marketing, growth, content, or the product category
4. Product launches or major feature releases
5. Competitor mentions (using or switching tools)
6. Content published (blog posts, case studies, press releases)
7. Event attendance or speaking engagements

For each signal found, return JSON:
{
  "triggers": [
    {
      "type": "funding|leadership_change|job_posting|competitor_mention|product_launch|content_published|event_attendance",
      "detail": "one-sentence description of what was found",
      "relevance_score": 1-10
    }
  ]
}

Score relevance based on how actionable the signal is for a B2B SaaS sales/marketing outreach.
7+ = high priority, worth acting on immediately.
4-6 = noteworthy, worth monitoring.
1-3 = low priority, informational only.

If no recent signals found, return: { "triggers": [] }
Only include signals from the last 30 days.`;

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron or logged-in user
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Fall back to session auth for manual triggers
    const { createSupabaseServerAuthClient } = await import("@/lib/supabase-auth-server");
    const authClient = createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  // Get accounts in monitoring or engaging status
  const { data: accounts, error } = await supabase
    .from("target_accounts")
    .select("id, company_name, domain")
    .in("account_status", ["monitoring", "engaging"]);

  if (error || !accounts || accounts.length === 0) {
    return Response.json({ message: "No accounts to scan", scanned: 0 });
  }

  const claude = getClaudeClient();
  let totalTriggers = 0;

  // Process in batches of 5
  for (let i = 0; i < accounts.length; i += 5) {
    const batch = accounts.slice(i, i + 5);

    const results = await Promise.allSettled(
      batch.map(async (account) => {
        try {
          const response = await claude.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2048,
            system: [{ type: "text", text: TRIGGER_PROMPT }],
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
            messages: [{
              role: "user",
              content: `Search for recent signals and triggers for: ${account.company_name} (${account.domain}). Focus on the last 30 days.`,
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
            return { account_id: account.id, triggers: 0 };
          }

          if (parsed.triggers && parsed.triggers.length > 0) {
            const rows = parsed.triggers.map((t: { type: string; detail: string; relevance_score: number }) => ({
              account_id: account.id,
              trigger_type: t.type,
              trigger_detail: t.detail,
              relevance_score: Math.min(10, Math.max(1, t.relevance_score || 5)),
            }));

            await supabase.from("account_triggers").insert(rows);

            // Future: If any trigger scores 7+, send Slack notification
            // const highPriority = rows.filter(r => r.relevance_score >= 7);
            // if (highPriority.length > 0 && slack_webhook_url) { ... }

            return { account_id: account.id, triggers: rows.length };
          }

          return { account_id: account.id, triggers: 0 };
        } catch (err) {
          console.warn(`[ABM Triggers] Failed for ${account.domain}:`, err);
          return { account_id: account.id, triggers: 0, error: true };
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") totalTriggers += r.value.triggers;
    }
  }

  return Response.json({
    message: `Scanned ${accounts.length} accounts, found ${totalTriggers} triggers`,
    scanned: accounts.length,
    triggers_found: totalTriggers,
  });
}
