import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/competitor-scan
 *
 * Called by Vercel Cron every Monday at 9am UTC.
 * Runs all competitor scans, then auto-generates a weekly digest.
 *
 * Vercel sends an Authorization header with CRON_SECRET — we verify it
 * to prevent unauthorized access.
 */
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // 1. Fetch all competitors
  const { data: competitors, error: compError } = await supabase
    .from("competitor_watch")
    .select("*")
    .order("name");

  if (compError || !competitors?.length) {
    return Response.json({
      error: compError?.message || "No competitors configured",
      step: "fetch_competitors",
    }, { status: 500 });
  }

  console.log(`[Cron] Starting weekly competitor scan for ${competitors.length} competitors`);

  // 2. Run scans by calling the scan endpoint internally
  //    We import and call the scan functions directly to avoid HTTP overhead
  const scanRes = await fetch(new URL("/api/competitors/scan", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pass through any auth cookies if present
      cookie: request.headers.get("cookie") || "",
    },
    body: JSON.stringify({ scan_all: true }),
  });

  if (!scanRes.ok) {
    const errText = await scanRes.text();
    console.error("[Cron] Scan failed:", errText);
    return Response.json({ error: "Scan failed", details: errText }, { status: 500 });
  }

  // Consume the SSE stream to completion
  const reader = scanRes.body?.getReader();
  if (reader) {
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }

  console.log("[Cron] Scans complete, generating digest...");

  // 3. Generate digest
  const digestRes = await fetch(new URL("/api/competitors/digest", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const digestData = await digestRes.json();

  console.log("[Cron] Weekly competitor intelligence complete");

  return Response.json({
    success: true,
    competitors_scanned: competitors.length,
    digest_generated: !!digestData.digest,
    timestamp: new Date().toISOString(),
  });
}
