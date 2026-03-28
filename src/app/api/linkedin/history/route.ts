import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";

export const runtime = "nodejs";

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

    // Fetch both generated posts and scheduled posts in parallel
    const [generatedResult, scheduledResult] = await Promise.all([
      supabase
        .from("linkedin_posts")
        .select("id, topic, context, variants, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("linkedin_scheduled_posts")
        .select("id, content, status, scheduled_for, published_at, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (generatedResult.error) {
      return Response.json({ error: generatedResult.error.message }, { status: 500 });
    }

    // Build unified history
    const generated = (generatedResult.data || []).map((post) => ({
      ...post,
      type: "generated" as const,
    }));

    const scheduled = (scheduledResult.data || []).map((post) => ({
      ...post,
      type: "scheduled" as const,
    }));

    // Combine and sort by created_at descending
    const history = [...generated, ...scheduled].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return Response.json({
      history,
      posts: generatedResult.data || [],
      scheduled_posts: scheduledResult.data || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn history error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
