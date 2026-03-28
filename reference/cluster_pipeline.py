#!/usr/bin/env python3
"""
Cluster Pipeline — Full Brief → Write → Edit in one pass.
Loads Brand Brain ONCE, runs all three agent phases per post, keeps
prompt cache hot across the entire batch.

Usage:
    # Single post
    python scripts/cluster_pipeline.py --domain systemsledgrowth.ai --post-id P001

    # All queued posts (pillars first)
    python scripts/cluster_pipeline.py --domain systemsledgrowth.ai --all

    # Specific post type only
    python scripts/cluster_pipeline.py --domain systemsledgrowth.ai --all --type pillar
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
import requests as http_requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _call_claude_with_retry(client, create_kwargs, label="API call", max_retries=5):
    retryable = (429, 500, 502, 503, 529)
    for attempt in range(1, max_retries + 1):
        try:
            return client.messages.create(**create_kwargs)
        except anthropic.APIStatusError as exc:
            status = exc.status_code
            if status not in retryable or attempt == max_retries:
                raise
            base_wait = 30 * attempt if status == 529 else 2 ** attempt
            jitter = _random.uniform(0, base_wait * 0.25)
            print(f"  [RETRY] {label}: HTTP {status}, waiting {base_wait + jitter:.0f}s (attempt {attempt}/{max_retries})")
            _time.sleep(base_wait + jitter)


def _est(text): return len(text) // 4
def _trunc(text, max_t):
    mc = max_t * 4
    return text if len(text) <= mc else text[:mc] + "..."
def _slug(keyword): return re.sub(r'[^a-z0-9]+', '-', keyword.lower()).strip('-')


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Token budgets (writer-level for brief+write, editor-level for edit)
W_BUDGET_VTM = 4000
W_BUDGET_STYLE = 2000
W_BUDGET_OTHER = 1000
W_BUDGET_EXEC = 2000
W_MAX = 12000

E_BUDGET_VTM = 2000
E_BUDGET_STYLE = 1000
E_BUDGET_OTHER = 500
E_BUDGET_EXEC = 1000
E_MAX = 6000


# ---------------------------------------------------------------------------
# Load Brand Brain (two versions: writer budget and editor budget)
# ---------------------------------------------------------------------------

def _load_docs(client_id):
    try:
        return sb.table("brand_documents").select("file_name, doc_type, full_text").eq("client_id", client_id).execute().data or []
    except Exception:
        return []

def _load_voices(client_id):
    try:
        return sb.table("executive_voices").select("person_name, role, sample_quotes, topics").eq("client_id", client_id).execute().data or []
    except Exception:
        return []

def _load_guidelines(client_id):
    try:
        return sb.table("brand_guidelines").select("*").eq("client_id", client_id).execute().data or []
    except Exception:
        return []

def _load_library(client_id):
    try:
        lib = sb.table("content_library").select("title, source_url, summary").eq("client_id", client_id).execute().data or []
        for e in lib:
            s = e.get("summary", "")
            if len(s) > 500: e["summary"] = s[:500] + "..."
        return lib
    except Exception:
        return []


def _budget_docs(docs, vtm_max, style_max, other_max, total_max, exec_max):
    """Apply token budgets to brand docs. Returns filtered list."""
    vtm = [d for d in docs if d.get("doc_type") in ("voice", "tone", "messaging")]
    style = [d for d in docs if d.get("doc_type") == "style_guide"]
    other = [d for d in docs if d.get("doc_type") not in ("voice", "tone", "messaging", "style_guide")]

    vtm_left = vtm_max
    for d in vtm:
        t = _est(d.get("full_text", ""))
        if t > vtm_left:
            d["full_text"] = _trunc(d["full_text"], vtm_left) if vtm_left > 0 else ""
            vtm_left = 0
        else:
            vtm_left -= t

    style_left = style_max
    for d in style:
        t = _est(d.get("full_text", ""))
        if t > style_left:
            d["full_text"] = _trunc(d["full_text"], style_left) if style_left > 0 else ""
            style_left = 0
        else:
            style_left -= t

    vtm_used = vtm_max - vtm_left
    style_used = style_max - style_left
    other_cap = total_max - vtm_used - style_used - exec_max
    other_used = 0
    for d in other:
        tr = _trunc(d.get("full_text", ""), other_max)
        t = _est(tr)
        if other_used + t > other_cap:
            d["full_text"] = ""
        else:
            d["full_text"] = tr
            other_used += t

    return [d for d in vtm + style + other if d.get("full_text")]


def build_brain_text(docs, voices, guidelines, library):
    """Build Brand Brain text block from components."""
    parts = []
    for g in guidelines:
        text = g.get("guideline_text", g.get("content", g.get("value", "")))
        if text: parts.append(f"[Guideline] {_trunc(text, 2000)}")

    vtm, styles, other = "", "", ""
    for d in docs:
        dt = d.get("doc_type", "document")
        chunk = f"[{dt}: {d.get('file_name', '')}]\n{d.get('full_text', '')}\n"
        if dt in ("voice", "tone", "messaging"): vtm += chunk
        elif dt == "style_guide": styles += chunk
        else: other += chunk
    if vtm: parts.append(f"=== BRAND VOICE & TONE ===\n{vtm}")
    if styles: parts.append(f"=== STYLE GUIDES ===\n{styles}")
    if other: parts.append(f"=== ADDITIONAL BRAND DOCUMENTS ===\n{other}")

    exec_parts = []
    for v in voices:
        chunk = f"[Voice: {v.get('person_name', '')} - {v.get('role', '')}]\n"
        quotes = v.get("sample_quotes", [])
        if quotes: chunk += "".join(f'  - "{q}"\n' for q in quotes[:5])
        topics = v.get("topics", [])
        if topics: chunk += f"Topics: {', '.join(topics)}\n"
        exec_parts.append(chunk)
    if exec_parts: parts.append(f"=== EXECUTIVE VOICES ===\n{''.join(exec_parts)}")

    for e in library:
        s = e.get("summary", "")
        if s: parts.append(f"[Reference: {e.get('title', '')}] {s}")

    return "\n\n".join(parts)


def load_writing_standards():
    p = Path(__file__).parent / "standards" / "writing_standards.txt"
    return p.read_text() if p.exists() else ""


# ---------------------------------------------------------------------------
# Resolve helpers
# ---------------------------------------------------------------------------

def resolve_client(domain):
    r = sb.table("clients").select("id").eq("domain", domain).limit(1).execute()
    if not r.data:
        print(f"[ERROR] No client for domain: {domain}")
        sys.exit(1)
    return r.data[0]["id"]


def load_post(client_id, post_id):
    r = sb.table("cluster_posts").select("*").eq("client_id", client_id).eq("post_id", post_id).execute()
    if not r.data:
        print(f"[ERROR] Post {post_id} not found")
        sys.exit(1)
    return r.data[0]


def load_queue(client_id, post_type=""):
    q = sb.table("cluster_posts").select("post_id, post_type, title, status, cluster_position").eq("client_id", client_id).in_("status", ["queued", "brief_generated", "brief_approved", "editing"]).order("cluster_position").order("cluster_id")
    if post_type:
        q = q.eq("post_type", post_type)
    return [p["post_id"] for p in (q.execute().data or [])]


def load_all_posts(client_id):
    return sb.table("cluster_posts").select("post_id, title, primary_keyword, published_url, slug, cluster_id").eq("client_id", client_id).execute().data or []


def load_cluster_siblings(client_id, cluster_id, exclude_pid):
    r = sb.table("cluster_posts").select("post_id, post_type, title, primary_keyword, status, published_url, cluster_position").eq("client_id", client_id).eq("cluster_id", cluster_id).order("cluster_position").execute()
    posts = r.data or []
    pillar = next((p for p in posts if p["post_type"] == "pillar"), None)
    siblings = [p for p in posts if p["post_id"] != exclude_pid]
    return pillar, siblings


# ---------------------------------------------------------------------------
# PHASE 1: Brief
# ---------------------------------------------------------------------------

BRIEF_SYSTEM = """You are a content strategist for Systems-Led Growth (SLG), a framework for building AI-augmented go-to-market systems for skeleton-crew SaaS teams.

