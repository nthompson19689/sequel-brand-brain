import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ decks: [] });

  const filter = request.nextUrl.searchParams.get("filter"); // "shared" | "all"

  let query = supabase.from("decks").select("*").order("updated_at", { ascending: false });

  if (filter === "shared") {
    query = query.eq("is_shared", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[Decks] Fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ decks: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();
  const row: Record<string, unknown> = {
    title: body.title || "Untitled Deck",
    slides: body.slides || [],
    theme_id: body.theme_id || null,
    is_shared: body.is_shared || false,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { data, error } = await supabase.from("decks").update(row).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deck: data });
  }

  const { data, error } = await supabase.from("decks").insert(row).select().single();
  if (error) {
    console.error("[Decks] Insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deck: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("decks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
