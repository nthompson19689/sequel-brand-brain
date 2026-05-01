import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["customer", "sales", "closed_won", "closed_lost", "open_opp"]);

/** PATCH /api/brain/calls/:id — change call_type or clear needs_review */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body.call_type === "string") {
    if (!ALLOWED_TYPES.has(body.call_type)) {
      return NextResponse.json(
        { error: `call_type must be one of: ${Array.from(ALLOWED_TYPES).join(", ")}` },
        { status: 400 },
      );
    }
    updates.call_type = body.call_type;
    // Reclassifying clears the review flag — the human just reviewed it.
    updates.needs_review = false;
  }
  if (typeof body.needs_review === "boolean") updates.needs_review = body.needs_review;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("call_insights")
    .update(updates)
    .eq("id", id)
    .select(
      "id, fathom_call_id, call_type, company_name, contact_name, call_date, summary, sentiment, churn_risk, needs_review",
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ call: data });
}
