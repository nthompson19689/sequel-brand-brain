import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET /api/brain/stats — Knowledge base statistics */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const [docsRes, articlesRes, battleCardsRes, callInsightsRes] =
      await Promise.all([
        supabase.from("brand_docs").select("doc_type, is_active"),
        supabase.from("articles").select("id, status, content_type"),
        supabase.from("battle_cards").select("id", { count: "exact", head: false }),
        supabase.from("call_insights").select("id, call_type, needs_review"),
      ]);

    // Count brand docs by type
    const docsByType: Record<string, number> = {};
    let activeDocs = 0;
    for (const doc of docsRes.data || []) {
      const d = doc as { doc_type: string; is_active: boolean };
      docsByType[d.doc_type] = (docsByType[d.doc_type] || 0) + 1;
      if (d.is_active) activeDocs++;
    }

    // Count articles by content_type
    const articlesByType: Record<string, number> = {};
    for (const article of articlesRes.data || []) {
      const a = article as { content_type?: string };
      const t = a.content_type || "blog";
      articlesByType[t] = (articlesByType[t] || 0) + 1;
    }

    return Response.json({
      brand_docs: {
        total: (docsRes.data || []).length,
        active: activeDocs,
        by_type: docsByType,
      },
      articles: {
        total: (articlesRes.data || []).length,
        by_type: articlesByType,
      },
      battle_cards: {
        total: (battleCardsRes.data || []).length,
      },
      call_insights: (() => {
        const rows = (callInsightsRes.data || []) as { call_type?: string; needs_review?: boolean }[];
        const by_type: Record<string, number> = {};
        let needsReview = 0;
        for (const r of rows) {
          const t = r.call_type || "sales";
          by_type[t] = (by_type[t] || 0) + 1;
          if (r.needs_review) needsReview += 1;
        }
        return {
          total: rows.length,
          by_type,
          needs_review: needsReview,
          customer: by_type.customer || 0,
          sales: by_type.sales || 0,
          closed_won: (by_type.closed_won || 0) + (by_type.prospect_won || 0),
          closed_lost: (by_type.closed_lost || 0) + (by_type.prospect_lost || 0),
        };
      })(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stats error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
