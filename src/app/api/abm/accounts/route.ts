import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET /api/abm/accounts — list accounts, filterable by status */
export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ accounts: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("target_accounts")
    .select("*")
    .order("priority_score", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("account_status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accounts: data || [] });
}

/** POST /api/abm/accounts — create single or bulk import */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Bulk import: { accounts: [...] }
  if (Array.isArray(body.accounts)) {
    const rows = body.accounts.map((a: Record<string, unknown>) => ({
      company_name: a.company_name || a.name || "",
      domain: a.domain || "",
      industry: a.industry || null,
      employee_count: a.employee_count || a.size || null,
      funding_stage: a.funding_stage || null,
      account_status: "researching",
      priority_score: Number(a.priority_score) || 50,
    }));

    const { data, error } = await supabase
      .from("target_accounts")
      .upsert(rows, { onConflict: "domain", ignoreDuplicates: true })
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ accounts: data, imported: (data || []).length });
  }

  // Single account
  const { data, error } = await supabase
    .from("target_accounts")
    .insert({
      company_name: body.company_name,
      domain: body.domain,
      industry: body.industry || null,
      employee_count: body.employee_count || null,
      funding_stage: body.funding_stage || null,
      account_status: body.account_status || "researching",
      priority_score: body.priority_score || 50,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}
