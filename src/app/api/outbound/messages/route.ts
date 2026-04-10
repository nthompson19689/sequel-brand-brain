import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ messages: [] });

  const { searchParams } = new URL(request.url);
  const prospectId = searchParams.get("prospect_id");
  const status = searchParams.get("status");

  let query = supabase.from("prospect_messages").select("*, prospects(first_name, last_name, company_name)").order("step_number");
  if (prospectId) query = query.eq("prospect_id", prospectId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Bulk insert (from generate route)
  if (Array.isArray(body.messages)) {
    const { data, error } = await supabase.from("prospect_messages").insert(body.messages).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data });
  }

  // Single update (edit, approve, mark sent, etc.)
  if (body.id && body.action) {
    const updates: Record<string, unknown> = {};
    switch (body.action) {
      case "edit":
        updates.edited_body = body.edited_body;
        updates.status = "edited";
        break;
      case "approve":
        updates.status = "approved";
        updates.approved_at = new Date().toISOString();
        break;
      case "send":
        updates.status = "sent";
        updates.sent_at = new Date().toISOString();
        break;
      case "replied":
        updates.status = "replied";
        updates.replied_at = new Date().toISOString();
        break;
      case "positive_reply":
        updates.status = "positive_reply";
        updates.replied_at = new Date().toISOString();
        break;
      case "booked":
        updates.status = "booked";
        updates.replied_at = new Date().toISOString();
        break;
    }

    const { data, error } = await supabase
      .from("prospect_messages")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-update prospect status on reply/book
    if (body.action === "booked" && data?.prospect_id) {
      await supabase.from("prospects").update({
        prospect_status: "booked",
        updated_at: new Date().toISOString(),
      }).eq("id", data.prospect_id);
    } else if (["replied", "positive_reply"].includes(body.action) && data?.prospect_id) {
      await supabase.from("prospects").update({
        prospect_status: body.action === "positive_reply" ? "interested" : "replied",
        updated_at: new Date().toISOString(),
      }).eq("id", data.prospect_id).in("prospect_status", ["researching", "sequenced"]);
    }

    return NextResponse.json({ message: data });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