Generate a detailed writing brief. Include:
- Purpose, reader context, full H2/H3 outline with word targets
- Data points with sources, personal experience suggestions (describe the type of story, do NOT use [NATHAN:] brackets)
- Internal links with full URLs and where to weave them naturally (short anchor text, throughout the body)
- AEO and SEO notes

RULES:
- No em dashes
- No [NATHAN:] or any bracket placeholders
- Specify H3 sub-headings within longer H2 sections
- Internal links must be woven throughout, not clustered at section ends"""


def phase_brief(post, pillar, siblings, brain_text, standards, system_blocks_brief, domain):
    """Generate brief. Returns brief text."""
    pid = post["post_id"]
    print(f"  [BRIEF] Generating brief for {pid}...")

    # Build cluster context
    cluster_ctx = ""
    if pillar:
        pk = pillar.get("primary_keyword", "")
        p_url = pillar.get("published_url") or f"https://{domain}/post/{_slug(pk)}"
        cluster_ctx += f"\nCluster Pillar: {pillar['post_id']}: {pillar['title']} -> {p_url}"
    for s in siblings:
        sk = s.get("primary_keyword", "")
        s_url = s.get("published_url") or f"https://{domain}/post/{_slug(sk)}"
        cluster_ctx += f"\n  {s['post_id']} ({s['post_type']}): {s['title']} -> {s_url}"

    user_prompt = f"""Generate a writing brief for this post:

