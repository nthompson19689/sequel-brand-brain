/**
 * Map skill context types → Brand Brain sources and report which are loaded.
 *
 * Used by the Skills marketplace to show green/orange badges on each skill card
 * and to enable/disable the install button.
 */

import { getSupabaseServerClient } from "./supabase";
import type { BrainContextType } from "./skills";

export type ContextStatus = Record<BrainContextType, boolean>;

/**
 * Load the set of doc types present in `brand_docs` and check a few other
 * tables to infer which skill-context categories are available.
 */
export async function getBrainContextStatus(): Promise<ContextStatus> {
  const status: ContextStatus = {
    voice: false,
    style_guide: false,
    icp_profiles: false,
    messaging: false,
    tone: false,
    sitemap: false,
    product_pages: false,
    case_studies: false,
    competitor_data: false,
    call_transcripts: false,
    keyword_targets: false,
    editorial_guidelines: false,
    executive_voices: false,
    customer_data: false,
    analytics_kpis: false,
  };

  const supabase = getSupabaseServerClient();
  if (!supabase) return status;

  // 1. brand_docs — the primary source for voice, style, icp, positioning
  try {
    const { data } = await supabase
      .from("brand_docs")
      .select("doc_type")
      .eq("is_active", true);
    const types = new Set((data || []).map((d: { doc_type: string }) => d.doc_type));

    if (types.has("voice_and_tone")) {
      status.voice = true;
      status.tone = true;
    }
    if (types.has("editorial_longform") || types.has("editorial_shortform")) {
      status.style_guide = true;
      status.editorial_guidelines = true;
    }
    if (types.has("icp")) status.icp_profiles = true;
    if (types.has("positioning")) status.messaging = true;
  } catch {
    // ignore
  }

  // 2. articles — sitemap / case studies / product pages
  try {
    const { count } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true });
    if ((count || 0) > 0) status.sitemap = true;
  } catch {
    // ignore
  }

  // 3. competitor data
  try {
    const { count } = await supabase
      .from("competitor_watch")
      .select("id", { count: "exact", head: true });
    if ((count || 0) > 0) status.competitor_data = true;
  } catch {
    // ignore
  }

  // 4. call insights → proxy for call transcripts
  try {
    const { count } = await supabase
      .from("call_insights")
      .select("id", { count: "exact", head: true });
    if ((count || 0) > 0) status.call_transcripts = true;
  } catch {
    // ignore
  }

  // 5. keyword watchlist → keyword targets
  try {
    const { count } = await supabase
      .from("seo_keyword_watchlist")
      .select("id", { count: "exact", head: true });
    if ((count || 0) > 0) status.keyword_targets = true;
  } catch {
    // ignore
  }

  return status;
}
