import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // Authenticate
    const supabaseAuth = createSupabaseServerAuthClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return Response.json({ error: "action is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return Response.json({ error: "Supabase not configured" }, { status: 503 });
    }

    switch (action) {
      case "quick_publish":
        return handleQuickPublish(body, session.user.id, supabase);
      case "schedule":
        return handleSchedule(body, session.user.id, supabase);
      case "save_draft":
        return handleSaveDraft(body, session.user.id, supabase);
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn publish error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Authenticate
    const supabaseAuth = createSupabaseServerAuthClient();
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return Response.json({ error: "Supabase not configured" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("linkedin_scheduled_posts")
      .select("id, post_content, status, scheduled_for, published_at, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ scheduled_posts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn publish GET error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── action="quick_publish" ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleQuickPublish(body: Record<string, unknown>, userId: string, supabase: any) {
  const { post_id, content } = body;

  if (!content || typeof content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  // If a post_id is provided, update that linkedin_posts entry
  if (post_id && typeof post_id === "string") {
    await supabase
      .from("linkedin_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", post_id)
      .eq("user_id", userId);
  }

  // Also create a scheduled_posts entry marked as published
  const { data, error } = await supabase
    .from("linkedin_scheduled_posts")
    .insert({
      user_id: userId,
      post_content: content,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, id: data.id, status: "published" });
}

// ─── action="schedule" ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSchedule(body: Record<string, unknown>, userId: string, supabase: any) {
  const { content, scheduled_for } = body;

  if (!content || typeof content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }
  if (!scheduled_for || typeof scheduled_for !== "string") {
    return Response.json({ error: "scheduled_for is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("linkedin_scheduled_posts")
    .insert({
      user_id: userId,
      post_content: content,
      status: "scheduled",
      scheduled_for,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, id: data.id, status: "scheduled", scheduled_for });
}

// ─── action="save_draft" ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveDraft(body: Record<string, unknown>, userId: string, supabase: any) {
  const { content } = body;

  if (!content || typeof content !== "string") {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("linkedin_scheduled_posts")
    .insert({
      user_id: userId,
      post_content: content,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, id: data.id, status: "draft" });
}
