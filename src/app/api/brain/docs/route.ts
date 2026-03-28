import { getSupabaseServerClient } from "@/lib/supabase";
import { clearBrandCache } from "@/lib/brand-context";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/** GET /api/brain/docs — List all brand docs */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("brand_docs")
    .select("*")
    .order("doc_type")
    .order("name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ docs: data || [] });
}

/** POST /api/brain/docs — Create or update a brand doc */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const body = await request.json();
  const { id, name, doc_type, content, is_active } = body;

  if (!name || !doc_type || !content) {
    return Response.json(
      { error: "name, doc_type, and content are required" },
      { status: 400 }
    );
  }

  const row = {
    ...(id ? { id } : {}),
    name,
    doc_type,
    content,
    is_active: is_active !== false,
  };

  const { data, error } = await supabase
    .from("brand_docs")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  clearBrandCache(); // Invalidate so next Claude call picks up the change
  return Response.json({ doc: data });
}

/** DELETE /api/brain/docs?id=xxx — Delete a brand doc */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase.from("brand_docs").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  clearBrandCache();
  return Response.json({ success: true });
}