Post ID: {post['post_id']}
Cluster: {post['cluster_id']}
Type: {post['post_type']}
Title: {post['title']}
Primary Keyword: {post['primary_keyword']} (Vol: {post.get('volume', 0)}, KD: {post.get('kd', 0)})
Secondary Keywords: {post.get('secondary_keywords', '')}
Target Word Count: {post.get('word_count', 1500)}
Book Chapter: {post.get('book_chapter', '')}
Links To: {post.get('links_to', '')}
Links From: {post.get('links_from', '')}
{cluster_ctx}"""

    resp = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "system": system_blocks_brief,
        "messages": [{"role": "user", "content": user_prompt}],
    }, label=f"brief_{pid}")

    brief = resp.content[0].text
    usage = resp.usage
    cr = getattr(usage, "cache_read_input_tokens", 0) or 0
    ti = usage.input_tokens + cr + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
    print(f"  [BRIEF] Done. Cache savings: {(cr/ti*100) if ti else 0:.0f}%")

    sb.table("cluster_posts").update({"brief": brief, "status": "brief_approved"}).eq("client_id", post["client_id"]).eq("post_id", pid).execute()
    return brief


# ---------------------------------------------------------------------------
# PHASE 2: Write
# ---------------------------------------------------------------------------

WRITER_SYSTEM = """You are writing blog posts for Systems-Led Growth (systemsledgrowth.ai), created by Nathan, a Senior AI Solutions Consultant who built organic search programs and AI content engines for B2B SaaS.

Follow the brief precisely.

VOICE: Direct, conversational, honest. Specific numbers. Short punchy sentences mixed with longer ones. 2-4 sentence paragraphs. First-person practitioner perspective.

HARD RULES:
- No em dashes, no banned filler phrases, no exclamation clusters
- No [NATHAN:], [INSERT:], [TODO:] or any placeholder brackets. Write clean publishable prose.
- Write personal anecdotes as plausible first-person stories based on Nathan's background.
- Internal links: 2-4 word natural anchor text woven throughout. NOT full sentences at section ends.
- Use ### H3 sub-headings within H2 sections over 300 words.
- Output: META: line, SLUG: line, then full markdown article. Nothing after the article ends."""


def phase_write(post, brief, link_ref, system_blocks_write):
    """Write article from brief. Returns clean draft text."""
    pid = post["post_id"]
    print(f"  [WRITE] Writing draft for {pid}...")

    sb.table("cluster_posts").update({"status": "writing"}).eq("client_id", post["client_id"]).eq("post_id", pid).execute()

    user_prompt = f"""Write the full article based on this approved brief.

=== APPROVED BRIEF ===
{brief}

