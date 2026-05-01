import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { importFathomCall } from "@/lib/call-classify";
import {
  isFathomConfigured,
  FathomRateLimitError,
  FathomAuthError,
} from "@/lib/fathom";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/brain/calls/fathom/import
 * Body: { fathom_call_id: string }
 *
 * Pulls transcript + summary from Fathom, runs the shared classifier
 * + storage pipeline, and embeds the row.
 */
export async function POST(req: Request) {
  if (!isFathomConfigured()) {
    return NextResponse.json({ error: "FATHOM_API_KEY not configured" }, { status: 503 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const fathomCallId = body.fathom_call_id as string | undefined;
  if (!fathomCallId) {
    return NextResponse.json({ error: "fathom_call_id required" }, { status: 400 });
  }

  try {
    const result = await importFathomCall({ supabase, fathomCallId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(result);
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
      { status: 500 },
    );
  }
}
