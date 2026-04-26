import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { extractTextFromFile } from "@/lib/parse-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("campaign_documents")
    .select("id, filename, file_type, label, word_count, include_in_writers, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data || [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const contentType = req.headers.get("content-type") || "";

  // Accept either multipart upload OR a JSON paste
  let filename = "";
  let fileType = "";
  let text = "";
  let label: string | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      label = (formData.get("label") as string) || null;
      if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      const parsed = await extractTextFromFile(file);
      filename = parsed.filename;
      fileType = parsed.fileType;
      text = parsed.text;
    } else {
      const body = await req.json();
      filename = body.filename || "pasted-text.txt";
      fileType = body.file_type || "txt";
      text = body.content || "";
      label = body.label || null;
      if (!text.trim()) return NextResponse.json({ error: "Empty content" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parse failed" },
      { status: 400 },
    );
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const { data, error } = await supabase
    .from("campaign_documents")
    .insert({
      campaign_id: id,
      filename,
      file_type: fileType,
      label,
      content: text,
      word_count: wordCount,
    })
    .select("id, filename, file_type, label, word_count, include_in_writers, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data });
}
