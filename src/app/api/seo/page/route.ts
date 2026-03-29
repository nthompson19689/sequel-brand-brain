import { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ error: "url query parameter is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("seo_page_metrics")
    .select("*")
    .eq("url", url)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
  }

  return Response.json({ page: data });
}
