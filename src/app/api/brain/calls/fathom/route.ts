import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  isFathomConfigured,
  listCalls,
  FathomRateLimitError,
  FathomAuthError,
} from "@/lib/fathom";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/brain/calls/fathom?limit=50
 *
 * Lists recent calls from Fathom and annotates each with whether it
 * has already been imported into call_insights, so the UI can show
 * an "Already imported" state instead of a redundant Import button.
 */
export async function GET(req: Request) {
  if (!isFathomConfigured()) {
    return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 503 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

  let calls;
  try {
    calls = await listCalls(limit);
  } catch (err) {
    if (err instanceof FathomRateLimitError) {
      return NextResponse.json(
        { error: "Fathom rate limit hit. Wait a minute and try again." },
        { status: 429 },
      );
    }
    if (err instanceof FathomAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Mark which ones are already in call_insights so the UI can hide imports.
  const ids = calls.map((c) => c.id).filter(Boolean);
  let importedSet = new Set<string>();
  if (ids.length > 0) {
    const { data: existing } = await supabase
      .from("call_insights")
      .select("fathom_call_id")
      .in("fathom_call_id", ids);
    importedSet = new Set((existing || []).map((r) => r.fathom_call_id as string));
  }

  return NextResponse.json({
    calls: calls.map((c) => ({ ...c, imported: importedSet.has(c.id) })),
  });
}
