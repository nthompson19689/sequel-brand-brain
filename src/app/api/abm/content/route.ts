import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ content: [] });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");

  let query = supabase.from("abm_content").select("*").order("created_at", { ascending: false });
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("abm_content")
    .insert({
      account_id: body.account_id,
      content_type: body.content_type,
      content: body.content,
      status: body.status || "draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ content: data });
}
