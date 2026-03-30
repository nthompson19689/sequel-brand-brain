import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── Auth helpers ───────────────────────────────────────────────────────────────

async function getAuthUser() {
  const authClient = createSupabaseServerAuthClient();
  const { data: { session } } = await authClient.auth.getSession();
  return session?.user?.id || null;
}

async function isAdmin(userId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  return !!data?.is_admin;
}

// ─── GET: list tickets ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const scope = request.nextUrl.searchParams.get("scope");

  // Admin can fetch all tickets
  if (scope === "all") {
    const admin = await isAdmin(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabase
      .from("tickets")
      .select("*, submitter:profiles!submitted_by(id, full_name, avatar_url), assignee:profiles!assigned_to(id, full_name, avatar_url)")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tickets: data });
  }

  // Regular user: own tickets only
  const { data, error } = await supabase
    .from("tickets")
    .select("*, assignee:profiles!assigned_to(id, full_name)")
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data });
}

// ─── POST: create ticket ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const body = await request.json();
    const { type } = body;

    if (!type || !["workflow_request", "bug_report"].includes(type)) {
      return NextResponse.json({ error: "type must be 'workflow_request' or 'bug_report'" }, { status: 400 });
    }

    // Validate required fields per type
    if (type === "workflow_request" && !body.goal) {
      return NextResponse.json({ error: "goal is required for workflow requests" }, { status: 400 });
    }
    if (type === "bug_report" && !body.title) {
      return NextResponse.json({ error: "title is required for bug reports" }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      type,
      status: "new",
      submitted_by: userId,
    };

    if (type === "workflow_request") {
      insert.goal = body.goal;
      insert.process = body.process || null;
      insert.due_date = body.due_date || null;
    } else {
      insert.title = body.title;
      insert.description = body.description || null;
      insert.page_feature = body.page_feature || null;
      insert.severity = body.severity || "medium";
      insert.screenshot_url = body.screenshot_url || null;
    }

    const { data, error } = await supabase
      .from("tickets")
      .insert(insert)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ticket: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── PUT: update ticket ─────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Check if user is admin or owns the ticket
    const admin = await isAdmin(userId);

    if (!admin) {
      // Regular user can only update own tickets with status=new
      const { data: ticket } = await supabase
        .from("tickets")
        .select("submitted_by, status")
        .eq("id", id)
        .single();

      if (!ticket || ticket.submitted_by !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (ticket.status !== "new") {
        return NextResponse.json({ error: "Can only edit tickets with status 'new'" }, { status: 403 });
      }

      // Non-admin can't change status or assignment
      delete updates.status;
      delete updates.assigned_to;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ticket: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── DELETE: admin only ─────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const userId = await getAuthUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await isAdmin(userId);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const { error } = await supabase.from("tickets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
