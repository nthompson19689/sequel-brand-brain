#!/usr/bin/env python3
"""
Brief Agent — Cluster-Based Content Engine
Reads a cluster post from the DB, generates a detailed writing brief
using the Brand Brain, Book Outline, Tone Samples, ICP, and cluster context.

Usage:
    python scripts/brief_agent.py --domain systemsledgrowth.ai --post-id P001
    python scripts/brief_agent.py --domain systemsledgrowth.ai --post-id P001 --dry-run
"""
import argparse
import json
import os
import re
import sys
import time as _time
import random as _random
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


# ---------------------------------------------------------------------------
# Retry helper (shared pattern with content_writer.py)
# ---------------------------------------------------------------------------

def _call_claude_with_retry(client, create_kwargs: dict, label: str = "API call", max_retries: int = 5):
    retryable = (429, 500, 502, 503, 529)
    for attempt in range(1, max_retries + 1):
        try:
            return client.messages.create(**create_kwargs)
        except anthropic.APIStatusError as exc:
            status = exc.status_code
            if status not in retryable or attempt == max_retries:
                raise
            if status == 529:
                base_wait = 30 * attempt
            else:
                base_wait = 2 ** attempt
            jitter = _random.uniform(0, base_wait * 0.25)
            wait = base_wait + jitter
            print(f"  [RETRY] {label}: HTTP {status}, waiting {wait:.0f}s... (attempt {attempt}/{max_retries})")
            _time.sleep(wait)


def _estimate_tokens(text: str) -> int:
    return len(text) // 4


def _truncate_to_tokens(text: str, max_tokens: int) -> str:
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "..."


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Token budgets (same as writer for Brand Brain)
MAX_BRAND_CONTEXT_TOKENS = 12000
BUDGET_VOICE_TONE_MSG = 4000
BUDGET_STYLE_GUIDES = 2000
BUDGET_OTHER_DOCS = 1000
BUDGET_EXEC_VOICES = 2000


# ---------------------------------------------------------------------------
# Step 1 — Resolve client
# ---------------------------------------------------------------------------

def resolve_client_id(domain: str) -> str:
    resp = (
        supabase.table("clients")
        .select("id")
        .eq("domain", domain)
        .limit(1)
        .execute()
    )
    if not resp.data:
        print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return resp.data[0]["id"]


# ---------------------------------------------------------------------------
# Step 2 — Load cluster post + cluster context
# ---------------------------------------------------------------------------

def load_cluster_post(client_id: str, post_id: str) -> dict:
    resp = (
        supabase.table("cluster_posts")
        .select("*")
        .eq("client_id", client_id)
        .eq("post_id", post_id)
        .execute()
    )
    if not resp.data:
        print(f"[ERROR] Post {post_id} not found for this client")
        sys.exit(1)
    return resp.data[0]


def load_cluster_context(client_id: str, cluster_id: str, current_post_id: str) -> dict:
    """Load all posts in the same cluster for linking context."""
    resp = (
        supabase.table("cluster_posts")
        .select("post_id, post_type, title, primary_keyword, status, published_url, cluster_position, links_to")
        .eq("client_id", client_id)
        .eq("cluster_id", cluster_id)
        .order("cluster_position")
        .execute()
    )
    posts = resp.data or []
    cluster_posts = [p for p in posts if p["post_id"] != current_post_id]

    # Identify the pillar
    pillar = next((p for p in posts if p["post_type"] == "pillar"), None)

    # Find published posts (for real URL references)
    published = [p for p in posts if p.get("published_url")]

    return {
        "all_posts": posts,
        "sibling_posts": cluster_posts,
        "pillar": pillar,
        "published_posts": published,
    }


# ---------------------------------------------------------------------------
# Step 3 — Load Brand Brain (reuses writer pattern)
# ---------------------------------------------------------------------------

