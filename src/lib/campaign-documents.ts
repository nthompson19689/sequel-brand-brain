import type { SupabaseClient } from "@supabase/supabase-js";

interface DocRow {
  id: string;
  filename: string;
  file_type: string | null;
  label: string | null;
  content: string;
  include_in_writers: boolean | null;
}

const PER_DOC_CHAR_BUDGET = 18000;
const TOTAL_CHAR_BUDGET = 80000;

/**
 * Build a markdown context block of all docs attached to a campaign.
 * @param mode "all" for orchestrator, "writers" to filter to docs flagged
 *             include_in_writers (default true).
 */
export async function buildDocumentsContext(
  supabase: SupabaseClient,
  campaignId: string,
  mode: "all" | "writers" = "all",
): Promise<string> {
  let q = supabase
    .from("campaign_documents")
    .select("id, filename, file_type, label, content, include_in_writers")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (mode === "writers") {
    q = q.eq("include_in_writers", true);
  }

  const { data, error } = await q;
  if (error || !data || data.length === 0) return "";

  const docs = data as DocRow[];
  const parts: string[] = ["=== CAMPAIGN REFERENCE DOCUMENTS ==="];
  let used = 0;

  for (const d of docs) {
    const header = `\n\n--- ${d.label || d.filename} (${d.file_type || "doc"}) ---\n`;
    const slice = d.content.slice(0, PER_DOC_CHAR_BUDGET);
    if (used + header.length + slice.length > TOTAL_CHAR_BUDGET) {
      parts.push(`\n\n[Additional ${docs.length - parts.length + 1} documents truncated for length.]`);
      break;
    }
    parts.push(header + slice);
    if (slice.length < d.content.length) {
      parts.push(`\n[…document truncated at ${PER_DOC_CHAR_BUDGET} chars]`);
    }
    used += header.length + slice.length;
  }

  return parts.join("");
}
