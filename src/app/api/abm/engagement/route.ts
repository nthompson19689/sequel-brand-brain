import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ engagement: [] });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");

  let query = supabase.from("account_engagement").select("*, target_accounts(company_name)").order("occurred_at", { ascending: false }).limit(100);
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ engagement: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("account_engagement")
    .insert({
      account_id: body.account_id,
      channel: body.channel,
      action: body.action,
      detail: body.detail || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-update account status based on engagement
  // Future: calculate engagement score and auto-transition status
  // Placeholder: if they booked, move to opportunity
  if (body.action === "booked") {
    await supabase
      .from("target_accounts")
      .update({ account_status: "opportunity", updated_at: new Date().toISOString() })
      .eq("id", body.account_id);
  } else if (["replied", "clicked"].includes(body.action)) {
    // Move from monitoring to engaging if not already further along
    await supabase
      .from("target_accounts")
      .update({ account_status: "engaging", updated_at: new Date().toISOString() })
      .eq("id", body.account_id)
      .in("account_status", ["researching", "monitoring"]);
  }

  return NextResponse.json({ engagement: data });
}
