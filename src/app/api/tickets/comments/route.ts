import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function getAuthUser() {
  const authClient = createSupabaseServerAuthClient();
  const { data: { session } } = await authClient.auth.getSession();
  return session?.user?.id || null;
}

// ─── GET: comments for a ticket ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const ticketId = request.nextUrl.searchParams.get("ticket_id");
  if (!ticketId) return NextResponse.json({ error: "ticket_id query param required" }, { status: 400 });

  const { data, error } = await supabase
    .from("ticket_comments")
    .select("*, author:profiles!user_id(id, full_name, avatar_url)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

// ─── POST: add comment ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const { ticket_id, body } = await request.json();

    if (!ticket_id || !body || typeof body !== "string") {
      return NextResponse.json({ error: "ticket_id and body are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({ ticket_id, user_id: userId, body: body.trim() })
      .select("*, author:profiles!user_id(id, full_name, avatar_url)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
