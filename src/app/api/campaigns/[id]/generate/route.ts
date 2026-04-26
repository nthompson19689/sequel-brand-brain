import { getSupabaseServerClient } from "@/lib/supabase";
import { generateAsset } from "@/lib/campaign-generate";

export const runtime = "nodejs";
export const maxDuration = 800;

interface AssetRow {
  id: string;
  campaign_id: string;
  asset_type: string;
  agent: string;
  title: string | null;
  audience: string | null;
  intent: string | null;
  dependencies: string[] | null;
  status: string;
  position: number;
}

/**
 * Streams SSE events as each asset finishes:
 *   event: asset_start  data: {assetId, asset_type, title}
 *   event: asset_done   data: {assetId, status, error?}
 *   event: done         data: {generated, failed}
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return new Response("Supabase not configured", { status: 500 });
  }

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns").select("*").eq("id", id).single();
  if (cErr || !campaign) {
    return new Response("Campaign not found", { status: 404 });
  }

  const { data: assets } = await supabase
    .from("campaign_assets")
    .select("*")
    .eq("campaign_id", id)
    .order("position", { ascending: true });

  const all: AssetRow[] = (assets || []) as AssetRow[];
  const pending = all.filter((a) => a.status === "pending" || a.status === "failed");

  await supabase.from("campaigns").update({ status: "generating" }).eq("id", id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("start", { campaign_id: id, total: pending.length });

      const completed = new Set<string>(
        all.filter((a) => a.status === "ready" || a.status === "edited" || a.status === "approved").map((a) => a.id),
      );
      const failed: string[] = [];
      let generated = 0;
      const remaining = [...pending];

      // Iterate; dispatch any whose deps are all completed.
      let safety = remaining.length * 2 + 5;
      while (remaining.length > 0 && safety-- > 0) {
        const idx = remaining.findIndex((a) =>
          (a.dependencies || []).every((d) => completed.has(d)),
        );
        if (idx === -1) {
          // Unsatisfiable deps — mark the rest as failed.
          for (const a of remaining) {
            await supabase.from("campaign_assets").update({
              status: "failed",
              error: "Unsatisfied dependency",
            }).eq("id", a.id);
            send("asset_done", { assetId: a.id, status: "failed", error: "Unsatisfied dependency" });
            failed.push(a.id);
          }
          break;
        }
        const asset = remaining.splice(idx, 1)[0];

        await supabase.from("campaign_assets").update({ status: "generating" }).eq("id", asset.id);
        send("asset_start", { assetId: asset.id, asset_type: asset.asset_type, title: asset.title });

        const result = await generateAsset(supabase, campaign, asset);
        if (result.ok) {
          completed.add(asset.id);
          generated += 1;
          send("asset_done", { assetId: asset.id, status: "ready" });
        } else {
          await supabase.from("campaign_assets").update({
            status: "failed",
            error: result.error,
          }).eq("id", asset.id);
          failed.push(asset.id);
          send("asset_done", { assetId: asset.id, status: "failed", error: result.error });
        }
      }

      const finalStatus = failed.length === 0 ? "ready" : "ready";
      await supabase.from("campaigns").update({ status: finalStatus }).eq("id", id);

      send("done", { generated, failed: failed.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
