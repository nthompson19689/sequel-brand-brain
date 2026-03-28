#!/usr/bin/env python3
"""
Writing Agent — Cluster-Based Content Engine
Takes an approved brief from cluster_posts and writes the full article.
Follows the brief precisely, applies brand voice rules, and handles
internal link resolution (published URLs vs PENDING:post_id).

Usage:
    python scripts/writing_agent.py --domain systemsledgrowth.ai --post-id P001
    python scripts/writing_agent.py --domain systemsledgrowth.ai --post-id P001 --dry-run
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
# Retry helper
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

# Token budgets
MAX_BRAND_CONTEXT_TOKENS = 12000
BUDGET_VOICE_TONE_MSG = 4000
BUDGET_STYLE_GUIDES = 2000
BUDGET_OTHER_DOCS = 1000
BUDGET_EXEC_VOICES = 2000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def resolve_client_id(domain: str) -> str:
    resp = supabase.table("clients").select("id").eq("domain", domain).limit(1).execute()
    if not resp.data:
        print(f"[ERROR] No client found for domain: {domain}")
        sys.exit(1)
    return resp.data[0]["id"]


def load_cluster_post(client_id: str, post_id: str) -> dict:
    resp = (
        supabase.table("cluster_posts")
        .select("*")
        .eq("client_id", client_id)
        .eq("post_id", post_id)
        .execute()
    )
    if not resp.data:
        print(f"[ERROR] Post {post_id} not found")
        sys.exit(1)
    return resp.data[0]


def load_cluster_link_context(client_id: str, cluster_id: str) -> list[dict]:
    """Load all posts in the cluster for internal link resolution."""
    resp = (
        supabase.table("cluster_posts")
        .select("post_id, title, primary_keyword, published_url, slug, status")
        .eq("client_id", client_id)
        .eq("cluster_id", cluster_id)
        .order("cluster_position")
        .execute()
    )
    return resp.data or []


def load_all_link_targets(client_id: str) -> list[dict]:
    """Load post_id + published_url for all cluster posts (cross-cluster links)."""
    resp = (
        supabase.table("cluster_posts")
        .select("post_id, title, primary_keyword, published_url, slug, cluster_id")
        .eq("client_id", client_id)
        .execute()
    )
    return resp.data or []


def load_writing_standards() -> str:
    path = Path(__file__).parent / "standards" / "writing_standards.txt"
    if path.exists():
        return path.read_text()
    return ""


# ---------------------------------------------------------------------------
# Brand Brain loading (matches writer pattern)
# ---------------------------------------------------------------------------

def load_brand_brain(client_id: str) -> dict:
    print("[2/6] Loading Brand Brain...")

    try:
        guidelines = supabase.table("brand_guidelines").select("*").eq("client_id", client_id).execute().data or []
    except Exception:
        guidelines = []

    try:
        docs_resp = supabase.table("brand_documents").select("file_name, doc_type, full_text").eq("client_id", client_id).execute()
        brand_documents = docs_resp.data or []
    except Exception:
        brand_documents = []

    # Budget enforcement
    vtm_docs = [d for d in brand_documents if d.get("doc_type") in ("voice", "tone", "messaging")]
    style_docs = [d for d in brand_documents if d.get("doc_type") == "style_guide"]
    other_docs = [d for d in brand_documents if d.get("doc_type") not in ("voice", "tone", "messaging", "style_guide")]

    vtm_budget = BUDGET_VOICE_TONE_MSG
    for doc in vtm_docs:
        text = doc.get("full_text", "")
        tokens = _estimate_tokens(text)
        if tokens > vtm_budget:
            doc["full_text"] = _truncate_to_tokens(text, vtm_budget) if vtm_budget > 0 else ""
            vtm_budget = 0
        else:
            vtm_budget -= tokens

    style_budget = BUDGET_STYLE_GUIDES
    for doc in style_docs:
        text = doc.get("full_text", "")
        tokens = _estimate_tokens(text)
        if tokens > style_budget:
            doc["full_text"] = _truncate_to_tokens(text, style_budget) if style_budget > 0 else ""
            style_budget = 0
        else:
            style_budget -= tokens

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

    try:
        voices = supabase.table("executive_voices").select("person_name, role, sample_quotes, topics").eq("client_id", client_id).execute().data or []
    except Exception:
        voices = []

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
# Build internal link reference table
# ---------------------------------------------------------------------------

def _keyword_to_slug(keyword: str) -> str:
    """Convert a keyword to a URL slug: lowercase, hyphens, no special chars."""
    slug = re.sub(r'[^a-z0-9]+', '-', keyword.lower()).strip('-')
    return slug


def build_link_reference(all_posts: list[dict], site_domain: str = "systemsledgrowth.ai", manifesto_url: str = "/manifesto") -> str:
    """Build a link reference table the writer can use for internal links.

    Every post gets a predictable URL based on its primary keyword:
      https://{site_domain}/post/{keyword-slug}

    This means all internal links work immediately, even before publishing.
    If a post is already published and has a different URL, we use the real one.
    """
    lines = ["=== INTERNAL LINK REFERENCE ==="]
    lines.append(f"Every post URL follows the pattern: https://{site_domain}/post/[keyword-slug]")
    lines.append("Use the exact URLs below when the brief specifies internal links.")
    lines.append("These are REAL URLs that will work once published. Use them directly.")
    lines.append("")

    for p in all_posts:
        pid = p["post_id"]
        title = p.get("title", "")
        keyword = p.get("primary_keyword", "")

        # Use published URL if it exists, otherwise generate from keyword
        if p.get("published_url"):
            url = p["published_url"]
        elif p.get("slug"):
            url = f"https://{site_domain}/post/{p['slug']}"
        elif keyword:
            url = f"https://{site_domain}/post/{_keyword_to_slug(keyword)}"
        else:
            url = f"https://{site_domain}/post/{_keyword_to_slug(title)}"

        lines.append(f"  {pid}: {title} [{keyword}] -> {url}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Build the 3-block system prompt
# ---------------------------------------------------------------------------

WRITER_SYSTEM_PROMPT = """You are writing blog posts for Systems-Led Growth (systemsledgrowth.ai), a content property created by Nathan, a Senior AI Solutions Consultant who has built organic search programs, AI content engines, and go-to-market systems for B2B SaaS companies.

