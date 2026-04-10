import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/abm/accounts/[id] — single account with triggers + content + engagement */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [accountRes, triggersRes, contentRes, engagementRes] = await Promise.all([
    supabase.from("target_accounts").select("*").eq("id", id).single(),
    supabase.from("account_triggers").select("*").eq("account_id", id).order("detected_at", { ascending: false }).limit(50),
    supabase.from("abm_content").select("*").eq("account_id", id).order("created_at", { ascending: false }),
    supabase.from("account_engagement").select("*").eq("account_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);

  if (accountRes.error) return NextResponse.json({ error: accountRes.error.message }, { status: 404 });

  return NextResponse.json({
    account: accountRes.data,
    triggers: triggersRes.data || [],
    content: contentRes.data || [],
    engagement: engagementRes.data || [],
  });
}

/** PATCH /api/abm/accounts/[id] — update account fields */
export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const allowedFields = [
    "company_name", "domain", "industry", "employee_count", "funding_stage",
    "key_contacts", "tech_stack", "account_status", "priority_score",
    "account_brief", "triggers",
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  const { data, error } = await supabase
    .from("target_accounts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

/** DELETE /api/abm/accounts/[id] */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { error } = await supabase.from("target_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
