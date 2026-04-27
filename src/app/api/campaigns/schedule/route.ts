import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Returns campaign assets joined with their parent campaign, used for
 * the cross-campaign schedule / to-do view.
 *
 * ?status=approved        only approved assets (default = all)
 * ?from=YYYY-MM-DD         filter scheduled_at >= from
 * ?to=YYYY-MM-DD           filter scheduled_at <= to
 * ?include_unposted=true   default true; set false to hide unposted-yet items
 */
export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  let q = supabase
    .from("campaign_assets")
    .select("*, campaigns:campaign_id(id, name, launch_date, status)")
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assets: data || [] });
}
