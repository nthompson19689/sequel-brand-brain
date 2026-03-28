import { getSupabaseServerClient } from "@/lib/supabase";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Helper: verify caller is admin
async function verifyAdmin() {
  const authClient = createSupabaseServerAuthClient();
  const {
    data: { session },
  } = await authClient.auth.getSession();
  if (!session?.user?.id) return null;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();

  if (!profile?.is_admin) return null;
  return session.user.id;
}

export async function GET(request: NextRequest) {
  const adminId = await verifyAdmin();
  if (!adminId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = getSupabaseServerClient()!;
  const action = request.nextUrl.searchParams.get("action");

  if (action === "users") {
    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    // Get auth users for last_sign_in
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();
    const authMap = new Map(
      authUsers?.map((u) => [u.id, u]) || []
    );

    const users = (profiles || []).map((p) => ({
      ...p,
      last_sign_in_at: authMap.get(p.id)?.last_sign_in_at || null,
    }));

    return NextResponse.json({ users });
  }

  if (action === "invites") {
    const { data } = await supabase
      .from("pending_invites")
      .select("*")
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    return NextResponse.json({ invites: data || [] });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const adminId = await verifyAdmin();
  if (!adminId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = getSupabaseServerClient()!;
  const body = await request.json();
  const { action } = body;

  if (action === "invite") {
    const { email, role } = body;
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });

      await supabase.from("pending_invites").insert({
        email,
        role: role || "Other",
        invited_by: adminId,
      });

      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invite failed" },
        { status: 500 }
      );
    }
  }

  if (action === "deactivate") {
    await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", body.userId);
    return NextResponse.json({ success: true });
  }

  if (action === "activate") {
    await supabase
      .from("profiles")
      .update({ is_active: true })
      .eq("id", body.userId);
    return NextResponse.json({ success: true });
  }

  if (action === "change_role") {
    await supabase
      .from("profiles")
      .update({ role: body.role })
      .eq("id", body.userId);
    return NextResponse.json({ success: true });
  }

  if (action === "toggle_admin") {
    if (body.userId === adminId)
      return NextResponse.json(
        { error: "Cannot change your own admin status" },
        { status: 400 }
      );
    await supabase
      .from("profiles")
      .update({ is_admin: body.is_admin })
      .eq("id", body.userId);
    return NextResponse.json({ success: true });
  }

  if (action === "remove_user") {
    if (body.userId === adminId)
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 }
      );
    await supabase.auth.admin.deleteUser(body.userId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
