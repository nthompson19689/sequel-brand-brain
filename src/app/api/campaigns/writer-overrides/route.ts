import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("campaign_writer_overrides")
    .select("*")
    .order("asset_type");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data || [] });
}

export async function PUT(req: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  if (!body.asset_type) return NextResponse.json({ error: "asset_type required" }, { status: 400 });

  const { data, error } = await supabase
    .from("campaign_writer_overrides")
    .upsert({
      asset_type: body.asset_type,
      prompt: body.prompt || "",
      enabled: body.enabled !== false,
    }, { onConflict: "asset_type" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data });
}
