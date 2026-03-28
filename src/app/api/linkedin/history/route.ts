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

    const { data, error } = await supabase
      .from("linkedin_posts")
      .select("id, topic, context, variants, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ posts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("LinkedIn history error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