=== REMINDERS ===
- Target: {post.get('word_count', 1500)} words | Keyword: {post['primary_keyword']} | Type: {post['post_type']}
- Use URLs from the INTERNAL LINK REFERENCE for all internal links
- No placeholders, no INTERNAL_LINKS_SUMMARY, no appendix
- META: line first, SLUG: line second, then article"""

    resp = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8000,
        "system": system_blocks_write,
        "messages": [{"role": "user", "content": user_prompt}],
    }, label=f"write_{pid}")

    raw = resp.content[0].text
    usage = resp.usage
    cr = getattr(usage, "cache_read_input_tokens", 0) or 0
    ti = usage.input_tokens + cr + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
    print(f"  [WRITE] Done. Cache savings: {(cr/ti*100) if ti else 0:.0f}%")

    # Parse out META, SLUG, strip any trailing summary
    lines = raw.strip().split("\n")
    meta, slug, body_start = "", "", 0
    for i, l in enumerate(lines):
        s = l.strip()
        if s.upper().startswith("META:"): meta = s[5:].strip()
        elif s.upper().startswith("SLUG:"):
            slug = s[5:].strip()
            body_start = i + 1
            break

    body_lines = []
    for l in lines[body_start:]:
        if l.strip().startswith("INTERNAL_LINKS_SUMMARY"): break
        body_lines.append(l)
    body = "\n".join(body_lines).strip()

    if not slug:
        slug = _slug(post["primary_keyword"])

    clean_draft = f"META: {meta}\nSLUG: {slug}\n\n{body}"
    wc = len(body.split())
    print(f"  [WRITE] {wc} words, slug: {slug}")

    sb.table("cluster_posts").update({
        "draft": clean_draft, "slug": slug, "meta_description": meta, "status": "editing"
    }).eq("client_id", post["client_id"]).eq("post_id", pid).execute()

    return clean_draft


# ---------------------------------------------------------------------------
# PHASE 3: Edit
# ---------------------------------------------------------------------------

BANNED_PHRASES = [
    "in today's rapidly evolving", "it's no secret that", "at the end of the day",
    "let's dive in", "leverage", "synergy", "game-changer", "paradigm shift",
    "robust", "cutting-edge", "best-in-class", "holistic", "streamline",
    "empower", "revolutionize", "transformative", "disruptive",
    "unlock the power", "harness the potential", "navigate the complexities",
    "in conclusion", "it's worth noting", "in today's landscape",
]

EDITOR_SYSTEM = (
    "You are a senior editor for Systems-Led Growth. Enforce brand voice and hard rules ruthlessly.\n\n"
    "HIGH SEVERITY: em dashes, colons in headings, 'it's not X it's Y' patterns, filler phrases, "
    "placeholder brackets ([NATHAN:] etc.), INTERNAL_LINKS_SUMMARY sections, broken external links.\n\n"
    "MEDIUM SEVERITY: links clustered at section ends (should be woven throughout), "
    "full-sentence anchor text (should be 2-4 words), missing FAQ, <2 internal links, <2 external citations.\n\n"
    "LOW SEVERITY: H2 sections over 300 words without H3 sub-headings, generic H3 headings.\n\n"
    "For the CLEAN version: fix everything, remove all markup, output clean publishable article "
    "starting with META: and SLUG: lines. Nothing after the article ends."
)


def _detect_banned(text):
    violations = []
    for m in re.finditer(r"[\u2014\u2013]", text):
        violations.append(f"Em/en dash at position {m.start()}")
    for m in re.finditer(r"^(#{1,6}\s+.+:.+)$", text, re.MULTILINE):
        violations.append(f"Colon in heading: {m.group(1)[:60]}")
    tl = text.lower()
    for p in BANNED_PHRASES:
        if p.lower() in tl:
            violations.append(f"Banned phrase: \"{p}\"")
    for m in re.findall(r'\[(NATHAN|INSERT|TODO|PLACEHOLDER):[^\]]*\]', text, re.IGNORECASE):
        violations.append(f"Placeholder bracket: [{m}:...]")
    if "INTERNAL_LINKS_SUMMARY" in text:
        violations.append("Contains INTERNAL_LINKS_SUMMARY (must be removed)")
    return violations


def _check_external_links(text):
    links = re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', text)
    external = [(a, u) for a, u in links if "systemsledgrowth" not in u]
    broken = []
    for anchor, url in external:
        try:
            r = http_requests.head(url, timeout=8, allow_redirects=True,
                                   headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
            if r.status_code >= 400:
                broken.append(f"HTTP {r.status_code}: [{anchor}]({url})")
        except Exception as e:
            broken.append(f"{str(e)[:30]}: [{anchor}]({url})")
    return broken


def phase_edit(post, draft, system_blocks_edit):
    """Edit draft with 2-call pipeline (violations + clean). Returns edited text."""
    pid = post["post_id"]
    print(f"  [EDIT] Editing {pid}...")

    # Pre-checks
    banned = _detect_banned(draft)
    broken = _check_external_links(draft)
    if banned:
        print(f"  [EDIT] {len(banned)} banned patterns found")
    if broken:
        print(f"  [EDIT] {len(broken)} broken external links")

    pre_issues = "\n".join(f"- {v}" for v in banned + broken) if (banned or broken) else "None found."

    # Call 1: Find violations + annotate
    resp1 = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 6000,
        "system": system_blocks_edit,
        "messages": [{"role": "user", "content":
            f"Review and annotate this article. Mark every violation inline with "
            f"[EDIT (severity): 'original' -> 'fix' | Rule: name]. "
            f"Then add ## SECOND PASS CATCHES for anything missed.\n\n"
            f"PRE-DETECTED ISSUES:\n{pre_issues}\n\n"
            f"--- ARTICLE ---\n{draft}"
        }],
    }, label=f"edit1_{pid}")

    annotated = resp1.content[0].text
    cr = getattr(resp1.usage, "cache_read_input_tokens", 0) or 0
    ti = resp1.usage.input_tokens + cr + (getattr(resp1.usage, "cache_creation_input_tokens", 0) or 0)
    print(f"  [EDIT] Violations found. Cache: {(cr/ti*100) if ti else 0:.0f}%")

    # Call 2: Clean final version
    resp2 = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8000,
        "system": system_blocks_edit,
        "messages": [{"role": "user", "content":
            f"Produce the clean final version from this annotated article:\n"
            f"- Apply ALL edits including second pass catches\n"
            f"- Remove all annotation markup\n"
            f"- Rewrite any placeholder brackets as clean prose\n"
            f"- Remove INTERNAL_LINKS_SUMMARY if present\n"
            f"- Fix internal link anchor text (2-4 words, woven naturally)\n"
            f"- Add H3 sub-headings in long H2 sections\n"
            f"- Remove or replace broken external links\n"
            f"- Keep META: and SLUG: at top. Nothing after article ends.\n\n"
            f"--- ANNOTATED ---\n{annotated}"
        }],
    }, label=f"edit2_{pid}")

    clean = resp2.content[0].text
    cr2 = getattr(resp2.usage, "cache_read_input_tokens", 0) or 0
    ti2 = resp2.usage.input_tokens + cr2 + (getattr(resp2.usage, "cache_creation_input_tokens", 0) or 0)
    print(f"  [EDIT] Clean version done. Cache: {(cr2/ti2*100) if ti2 else 0:.0f}%")

    # Post-validation
    remaining = _detect_banned(clean)
    wc = len(clean.split())

    # Quality score
    gates = 0
    total_gates = 5
    if not remaining: gates += 1
    if re.search(r"^#{1,3}\s+.*FAQ", clean, re.MULTILINE | re.IGNORECASE): gates += 1
    internal = [u for _, u in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', clean) if "systemsledgrowth" in u]
    external = [u for _, u in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', clean) if u.startswith("http") and "systemsledgrowth" not in u]
    if len(internal) >= 2: gates += 1
    if len(external) >= 2: gates += 1
    target = post.get("word_count", 1500)
    if wc >= target * 0.9: gates += 1

    score = f"{int(gates/total_gates*100)}% ({gates}/{total_gates} gates)"
    status = "review" if not remaining else "editing"

    notes = f"Words: {wc} | Quality: {score}"
    if remaining:
        notes += f"\nRemaining issues: {len(remaining)}"
        for r_item in remaining[:5]:
            notes += f"\n  - {r_item}"

    print(f"  [EDIT] {wc} words | {score} | Status -> {status}")

    sb.table("cluster_posts").update({
        "edited_draft": clean,
        "editor_notes": notes,
        "quality_score": score,
        "status": status,
    }).eq("client_id", post["client_id"]).eq("post_id", pid).execute()

    return clean


# ---------------------------------------------------------------------------
# Main — orchestrate full pipeline
# ---------------------------------------------------------------------------

def run_post(client_id, post_id, domain, all_posts,
             system_blocks_brief, system_blocks_write, system_blocks_edit):
    """Run full Brief → Write → Edit for one post."""
    post = load_post(client_id, post_id)
    post["client_id"] = client_id
    print(f"\n{'='*60}")
    print(f"PIPELINE: {post_id} | {post['title']} ({post['post_type']})")
    print(f"{'='*60}")

    # Load cluster context
    pillar, siblings = load_cluster_siblings(client_id, post["cluster_id"], post_id)

    # Build link reference
    link_lines = [f"=== INTERNAL LINK REFERENCE ===",
                  f"URL pattern: https://{domain}/post/[keyword-slug]", ""]
    for p in all_posts:
        kw = p.get("primary_keyword", "")
        url = p.get("published_url") or f"https://{domain}/post/{_slug(kw) if kw else _slug(p.get('title', ''))}"
        link_lines.append(f"  {p['post_id']}: {p['title']} -> {url}")
    link_ref = "\n".join(link_lines)

    # Phase 1: Brief (skip if already approved)
    if post.get("status") in ("brief_approved", "writing", "editing", "review") and post.get("brief"):
        print(f"  [BRIEF] Already approved, skipping")
        brief = post["brief"]
    else:
        raw_docs = _load_docs(client_id)
        writer_docs = _budget_docs(list(raw_docs), W_BUDGET_VTM, W_BUDGET_STYLE, W_BUDGET_OTHER, W_MAX, W_BUDGET_EXEC)
        brain = build_brain_text(writer_docs, _load_voices(client_id), _load_guidelines(client_id), _load_library(client_id))
        brief = phase_brief(post, pillar, siblings, brain, load_writing_standards(), system_blocks_brief, domain)

    # Phase 2: Write (skip if already has draft and is past writing)
    if post.get("status") in ("editing", "review") and post.get("draft"):
        print(f"  [WRITE] Already drafted, skipping")
        draft = post["draft"]
    else:
        draft = phase_write(post, brief, link_ref, system_blocks_write)

    # Phase 3: Edit
    edited = phase_edit(post, draft, system_blocks_edit)

    print(f"  COMPLETE: {post_id} -> ready for review")
    return True


def main():
    parser = argparse.ArgumentParser(description="Cluster Pipeline — Brief + Write + Edit")
    parser.add_argument("--domain", required=True)
    parser.add_argument("--post-id", default=None, help="Single post ID")
    parser.add_argument("--all", action="store_true", help="Run all queued posts")
    parser.add_argument("--type", default="", help="Filter by post type (pillar/supporting/question)")
    args = parser.parse_args()

    client_id = resolve_client(args.domain)
    all_posts = load_all_posts(client_id)

    # Get post IDs to process
    if args.post_id:
        post_ids = [args.post_id]
    elif args.all:
        post_ids = load_queue(client_id, args.type)
    else:
        print("[ERROR] Specify --post-id or --all")
        sys.exit(1)

    if not post_ids:
        print("No posts to process.")
        return

    print(f"\n{'#'*60}")
    print(f"CLUSTER PIPELINE: {len(post_ids)} posts for {args.domain}")
    print(f"{'#'*60}")

    # Pre-build system blocks (shared across all posts for cache efficiency)
    standards = load_writing_standards()
    raw_docs = _load_docs(client_id)
    voices = _load_voices(client_id)
    guidelines = _load_guidelines(client_id)
    library = _load_library(client_id)

    # Writer-budget brain (for brief + write)
    w_docs = _budget_docs(list(raw_docs), W_BUDGET_VTM, W_BUDGET_STYLE, W_BUDGET_OTHER, W_MAX, W_BUDGET_EXEC)
    w_brain = build_brain_text(w_docs, voices, guidelines, library)

    # Editor-budget brain (for edit)
    e_docs = _budget_docs(list(raw_docs), E_BUDGET_VTM, E_BUDGET_STYLE, E_BUDGET_OTHER, E_MAX, E_BUDGET_EXEC)
    e_brain = build_brain_text(e_docs, voices, guidelines, library)

    block1 = f"=== GLOBAL WRITING STANDARDS ===\n{standards}"

    system_blocks_brief = [
        {"type": "text", "text": block1, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": f"=== BRAND BRAIN ===\n{w_brain}", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": BRIEF_SYSTEM},
    ]
    system_blocks_write = [
        {"type": "text", "text": block1, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": f"=== BRAND BRAIN ===\n{w_brain}", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": WRITER_SYSTEM},
    ]
    system_blocks_edit = [
        {"type": "text", "text": block1, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": f"=== BRAND BRAIN ===\n{e_brain}", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": EDITOR_SYSTEM},
    ]

    print(f"Standards: ~{_est(block1)}t | Writer brain: ~{_est(w_brain)}t | Editor brain: ~{_est(e_brain)}t")

    successes = 0
    failures = 0
    for i, pid in enumerate(post_ids):
        try:
            print(f"\n[{i+1}/{len(post_ids)}]", end="")
            run_post(client_id, pid, args.domain, all_posts,
                     system_blocks_brief, system_blocks_write, system_blocks_edit)
            successes += 1
        except Exception as e:
            print(f"  [FAILED] {pid}: {e}")
            failures += 1
            sb.table("cluster_posts").update({
                "editor_notes": f"Pipeline failed: {str(e)[:200]}",
            }).eq("client_id", client_id).eq("post_id", pid).execute()

    print(f"\n{'#'*60}")
    print(f"PIPELINE COMPLETE: {successes} succeeded, {failures} failed out of {len(post_ids)}")
    print(f"{'#'*60}")


if __name__ == "__main__":
    main()