def load_brand_brain(client_id: str) -> dict:
    print("[2/5] Loading Brand Brain...")

    # Brand guidelines (legacy)
    try:
        guidelines = supabase.table("brand_guidelines").select("*").eq("client_id", client_id).execute().data or []
    except Exception:
        guidelines = []

    # Brand documents with budget enforcement
    try:
        docs_resp = (
            supabase.table("brand_documents")
            .select("file_name, doc_type, full_text")
            .eq("client_id", client_id)
            .execute()
        )
        brand_documents = docs_resp.data or []
    except Exception:
        brand_documents = []

    vtm_docs = [d for d in brand_documents if d.get("doc_type") in ("voice", "tone", "messaging")]
    style_docs = [d for d in brand_documents if d.get("doc_type") == "style_guide"]
    other_docs = [d for d in brand_documents if d.get("doc_type") not in ("voice", "tone", "messaging", "style_guide")]

    # Budget enforcement: voice/tone/messaging
    vtm_budget = BUDGET_VOICE_TONE_MSG
    for doc in vtm_docs:
        text = doc.get("full_text", "")
        tokens = _estimate_tokens(text)
        if tokens > vtm_budget:
            doc["full_text"] = _truncate_to_tokens(text, vtm_budget) if vtm_budget > 0 else ""
            vtm_budget = 0
        else:
            vtm_budget -= tokens

    # Budget enforcement: style guides
    style_budget = BUDGET_STYLE_GUIDES
    for doc in style_docs:
        text = doc.get("full_text", "")
        tokens = _estimate_tokens(text)
        if tokens > style_budget:
            doc["full_text"] = _truncate_to_tokens(text, style_budget) if style_budget > 0 else ""
            style_budget = 0
        else:
            style_budget -= tokens

    # Budget enforcement: other docs
    vtm_used = BUDGET_VOICE_TONE_MSG - vtm_budget
    style_used = BUDGET_STYLE_GUIDES - style_budget
    other_cap = MAX_BRAND_CONTEXT_TOKENS - vtm_used - style_used - BUDGET_EXEC_VOICES
    other_used = 0
    for doc in other_docs:
        text = doc.get("full_text", "")
        truncated = _truncate_to_tokens(text, BUDGET_OTHER_DOCS)
        tokens = _estimate_tokens(truncated)
        if other_used + tokens > other_cap:
            doc["full_text"] = ""
        else:
            doc["full_text"] = truncated
            other_used += tokens

    brand_documents = [d for d in vtm_docs + style_docs + other_docs if d.get("full_text")]

    # Executive voices
    try:
        voices = supabase.table("executive_voices").select("person_name, role, sample_quotes, topics").eq("client_id", client_id).execute().data or []
    except Exception:
        voices = []

    # Content library summaries
    try:
        library = supabase.table("content_library").select("title, source_url, summary").eq("client_id", client_id).execute().data or []
    except Exception:
        library = []
    for entry in library:
        s = entry.get("summary", "")
        if len(s) > 500:
            entry["summary"] = s[:500] + "..."

    total_tokens = sum(_estimate_tokens(d.get("full_text", "")) for d in brand_documents)
    print(f"  [BRAND BRAIN] {len(brand_documents)} docs (~{total_tokens}t), {len(voices)} voices, {len(library)} library entries")

    return {
        "guidelines": guidelines,
        "brand_documents": brand_documents,
        "executive_voices": voices,
        "content_library": library,
    }


# ---------------------------------------------------------------------------
# Step 4 — Build system prompt for Brief Agent
# ---------------------------------------------------------------------------

BRIEF_SYSTEM_PROMPT = """You are a content strategist for Systems-Led Growth (SLG), a framework for building AI-augmented go-to-market systems for skeleton-crew SaaS teams.

Your job is to generate a detailed writing brief for each blog post based on the cluster map data. The brief must give the Writing Agent everything it needs to produce a complete, publishable article.

You have access to:
- The SLG Brand Brain (voice, tone, positioning, terminology)
- The SLG Book Outline (chapter structure and key points)
- The SLG Tone Samples (what good writing looks like, what to avoid)
- The SLG ICP Deep Dive (who the reader is)
- Previously published posts in this cluster (for linking context)

RULES:
- Never use em dashes in the brief or suggest them for the article
- All briefs should suggest where Nathan's personal experience or anecdotes would strengthen the content. Describe the type of story needed (e.g. "a time when scaling content ops broke down") so the Writing Agent can write a plausible first-person version. Do NOT use [NATHAN:] bracket placeholders.
- All briefs must include specific stats with sources
- All briefs must specify exact internal links with post IDs and their full URLs
- Internal links should be woven naturally throughout the article, not clustered at section ends
- Briefs should specify H3 sub-headings within longer H2 sections
- Pillar briefs must include the full H2 + H3 structure
- Supporting and question briefs must specify how they connect to and link back to the pillar"""


