import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ prospects: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const seniority = searchParams.get("seniority");
  const assignedTo = searchParams.get("assigned_to");

  let query = supabase
    .from("prospects")
    .select("*")
    .order("lead_score", { ascending: false });

  if (status && status !== "all") query = query.eq("prospect_status", status);
  if (seniority) query = query.eq("seniority_level", seniority);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospects: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Import from ABM target account
  if (body.from_abm) {
    const { data: account } = await supabase
      .from("target_accounts")
      .select("company_name, domain, industry, employee_count, key_contacts")
      .eq("id", body.from_abm)
      .single();

    if (!account || !Array.isArray(account.key_contacts) || account.key_contacts.length === 0) {
      return NextResponse.json({ error: "No contacts found on this account" }, { status: 400 });
    }

    const rows = account.key_contacts.map((c: { name?: string; title?: string; email?: string; linkedin?: string }) => {
      const nameParts = (c.name || "").split(" ");
      return {
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        email: c.email || null,
        linkedin_url: c.linkedin || null,
        title: c.title || null,
        company_name: account.company_name,
        company_domain: account.domain,
        industry: account.industry,
        employee_count: account.employee_count,
        source: "abm_module",
        prospect_status: "researching",
      };
    });

    const { data, error } = await supabase.from("prospects").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospects: data, imported: (data || []).length });
  }

  // Bulk CSV import
  if (Array.isArray(body.prospects)) {
    const rows = body.prospects.map((p: Record<string, unknown>) => ({
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      email: p.email || null,
      phone: p.phone || null,
      linkedin_url: p.linkedin_url || null,
      title: p.title || null,
      seniority_level: p.seniority_level || null,
      company_name: p.company_name || null,
      company_domain: p.company_domain || null,
      industry: p.industry || null,
      source: "csv_import",
      prospect_status: "researching",
    }));

    const { data, error } = await supabase.from("prospects").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prospects: data, imported: (data || []).length });
  }

  // Single prospect
  const { data, error } = await supabase
    .from("prospects")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      phone: body.phone || null,
      linkedin_url: body.linkedin_url || null,
      title: body.title || null,
      seniority_level: body.seniority_level || null,
      company_name: body.company_name || null,
      company_domain: body.company_domain || null,
      industry: body.industry || null,
      source: body.source || "manual",
      prospect_status: "researching",
      lead_score: body.lead_score || 50,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}