You receive a detailed brief for each post. Follow it precisely.

VOICE RULES (from Brand Brain and Tone Samples):
- Direct, conversational, honest. Not polished. Not trying to sound smart.
- Use specific numbers: "Traffic went from 350k to 210k and pipeline went to $3-4M" not "we improved our metrics."
- Mix short punchy sentences with longer explanatory ones.
- One-sentence paragraphs for emphasis.
- Paragraphs should be 2-4 sentences. No walls of text.
- Use structural patterns: setup/flip/proof, short sentence punch, specific numbers as credibility, physical metaphor, self-aware humor, "I did this" not "you should do this."
- Write from Nathan's first-person perspective. Where the brief mentions a personal story or anecdote, write a plausible version based on the context (Nathan's background: ran SEO at Copy.ai scaling B2C-to-B2B, built content engines for SaaS companies, now consults as AI Solutions Consultant). Do NOT leave placeholder brackets like [NATHAN: ...] in the output. The final article must be clean, publishable prose with no placeholders of any kind.

HARD RULES:
- NEVER use em dashes (use commas, parentheses, periods, or sentence breaks)
- NEVER use "leverage," "unlock," "game-changer," "disrupt" without specificity, "AI-powered" as meaningless modifier, "at the end of the day," "in today's landscape," "it's worth noting," "let's dive in"
- NEVER position Nathan as a guru or thought leader. He is a practitioner who documents what he builds.
- NEVER claim Nathan "built Copy.ai's SEO from scratch." Honest framing: "I inherited a site with high B2C traffic from free tools and transitioned it to a B2B engine."
- NEVER use exclamation points in clusters
- NEVER leave placeholder brackets like [NATHAN: ...], [INSERT: ...], [TODO: ...], or any similar markup in the output. The article must be 100% clean and publishable.
- Include all internal links specified in the brief. Use the INTERNAL LINK REFERENCE to get the exact URL for each post.
- Every post has a predictable URL based on its keyword slug (e.g. /post/keyword-slug). Use these real URLs directly. No placeholder links.
- Include all data points from the brief with their sources.

