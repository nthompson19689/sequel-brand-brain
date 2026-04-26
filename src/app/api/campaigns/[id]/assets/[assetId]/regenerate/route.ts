import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { generateAsset } from "@/lib/campaign-generate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns").select("*").eq("id", id).single();
  if (cErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: asset, error: aErr } = await supabase
    .from("campaign_assets").select("*").eq("id", assetId).eq("campaign_id", id).single();
  if (aErr || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  await supabase.from("campaign_assets").update({ status: "generating" }).eq("id", assetId);

  const result = await generateAsset(supabase, campaign, asset);
  if (!result.ok) {
    await supabase.from("campaign_assets").update({
      status: "failed", error: result.error,
    }).eq("id", assetId);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { data: updated } = await supabase
    .from("campaign_assets").select("*").eq("id", assetId).single();
  return NextResponse.json({ asset: updated });
}
