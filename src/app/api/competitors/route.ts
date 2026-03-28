import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/competitors — list all competitors sorted by name
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("competitor_watch")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ competitors: data });
}

/**
 * POST /api/competitors — add a new competitor
 * Body: { name, domain, website_url, pricing_url?, careers_url?, g2_url?, changelog_url?, events_url? }
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { name, domain, website_url, pricing_url, careers_url, g2_url, changelog_url, events_url } = body;

    if (!name || !domain || !website_url) {
      return Response.json({ error: "name, domain, and website_url are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("competitor_watch")
      .insert({
        name,
        domain,
        website_url,
        pricing_url: pricing_url || null,
        careers_url: careers_url || null,
        g2_url: g2_url || null,
        changelog_url: changelog_url || null,
        events_url: events_url || null,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ competitor: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }
}

/**
 * PUT /api/competitors — update an existing competitor
 * Body: { id, ...fields }
 */
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("competitor_watch")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ competitor: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/competitors?id=X — remove a competitor
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id query param is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("competitor_watch")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
