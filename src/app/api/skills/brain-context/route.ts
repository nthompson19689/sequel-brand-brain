import { NextResponse } from "next/server";
import { getBrainContextStatus } from "@/lib/skill-context-status";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getBrainContextStatus();
    return NextResponse.json({ status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load brain context status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