INTERNAL LINKING RULES:
- Weave internal links naturally THROUGHOUT the article body, not just at the end of sections.
- Use short, natural anchor text (2-4 words) that fits the sentence flow.
- GOOD: "Most teams skip [content-led growth](https://...) entirely and wonder why paid ads plateau."
- GOOD: "That's where [building a cluster strategy](https://...) changes the math."
- BAD: "For more on this topic, read our guide on content-led growth for SaaS teams." (full sentence, end of section)
- BAD: "Related: [Content-Led Growth: The Complete Guide for B2B SaaS Teams](https://...)" (full title as anchor)
- Links should feel invisible. The reader shouldn't notice they're being linked somewhere.
- Distribute links across the full article. Do not cluster them in intro or outro.

HEADING STRUCTURE:
- Use ## for major H2 section headings.
- Use ### for H3 subheadings within H2 sections where the section covers multiple distinct sub-points.
- Every H2 section with 300+ words should have at least one ### sub-heading to break up the content.
- H3s should be specific and descriptive, not generic ("Why It Matters" is bad, "Why Pipeline Velocity Drops Without Intent Data" is good).

OUTPUT FORMAT:
- First line: META: [150-160 char meta description]
- Second line: SLUG: [suggested-url-slug]
- Then the full article in markdown. Nothing else after the article ends. No summaries, no link lists, no appendices."""


def build_brand_brain_block(brand_brain: dict) -> str:
    """Build the Brand Brain text block (Block 2) from loaded data."""
    parts = []

    # Guidelines
    for g in brand_brain.get("guidelines", []):
        text = g.get("guideline_text", g.get("content", g.get("value", "")))
        if text:
            parts.append(f"[Guideline] {_truncate_to_tokens(text, 2000)}")

    # Brand documents (already budget-truncated)
    vtm = ""
    styles = ""
    other = ""
    for doc in brand_brain.get("brand_documents", []):
        dt = doc.get("doc_type", "document")
        chunk = f"[{dt}: {doc.get('file_name', '')}]\n{doc.get('full_text', '')}\n"
        if dt in ("voice", "tone", "messaging"):
            vtm += chunk
        elif dt == "style_guide":
            styles += chunk
        else:
            other += chunk

    if vtm:
        parts.append(f"=== BRAND VOICE & TONE ===\n{vtm}")
    if styles:
        parts.append(f"=== STYLE GUIDES ===\n{styles}")
    if other:
        parts.append(f"=== ADDITIONAL BRAND DOCUMENTS ===\n{other}")

    # Executive voices
    exec_budget = BUDGET_EXEC_VOICES
    exec_parts = []
    for v in brand_brain.get("executive_voices", []):
        chunk = f"[Voice: {v.get('person_name', '')} - {v.get('role', '')}]\n"
        quotes = v.get("sample_quotes", [])
        if quotes:
            chunk += "Sample quotes:\n" + "".join(f'  - "{q}"\n' for q in quotes[:5])
        topics = v.get("topics", [])
        if topics:
            chunk += f"Topics: {', '.join(topics)}\n"
        tokens = _estimate_tokens(chunk)
        if tokens <= exec_budget:
            exec_parts.append(chunk)
            exec_budget -= tokens
    if exec_parts:
        parts.append(f"=== EXECUTIVE VOICES ===\nMatch these voices when relevant:\n{''.join(exec_parts)}")

    # Content library
    lib_parts = []
    for entry in brand_brain.get("content_library", []):
        s = entry.get("summary", "")
        if s:
            lib_parts.append(f"[Reference: {entry.get('title', '')}] {s}")
    if lib_parts:
        parts.append(f"=== CONTENT LIBRARY ===\n" + "\n".join(lib_parts))

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Write the article
# ---------------------------------------------------------------------------

def write_article(post: dict, brand_brain: dict, link_ref: str) -> str:
    print(f"[4/6] Writing article for {post['post_id']}: {post['title']}...")

    brief = post.get("brief", "")
    if not brief:
        print("[ERROR] No brief found for this post. Generate and approve a brief first.")
        sys.exit(1)

    # Block 1: Writing standards (static, cached)
    standards_text = load_writing_standards()
    block1_text = f"=== GLOBAL WRITING STANDARDS ===\n{standards_text}"
    block1_tokens = _estimate_tokens(block1_text)

    # Block 2: Brand Brain (cached per client)
    brain_text = build_brand_brain_block(brand_brain)
    block2_text = f"=== BRAND BRAIN ===\n{brain_text}"
    block2_tokens = _estimate_tokens(block2_text)

    # Block 3: Writer instructions + link reference (not cached)
    block3_text = f"{WRITER_SYSTEM_PROMPT}\n\n{link_ref}"

    system_blocks = [
        {"type": "text", "text": block1_text, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block2_text, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block3_text},
    ]

    # Build user prompt with the brief
    user_prompt = f"""Write the full article based on this approved brief. Follow it precisely.