def build_brief_prompt(post: dict, cluster_ctx: dict, brand_brain: dict) -> str:
    """Build the user-facing prompt with all context for brief generation."""

    # --- Post metadata ---
    sections = []
    sections.append(f"""== POST TO BRIEF ==
Post ID: {post['post_id']}
Cluster: {post['cluster_id']}
Type: {post['post_type']}
Title: {post['title']}
Primary Keyword: {post['primary_keyword']} (Vol: {post.get('volume', 0)}, KD: {post.get('kd', 0)})
Secondary Keywords: {post.get('secondary_keywords', '')}
Target Word Count: {post.get('word_count', 1500)}
Book Chapter Reference: {post.get('book_chapter', '')}
Links To: {post.get('links_to', '')}
Links From: {post.get('links_from', '')}""")

    # --- Cluster context ---
    pillar = cluster_ctx.get("pillar")
    siblings = cluster_ctx.get("sibling_posts", [])
    if pillar:
        pillar_kw = pillar.get("primary_keyword", "")
        pillar_slug = re.sub(r'[^a-z0-9]+', '-', pillar_kw.lower()).strip('-') if pillar_kw else pillar['post_id'].lower()
        pillar_url = pillar.get("published_url") or f"https://systemsledgrowth.ai/post/{pillar_slug}"
        sections.append(f"""== CLUSTER PILLAR ==
{pillar['post_id']}: {pillar['title']}
Keyword: {pillar_kw}
URL: {pillar_url}""")

    if siblings:
        sibling_lines = []
        for s in siblings:
            s_kw = s.get("primary_keyword", "")
            s_slug = re.sub(r'[^a-z0-9]+', '-', s_kw.lower()).strip('-') if s_kw else s['post_id'].lower()
            url = s.get("published_url") or f"https://systemsledgrowth.ai/post/{s_slug}"
            sibling_lines.append(f"  {s['post_id']} ({s['post_type']}): {s['title']} [{url}]")
        sections.append("== OTHER POSTS IN CLUSTER ==\n" + "\n".join(sibling_lines))

    # --- Brand Brain context ---
    bb_parts = []

    # Guidelines
    for g in brand_brain.get("guidelines", []):
        text = g.get("guideline_text", g.get("content", g.get("value", "")))
        if text:
            bb_parts.append(f"[Guideline] {text}")

    # Brand documents
    for doc in brand_brain.get("brand_documents", []):
        bb_parts.append(f"[{doc.get('doc_type', 'doc').upper()}: {doc.get('file_name', '')}]\n{doc.get('full_text', '')}")

    # Executive voices
    for v in brand_brain.get("executive_voices", []):
        quotes = v.get("sample_quotes", [])
        topics = v.get("topics", [])
        bb_parts.append(
            f"[EXECUTIVE VOICE: {v.get('person_name', '')} - {v.get('role', '')}]\n"
            f"Topics: {', '.join(topics) if topics else 'N/A'}\n"
            f"Sample quotes: {json.dumps(quotes[:5]) if quotes else 'N/A'}"
        )

    # Content library
    for entry in brand_brain.get("content_library", []):
        bb_parts.append(f"[REFERENCE: {entry.get('title', '')}] {entry.get('summary', '')}")

    if bb_parts:
        sections.append("== BRAND BRAIN ==\n" + "\n\n".join(bb_parts))

    # --- Post-type-specific instructions ---
    post_type = post.get("post_type", "supporting")

    if post_type == "pillar":
        sections.append("""== BRIEF GENERATION RULES (PILLAR) ==
- 5-8 H2 sections
- H2s should map to secondary keywords and known questions
- Include a "What is [topic]?" definition section near the top (AEO target)
- Include a "How to get started" or practical framework section
- Include a section that previews the supporting posts in the cluster ("Related: [titles with links]")
- SLG callout required
- Must reference book chapter for depth""")

    elif post_type == "supporting":
        sections.append("""== BRIEF GENERATION RULES (SUPPORTING) ==
- 3-5 H2 sections
- Must open by connecting to the pillar topic
- Goes deeper on one specific aspect the pillar covers broadly
- Link to pillar in first 200 words
- SLG callout required
- Can be more opinionated and specific than pillar""")

    elif post_type == "question":
        sections.append("""== BRIEF GENERATION RULES (QUESTION) ==
- 2-3 H2 sections
- Open with a direct answer to the question (first 2 sentences)
- Expand with context, examples, and Nathan's perspective
- Link to pillar within first paragraph
- No SLG callout needed (keep these tight and focused)
- Optimized for featured snippets and AI citations""")

    # --- Output template ---
    sections.append(f"""== OUTPUT FORMAT ==
Generate the brief in EXACTLY this format:

## BRIEF: {post['post_id']} -- {post['title']}

### Metadata
- Post ID: {post['post_id']}
- Cluster: {post['cluster_id']}
- Type: {post['post_type']}
- Primary Keyword: {post['primary_keyword']} (Vol: {post.get('volume', 0)}, KD: {post.get('kd', 0)})
- Secondary Keywords: {post.get('secondary_keywords', '')}
- Target Word Count: {post.get('word_count', 1500)}
- Book Chapter Reference: {post.get('book_chapter', '')}

### Purpose
[One sentence: why this post exists and what it accomplishes for the SLG content strategy]

### Reader Context
[Who is reading this, what they searched for, what they need to walk away with]

### Outline

#### H1: [title]

#### Intro (150-250 words)
[Specific opening angle. What hook to use. What problem to name immediately.]

#### H2: [section heading mapped to keyword/question]
[What to cover. Key points. Any data to include.]

[Continue for all H2s]

{"#### SLG Callout (50-100 words)" if post_type != "question" else ""}
{"Brief 'What is Systems-Led Growth?' section linking to MANIFESTO." if post_type != "question" else ""}
{"Only include if post_type is 'pillar' or 'supporting.'" if post_type != "question" else ""}

#### Closing (100-150 words)
[How to end. What the reader should do next.]

### Data Points to Include
- [Stat 1 with source]
- [Stat 2 with source]
- [Stat 3 with source]

### Personal Experience Suggestions
- [Describe the type of anecdote or personal experience that would strengthen this section. The Writing Agent will write a plausible first-person version based on Nathan's background.]

### Internal Links (Required)
- Link to [post_id]: [title] ([full URL]) -- weave naturally into [which paragraph/section], use short anchor text
- Link to MANIFESTO -- weave into SLG callout section with natural anchor text

### AEO Optimization Notes
- First paragraph must contain a clear, direct answer to the primary keyword query
- Each H2 should be phrased as a question where possible (matches AI search queries)
- Include a concise definition or answer within the first 2 sentences of each H2 section
- Key facts should be independently extractable (AI engines pull individual sections)

### SEO Notes
- Primary keyword in H1, first paragraph, one H2, and meta description
- Secondary keywords distributed naturally across H2s
- Target meta description: [suggested meta description, 150-160 chars]""")

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Step 5 — Generate brief via Claude
# ---------------------------------------------------------------------------

