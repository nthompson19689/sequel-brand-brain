import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [prospectRes, researchRes, messagesRes] = await Promise.all([
    supabase.from("prospects").select("*").eq("id", id).single(),
    supabase.from("prospect_research").select("*").eq("prospect_id", id).maybeSingle(),
    supabase.from("prospect_messages").select("*").eq("prospect_id", id).order("step_number"),
  ]);

  if (prospectRes.error) return NextResponse.json({ error: prospectRes.error.message }, { status: 404 });

  return NextResponse.json({
    prospect: prospectRes.data,
    research: researchRes.data || null,
    messages: messagesRes.data || [],
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const allowed = [
    "first_name", "last_name", "email", "phone", "linkedin_url", "title",
    "seniority_level", "company_name", "company_domain", "industry",
    "prospect_status", "lead_score", "assigned_to", "notes",
    "last_contacted_at", "next_touch_due", "disqualification_reason",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];

  const { data, error } = await supabase.from("prospects").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await supabase.from("prospects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
