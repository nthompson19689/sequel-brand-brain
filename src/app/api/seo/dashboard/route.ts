import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("seo_page_metrics")
    .select("*")
    .order("health_score", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const pages = data || [];

  const summary = {
    total: pages.length,
    working_count: pages.filter((p) => p.status === "working").length,
    needs_push_count: pages.filter((p) => p.status === "needs_push").length,
    not_working_count: pages.filter((p) => p.status === "not_working").length,
    last_synced: pages.length > 0
      ? pages.reduce((latest, p) => (p.synced_at > latest ? p.synced_at : latest), pages[0].synced_at)
      : null,
  };

  return Response.json({ pages, summary });
}