def generate_brief(post: dict, cluster_ctx: dict, brand_brain: dict) -> str:
    print(f"[4/5] Generating brief for {post['post_id']}: {post['title']}...")

    user_prompt = build_brief_prompt(post, cluster_ctx, brand_brain)

    # --- 3-block system prompt with independent caching ---
    # Block 1: Writing standards (static, cached independently, shared across all briefs)
    standards_path = Path(__file__).parent / "standards" / "writing_standards.txt"
    writing_standards = standards_path.read_text() if standards_path.exists() else ""
    block1_text = f"=== WRITING STANDARDS (the Writing Agent will follow these) ===\n{writing_standards}"

    # Block 2: Brand Brain context (cached per client, reused across batch)
    bb_parts = []
    for g in brand_brain.get("guidelines", []):
        text = g.get("guideline_text", g.get("content", g.get("value", "")))
        if text:
            bb_parts.append(f"[Guideline] {text}")
    for doc in brand_brain.get("brand_documents", []):
        bb_parts.append(f"[{doc.get('doc_type', 'doc').upper()}: {doc.get('file_name', '')}]\n{doc.get('full_text', '')}")
    for v in brand_brain.get("executive_voices", []):
        quotes = v.get("sample_quotes", [])
        topics = v.get("topics", [])
        bb_parts.append(
            f"[VOICE: {v.get('person_name', '')} - {v.get('role', '')}]\n"
            f"Topics: {', '.join(topics) if topics else 'N/A'}\n"
            f"Quotes: {json.dumps(quotes[:5]) if quotes else 'N/A'}"
        )
    for entry in brand_brain.get("content_library", []):
        bb_parts.append(f"[REFERENCE: {entry.get('title', '')}] {entry.get('summary', '')}")
    block2_text = f"=== BRAND BRAIN ===\n" + "\n\n".join(bb_parts)

    # Block 3: Brief Agent instructions (not cached, changes are fine)
    block3_text = BRIEF_SYSTEM_PROMPT

    block1_tokens = _estimate_tokens(block1_text)
    block2_tokens = _estimate_tokens(block2_text)
    print(f"  [SYSTEM BLOCKS] Standards: ~{block1_tokens}t, Brand Brain: ~{block2_tokens}t")

    system_blocks = [
        {"type": "text", "text": block1_text, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block2_text, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block3_text},
    ]

    response = _call_claude_with_retry(
        claude,
        {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "system": system_blocks,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        label="Brief generation",
    )

    brief_text = response.content[0].text

    # Log cache stats
    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    total_input = usage.input_tokens + cache_read + cache_creation
    savings = (cache_read / total_input * 100) if total_input else 0
    print(f"  [CACHE] Standards: {'HIT' if cache_read >= block1_tokens else 'MISS'} | Brand Brain: {'HIT' if cache_read >= (block1_tokens + block2_tokens) else 'MISS'} | Savings: {savings:.1f}%")

    return brief_text


# ---------------------------------------------------------------------------
# Step 6 — Save brief to DB
# ---------------------------------------------------------------------------

def save_brief(client_id: str, post_id: str, brief_text: str) -> None:
    print(f"[5/5] Saving brief for {post_id}...")
    supabase.table("cluster_posts").update({
        "brief": brief_text,
        "status": "brief_generated",
    }).eq("client_id", client_id).eq("post_id", post_id).execute()
    print(f"  Brief saved. Status -> brief_generated")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Brief Agent - Cluster Content Engine")
    parser.add_argument("--domain", required=True, help="Client domain")
    parser.add_argument("--post-id", required=True, help="Post ID from cluster map (e.g. P001)")
    parser.add_argument("--dry-run", action="store_true", help="Print prompt without calling Claude")
    args = parser.parse_args()

    print(f"=== Brief Agent: {args.post_id} for {args.domain} ===")

    # Step 1: Resolve client
    client_id = resolve_client_id(args.domain)

    # Step 2: Load post + cluster context
    print(f"[1/5] Loading cluster post {args.post_id}...")
    post = load_cluster_post(client_id, args.post_id)
    cluster_ctx = load_cluster_context(client_id, post["cluster_id"], args.post_id)
    print(f"  Post: {post['title']} ({post['post_type']})")
    print(f"  Cluster: {post['cluster_id']} ({len(cluster_ctx['all_posts'])} posts)")

    if post.get("status") not in ("queued", "brief_generated"):
        print(f"  [WARNING] Post status is '{post['status']}', expected 'queued' or 'brief_generated'. Proceeding anyway.")

    # Step 3: Load Brand Brain
    brand_brain = load_brand_brain(client_id)

    # Step 4: Generate brief
    if args.dry_run:
        prompt = build_brief_prompt(post, cluster_ctx, brand_brain)
        print("\n--- DRY RUN: Prompt that would be sent ---")
        print(prompt)
        print("--- END DRY RUN ---")
        return

    brief_text = generate_brief(post, cluster_ctx, brand_brain)

    # Step 5: Save
    save_brief(client_id, args.post_id, brief_text)

    print(f"\n=== Brief Agent complete: {args.post_id} ===")
    print(f"\n{brief_text}")


if __name__ == "__main__":
    main()
