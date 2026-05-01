import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase";
import { importFathomCall } from "@/lib/call-classify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/fathom/webhook
 *
 * Receives Fathom call.completed events. Validates the HMAC-SHA256
 * signature against FATHOM_WEBHOOK_SECRET, then kicks off the same
 * classification + embedding pipeline used by manual imports — but
 * does so in the background so this handler can return 200 fast.
 *
 * LOCAL TESTING:
 *   Fathom needs a publicly reachable URL. Use ngrok:
 *     ngrok http 3003
 *   Then set the resulting https://<id>.ngrok.app/api/fathom/webhook
 *   as the webhook URL in Fathom's dashboard.
 *
 * Idempotent: if the call_id is already in call_insights we return
 * 200 without doing any work.
 */
export async function POST(req: Request) {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed in prod — never accept unsigned webhooks.
    return NextResponse.json({ error: "FATHOM_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  // Fathom signs payloads with HMAC-SHA256 over the raw request body.
  // Header could be sent under several names depending on Fathom's
  // version — we try the most common ones. Accept either bare hex
  // ("abc123…") or "sha256=abc123…".
  const provided =
    req.headers.get("x-fathom-signature") ||
    req.headers.get("fathom-signature") ||
    req.headers.get("x-webhook-signature") ||
    "";

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const cleanProvided = provided.startsWith("sha256=") ? provided.slice(7) : provided;

  // Constant-time compare; lengths must match for timingSafeEqual.
  let signatureValid = false;
  try {
    signatureValid =
      cleanProvided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(cleanProvided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse JSON body
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = (payload.event as string) || (payload.type as string) || "";
  if (eventType !== "call.completed") {
    // Ack non-call.completed events so Fathom doesn't retry.
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  // Pull the call ID from a few likely shapes
  const data =
    (payload.data as Record<string, unknown> | undefined) ||
    (payload.call as Record<string, unknown> | undefined) ||
    payload;
  const callId =
    (data?.id as string | undefined) ||
    (data?.call_id as string | undefined) ||
    (payload.call_id as string | undefined) ||
    "";

  if (!callId) {
    return NextResponse.json({ error: "No call_id in payload" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    // Still return 200 so Fathom doesn't retry forever for a config issue
    console.error("[fathom webhook] supabase not configured; dropping event");
    return NextResponse.json({ ok: true, error: "supabase-unconfigured" });
  }

  // Quick dedup so we don't spawn classification work twice.
  const { data: existing } = await supabase
    .from("call_insights")
    .select("id")
    .eq("fathom_call_id", callId)
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ ok: true, skipped: true, id: existing.id });
  }

  // Fire-and-forget: classify + embed in the background. Fathom only
  // needs the 200 to know the event was received.
  void (async () => {
    try {
      const result = await importFathomCall({ supabase, fathomCallId: callId });
      console.log(`[fathom webhook] processed ${callId}:`, result);
    } catch (err) {
      console.error(`[fathom webhook] background processing failed for ${callId}:`, err);
    }
  })();

  return NextResponse.json({ ok: true, queued: callId });
}
