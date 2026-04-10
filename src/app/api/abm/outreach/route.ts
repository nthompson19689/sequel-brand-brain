import { getClaudeClient } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/brand-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const OUTREACH_PROMPT = `You are an expert ABM outreach strategist. Generate personalized outreach content for a target account.

You MUST use the brand voice and guidelines from the Brand Brain context above. All content must sound like it comes from this brand — not generic AI copy.

Generate THREE types of content and return as JSON:

{
  "email_sequence": [
    {"subject": "...", "body": "...", "send_after_days": 0, "purpose": "intro"},
    {"subject": "...", "body": "...", "send_after_days": 3, "purpose": "value_prop"},
    {"subject": "...", "body": "...", "send_after_days": 7, "purpose": "breakup"}
  ],
  "one_pager": "markdown string — their problem, our solution, proof points, suggested next step",
  "linkedin_notes": [
    {"contact_name": "...", "contact_title": "...", "note": "...connection request message..."}
  ]
}

Rules:
- Emails should be concise (under 150 words each), personalized to the account's situation
- Reference specific things about THEIR business — don't be generic
- The one-pager should be scannable in 60 seconds
- LinkedIn notes should be under 300 characters (LinkedIn's limit)
- Use the brand's tone and vocabulary from the Brand Brain docs
- Reference relevant case studies or proof points from the Brand Brain if available`;

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  const { account_id } = await request.json();
  if (!account_id) return Response.json({ error: "account_id required" }, { status: 400 });

  // Load account data
  const { data: account, error: acctErr } = await supabase
    .from("target_accounts")
    .select("*")
    .eq("id", account_id)
    .single();

  if (acctErr || !account) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  // Load recent triggers
  const { data: triggers } = await supabase
    .from("account_triggers")
    .select("trigger_type, trigger_detail, relevance_score")
    .eq("account_id", account_id)
    .order("relevance_score", { ascending: false })
    .limit(10);

  // Build context with brand voice
  const accountContext = `
=== TARGET ACCOUNT ===
Company: ${account.company_name}
Domain: ${account.domain}
Industry: ${account.industry || "Unknown"}
Size: ${account.employee_count || "Unknown"}
Funding: ${account.funding_stage || "Unknown"}

Account Brief:
${account.account_brief || "No brief available — research this account first."}

Key Contacts:
${JSON.stringify(account.key_contacts || [], null, 2)}

Tech Stack: ${JSON.stringify(account.tech_stack || [])}

Recent Triggers:
${(triggers || []).map((t: { trigger_type: string; trigger_detail: string }) => `- [${t.trigger_type}] ${t.trigger_detail}`).join("\n") || "None"}

Pain Points & Angles:
${JSON.stringify(account.triggers || {})}
`;

  const additionalContext = OUTREACH_PROMPT + "\n\n" + accountContext;

  try {
    const claude = getClaudeClient();
    const { blocks } = await buildSystemBlocks({ additionalContext });

    const response = await claude.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: blocks,
      messages: [{
        role: "user",
        content: `Generate personalized outreach content for ${account.company_name} (${account.domain}). Use our brand voice from the Brand Brain. Reference their specific situation and pain points.`,
      }],
    });

    let rawText = "";
    for (const block of response.content) {
      if (block.type === "text") rawText += block.text;
    }

    // Parse the outreach content
    let outreach;
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      outreach = JSON.parse(cleaned);
    } catch {
      return Response.json({ account_id, raw: rawText, parsed: false });
    }

    // Save each content type to abm_content
    const contentRows = [];

    if (outreach.email_sequence) {
      contentRows.push({
        account_id,
        content_type: "email_sequence",
        content: outreach.email_sequence,
        status: "draft",
      });
    }

    if (outreach.one_pager) {
      contentRows.push({
        account_id,
        content_type: "one_pager",
        content: { markdown: outreach.one_pager },
        status: "draft",
      });
    }

    if (outreach.linkedin_notes) {
      contentRows.push({
        account_id,
        content_type: "linkedin_note",
        content: outreach.linkedin_notes,
        status: "draft",
      });
    }

    if (contentRows.length > 0) {
      await supabase.from("abm_content").insert(contentRows);
    }

    return Response.json({ account_id, outreach, parsed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Outreach generation failed";
    console.error("[ABM Outreach]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
