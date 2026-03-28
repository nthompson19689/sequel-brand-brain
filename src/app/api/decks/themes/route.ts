import { getSupabaseServerClient } from "@/lib/supabase";
import { DEFAULT_THEMES } from "@/lib/decks";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

let seeded = false;

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ themes: DEFAULT_THEMES });

  // Seed defaults if needed
  if (!seeded) {
    try {
      const ids = DEFAULT_THEMES.map((t) => t.id);
      const { data: existing } = await supabase.from("presentation_themes").select("id").in("id", ids);
      const existingIds = new Set((existing || []).map((t: { id: string }) => t.id));
      const toSeed = DEFAULT_THEMES.filter((t) => !existingIds.has(t.id));
      if (toSeed.length > 0) {
        await supabase.from("presentation_themes").insert(toSeed);
      }
    } catch { /* table may not exist yet */ }
    seeded = true;
  }

  const { data, error } = await supabase
    .from("presentation_themes")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Themes] Fetch error:", error);
    // Fallback to defaults
    return NextResponse.json({ themes: DEFAULT_THEMES });
  }

  return NextResponse.json({ themes: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();
  const row: Record<string, unknown> = {
    name: body.name,
    is_default: body.is_default || false,
    colors: body.colors,
    fonts: body.fonts,
    logo_url: body.logo_url || null,
    footer_text: body.footer_text || "",
    updated_at: new Date().toISOString(),
  };

  // If setting as default, unset other defaults first
  if (body.is_default) {
    await supabase.from("presentation_themes").update({ is_default: false }).neq("id", body.id || "");
  }

  if (body.id) {
    const { data, error } = await supabase.from("presentation_themes").update(row).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ theme: data });
  }

  const { data, error } = await supabase.from("presentation_themes").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ theme: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("presentation_themes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