=== APPROVED BRIEF ===
{brief}

=== REMINDERS ===
- Target word count: {post.get('word_count', 1500)} words
- Primary keyword: {post['primary_keyword']}
- Secondary keywords: {post.get('secondary_keywords', '')}
- Post type: {post['post_type']}
- Follow every section in the brief outline
- Include all data points listed in the brief
- Include all internal links specified, using URLs from the INTERNAL LINK REFERENCE
- Weave internal links naturally throughout the body with short anchor text. Do NOT cluster them at section ends.
- Use ### H3 subheadings within longer H2 sections
- Write all anecdotes and personal stories as clean first-person prose. NO placeholder brackets.
- No em dashes anywhere
- No banned phrases
- First line of output: META: [meta description]
- Second line: SLUG: [url-slug]
- Then the full markdown article
- DO NOT include any INTERNAL_LINKS_SUMMARY, appendix, or anything after the article ends"""

    print(f"  [TOKEN BUDGET] Standards: ~{block1_tokens}, Brand Brain: ~{block2_tokens}")

    response = _call_claude_with_retry(
        claude,
        {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 8000,
            "system": system_blocks,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        label="write_article",
    )

    # Log cache stats
    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    total_input = usage.input_tokens + cache_read + cache_creation
    savings = (cache_read / total_input * 100) if total_input else 0
    print(f"  [CACHE] Input: {total_input} | Cached: {cache_read} | Output: {usage.output_tokens} | Savings: {savings:.1f}%")

    article_text = ""
    for block in response.content:
        if block.type == "text":
            article_text += block.text

    return article_text


# ---------------------------------------------------------------------------
# Parse and save the draft
# ---------------------------------------------------------------------------

def parse_and_save(client_id: str, post: dict, raw_article: str) -> None:
    post_id = post["post_id"]
    print(f"[5/6] Parsing and saving draft for {post_id}...")

    lines = raw_article.strip().split("\n")

    # Parse META and SLUG lines
    meta_description = ""
    slug = ""
    body_start_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.upper().startswith("META:"):
            meta_description = stripped[5:].strip()
        elif stripped.upper().startswith("SLUG:"):
            slug = stripped[5:].strip()
            body_start_idx = i + 1
            break

    # Split body from internal links summary
    body_lines = []
    links_summary = ""
    in_links_summary = False
    for line in lines[body_start_idx:]:
        if line.strip().startswith("INTERNAL_LINKS_SUMMARY"):
            in_links_summary = True
            continue
        if in_links_summary:
            links_summary += line + "\n"
        else:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()
    word_count = len(body.split())

    target = post.get("word_count", 1500)
    if word_count < target * 0.9:
        print(f"  [WARNING] Article is {word_count} words, target was {target}. May need revision.")
    else:
        print(f"  Word count: {word_count} (target: {target})")

    # Save cleaned body (no META/SLUG lines, no INTERNAL_LINKS_SUMMARY)
    # But prepend META and SLUG so the publish endpoint can parse them
    clean_draft = f"META: {meta_description}\nSLUG: {slug}\n\n{body}"

    update_data = {
        "draft": clean_draft,
        "slug": slug,
        "meta_description": meta_description,
        "status": "editing",
    }
    supabase.table("cluster_posts").update(update_data).eq("client_id", client_id).eq("post_id", post_id).execute()
    print(f"  Draft saved. Status -> editing")


# ---------------------------------------------------------------------------
# Validate draft against hard rules
# ---------------------------------------------------------------------------

def validate_draft(raw_article: str) -> list[str]:
    """Quick check for hard rule violations. Returns list of warnings."""
    print("[6/6] Validating draft against hard rules...")
    warnings = []

    # Em dash check
    em_dash_count = raw_article.count("\u2014") + raw_article.count("--")
    if em_dash_count > 0:
        warnings.append(f"Found {em_dash_count} em dashes (banned)")

    # Banned phrases
    banned = [
        "leverage", "unlock", "game-changer", "at the end of the day",
        "in today's landscape", "it's worth noting", "let's dive in",
        "in conclusion", "it's no secret", "paradigm shift",
    ]
    for phrase in banned:
        if phrase.lower() in raw_article.lower():
            warnings.append(f"Banned phrase found: '{phrase}'")

    # Exclamation clusters
    excl_matches = re.findall(r'!.*?!', raw_article)
    if len(excl_matches) > 0:
        warnings.append(f"Found {len(excl_matches)} exclamation clusters")

    # NATHAN placeholders present
    nathan_count = len(re.findall(r'\[NATHAN:', raw_article))
    if nathan_count > 0:
        print(f"  [INFO] {nathan_count} [NATHAN:] placeholder(s) for Nathan to fill")

    if warnings:
        for w in warnings:
            print(f"  [WARNING] {w}")
    else:
        print("  All hard rule checks passed")

    return warnings


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Writing Agent - Cluster Content Engine")
    parser.add_argument("--domain", required=True, help="Client domain")
    parser.add_argument("--post-id", required=True, help="Post ID from cluster map (e.g. P001)")
    parser.add_argument("--dry-run", action="store_true", help="Print prompt info without calling Claude")
    args = parser.parse_args()

    print(f"=== Writing Agent: {args.post_id} for {args.domain} ===")

    # Step 1: Resolve client
    client_id = resolve_client_id(args.domain)

    # Step 2: Load post
    print(f"[1/6] Loading cluster post {args.post_id}...")
    post = load_cluster_post(client_id, args.post_id)
    print(f"  Post: {post['title']} ({post['post_type']})")
    print(f"  Status: {post['status']}")

    if post.get("status") != "brief_approved":
        print(f"  [WARNING] Post status is '{post['status']}', expected 'brief_approved'. Proceeding anyway.")

    if not post.get("brief"):
        print("[ERROR] No brief found. Generate and approve a brief first.")
        sys.exit(1)

    # Step 3: Load Brand Brain
    brand_brain = load_brand_brain(client_id)

    # Step 4: Build link reference from all cluster posts
    print("[3/6] Building internal link reference...")
    all_posts = load_all_link_targets(client_id)
    link_ref = build_link_reference(all_posts, site_domain=args.domain)
    published_count = sum(1 for p in all_posts if p.get("published_url"))
    pending_count = len(all_posts) - published_count
    print(f"  {len(all_posts)} total posts: {published_count} published, {pending_count} with predicted URLs")

    if args.dry_run:
        print("\n--- DRY RUN ---")
        print(f"Would write article for: {post['post_id']} - {post['title']}")
        print(f"Brief length: {len(post.get('brief', ''))} chars")
        print(f"Link reference entries: {len(all_posts)}")
        print("--- END DRY RUN ---")
        return

    # Step 5: Write article
    # Update status to 'writing'
    supabase.table("cluster_posts").update({"status": "writing"}).eq("client_id", client_id).eq("post_id", args.post_id).execute()

    raw_article = write_article(post, brand_brain, link_ref)

    # Step 6: Parse, validate, and save
    parse_and_save(client_id, post, raw_article)
    warnings = validate_draft(raw_article)

    print(f"\n=== Writing Agent complete: {args.post_id} ===")
    if warnings:
        print(f"  {len(warnings)} warning(s) found. Editor Agent will address these.")


if __name__ == "__main__":
    main()
