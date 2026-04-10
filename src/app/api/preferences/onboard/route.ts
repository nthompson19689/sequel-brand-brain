import { NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST — first-login onboarding: set role on profile + create preferences row.
 */
export async function POST(request: Request) {
  const auth = createSupabaseServerAuthClient();
  const { data: userData } = await auth.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    role: string;
    enabled_modules: string[];
  };

  const validRoles = ["marketing", "sales", "leadership", "custom"];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Update profile with module_role
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ module_role: body.role })
    .eq("id", userId);

  if (profileErr) {
    console.error("[Onboard] profile update failed:", profileErr.message);
  }

  // Create preferences row
  const { error: prefErr } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        enabled_modules: body.enabled_modules,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (prefErr) return NextResponse.json({ error: prefErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
