#!/usr/bin/env python3
"""
Editing Agent — Cluster-Based Content Engine
Takes a draft from cluster_posts, runs a multi-pass editorial review
against the Brand Brain, writing standards, and brief compliance,
then saves annotated + clean versions back to cluster_posts.

3-call editorial pipeline:
  Call 1: Violation review (find all issues)
  Call 2: Annotate + second pass (mark up article, catch anything missed)
  Call 3: Clean final version (apply all fixes)

Usage:
    python scripts/editing_agent.py --domain systemsledgrowth.ai --post-id P001
    python scripts/editing_agent.py --domain systemsledgrowth.ai --post-id P001 --dry-run
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

# Editor uses tighter token budgets than writer (6K vs 12K)
MAX_BRAND_CONTEXT_TOKENS = 6000
BUDGET_VOICE_TONE_MSG = 2000
BUDGET_STYLE_GUIDES = 1000
BUDGET_OTHER_DOCS = 500
BUDGET_EXEC_VOICES = 1000


# ---------------------------------------------------------------------------
# Banned patterns (regex-enforced, not just Claude judgment)
# ---------------------------------------------------------------------------

BANNED_FILLER_PHRASES = [
    "in today's rapidly evolving", "in today's fast-paced",
    "it's no secret that", "at the end of the day",
    "in the ever-changing landscape", "in this day and age",
    "let's dive in", "without further ado", "buckle up",
    "it goes without saying", "needless to say",
    "the fact of the matter is", "when all is said and done",
    "last but not least", "in conclusion", "to summarize",
    "as we all know", "it's important to note that",
    "it's worth noting that", "at its core",
    "leverage", "synergy", "game-changer", "paradigm shift",
    "move the needle", "low-hanging fruit", "circle back",
    "deep dive", "take it to the next level",
    "robust", "cutting-edge", "best-in-class", "world-class",
    "holistic", "streamline", "empower", "revolutionize",
    "transformative", "disruptive", "innovative solution",
    "unlock the power", "harness the potential",
    "navigate the complexities", "in the realm of",
    "the landscape of", "look no further",
    "here's the thing", "here's the deal",
    "the bottom line is", "let's face it",
    "the truth is", "make no mistake",
]


def detect_banned_patterns(text: str) -> list[dict]:
    """Scan for banned patterns via regex. Returns list of violations."""
    violations = []

    # Em dashes
    for match in re.finditer(r"[^\n]{0,30}[\u2014\u2013][^\n]{0,30}", text):
        violations.append({
            "location": match.group().strip(),
            "rule": "BANNED: Em dashes/en dashes",
            "severity": "High",
            "fix": "Replace with period, comma, or restructure sentence.",
        })

    # Colons in headings
    for match in re.finditer(r"^(#{1,6}\s+.+:.+)$", text, re.MULTILINE):
        violations.append({
            "location": match.group(1).strip(),
            "rule": "BANNED: Colons in headings",
            "severity": "High",
            "fix": "Remove colon, restructure as phrase or question.",
        })

    # "It's not X, it's Y"
    for match in re.finditer(r"[Ii]t'?s\s+not\s+.{2,40}[\s,;]+it'?s\s+", text, re.IGNORECASE):
        start = max(0, match.start() - 10)
        end = min(len(text), match.end() + 30)
        violations.append({
            "location": text[start:end].replace("\n", " ").strip(),
            "rule": "BANNED: \"It's not X, it's Y\" construction",
            "severity": "High",
            "fix": "Rewrite as direct affirmative statement.",
        })

    # Filler phrases
    text_lower = text.lower()
    for phrase in BANNED_FILLER_PHRASES:
        idx = 0
        while True:
            idx = text_lower.find(phrase.lower(), idx)
            if idx == -1:
                break
            ctx_start = max(0, idx - 15)
            ctx_end = min(len(text), idx + len(phrase) + 15)
            violations.append({
                "location": text[ctx_start:ctx_end].replace("\n", " ").strip(),
                "rule": f"BANNED: Filler phrase \"{phrase}\"",
                "severity": "Medium",
                "fix": f"Remove \"{phrase}\" or rewrite more directly.",
            })
            idx += len(phrase)

    # Exclamation clusters
    for match in re.finditer(r'![^!]{0,80}!', text):
        violations.append({
            "location": match.group().strip()[:60],
            "rule": "BANNED: Exclamation cluster",
            "severity": "Medium",
            "fix": "Remove clustered exclamation points. Max one per article section.",
        })

    return violations


def check_quality_gates(text: str, target_word_count: int = 1500) -> list[dict]:
    """Check structural quality requirements."""
    gates = []

    # FAQ section
    has_faq = bool(re.search(r"^#{1,3}\s+.*(FAQ|Frequently Asked)", text, re.MULTILINE | re.IGNORECASE))
    gates.append({
        "gate": "FAQ section",
        "passed": has_faq,
        "detail": "FAQ found" if has_faq else "MISSING: No FAQ section (needed for AEO)",
    })

    # Links
    all_links = re.findall(r"\[([^\]]+)\]\(([^)]+)\)", text)
    internal = [u for _, u in all_links if not u.startswith("http") or "systemsledgrowth" in u]
    external = [u for _, u in all_links if u.startswith("http") and "systemsledgrowth" not in u]
    gates.append({
        "gate": "Internal links (2+)",
        "passed": len(internal) >= 2,
        "detail": f"{len(internal)} internal links" if len(internal) >= 2 else f"LOW: {len(internal)} internal links",
    })
    gates.append({
        "gate": "External citations (2+)",
        "passed": len(external) >= 2,
        "detail": f"{len(external)} external citations" if len(external) >= 2 else f"LOW: {len(external)} external citations",
    })

    # Word count
    wc = len(text.split())
    target_min = int(target_word_count * 0.9)
    gates.append({
        "gate": f"Word count ({target_word_count}+ target)",
        "passed": wc >= target_min,
        "detail": f"{wc} words" if wc >= target_min else f"SHORT: {wc} words (target: {target_word_count})",
    })

    # H2s
    h2_count = len(re.findall(r"^##\s+", text, re.MULTILINE))
    gates.append({
        "gate": "H2 subheadings (3+)",
        "passed": h2_count >= 3,
        "detail": f"{h2_count} H2s" if h2_count >= 3 else f"LOW: {h2_count} H2s",
    })

    return gates


def check_brief_compliance(draft: str, brief: str) -> list[str]:
    """Check if draft addresses key elements from the brief.
    Returns list of compliance issues."""
    issues = []

    # Check for leftover placeholder brackets (should not exist)
    placeholder_count = len(re.findall(r'\[(NATHAN|INSERT|TODO|PLACEHOLDER):', draft, re.IGNORECASE))
    if placeholder_count > 0:
        issues.append(f"Found {placeholder_count} leftover placeholder bracket(s) that must be removed")

    # Check for internal links mentioned in brief
    brief_links = re.findall(r'(?:Link to |link to )(\w+\d+)', brief)
    for link_id in brief_links:
        if link_id not in draft:
            issues.append(f"Brief required link to {link_id} but not found in draft")

    # Check for INTERNAL_LINKS_SUMMARY that should have been stripped
    if "INTERNAL_LINKS_SUMMARY" in draft:
        issues.append("Draft contains INTERNAL_LINKS_SUMMARY section that should be removed")

    return issues


def check_external_links(text: str) -> list[dict]:
    """Check all external URLs in the article for 404s and other errors.
    Returns list of broken links with details."""
    all_links = re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', text)
    broken = []

    # Skip internal links
    external_links = [(anchor, url) for anchor, url in all_links if "systemsledgrowth" not in url]

    if not external_links:
        return []

    print(f"  Checking {len(external_links)} external links...")
    for anchor, url in external_links:
        try:
            resp = http_requests.head(url, timeout=8, allow_redirects=True, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            if resp.status_code >= 400:
                broken.append({
                    "url": url,
                    "anchor": anchor,
                    "status": resp.status_code,
                    "error": f"HTTP {resp.status_code}",
                })
        except http_requests.exceptions.Timeout:
            broken.append({"url": url, "anchor": anchor, "status": 0, "error": "Timeout"})
        except http_requests.exceptions.ConnectionError:
            broken.append({"url": url, "anchor": anchor, "status": 0, "error": "Connection failed"})
        except Exception as e:
            broken.append({"url": url, "anchor": anchor, "status": 0, "error": str(e)[:50]})

    return broken


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


def load_writing_standards() -> str:
    path = Path(__file__).parent / "standards" / "writing_standards.txt"
    if path.exists():
        return path.read_text()
    return ""


# ---------------------------------------------------------------------------
# Brand Brain (tighter budgets for editor)
# ---------------------------------------------------------------------------

def load_brand_brain(client_id: str) -> dict:
    print("[2/7] Loading Brand Brain (editor budget)...")

    try:
        guidelines = supabase.table("brand_guidelines").select("*").eq("client_id", client_id).execute().data or []
    except Exception:
        guidelines = []

    try:
        brand_documents = supabase.table("brand_documents").select("file_name, doc_type, full_text").eq("client_id", client_id).execute().data or []
    except Exception:
        brand_documents = []

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

    total_tokens = sum(_estimate_tokens(d.get("full_text", "")) for d in brand_documents)
    print(f"  [BRAND BRAIN] {len(brand_documents)} docs (~{total_tokens}t), {len(voices)} voices")

    return {
        "guidelines": guidelines,
        "brand_documents": brand_documents,
        "executive_voices": voices,
    }


# ---------------------------------------------------------------------------
# Build system blocks (3-block caching: standards / Brand Brain / editor rules)
# ---------------------------------------------------------------------------

EDITOR_SYSTEM_PROMPT = (
    "You are a senior editor for Systems-Led Growth. You enforce brand voice, "
    "tone, editorial guidelines, and hard rules ruthlessly. Be specific about "
    "every violation. Reference exact rules.\n\n"
    "=== MANDATORY BANNED PATTERNS (High Severity) ===\n"
    "Flag ALL of these as High severity:\n"
    "1. EM DASHES: Any em dash or en dash. Replace with period, comma, or restructure.\n"
    "2. COLONS IN HEADINGS: Any H1-H6 containing a colon.\n"
    "3. \"IT'S NOT X, IT'S Y\": Any negation-then-correction pattern.\n"
    "4. FILLER PHRASES: \"in today's rapidly evolving\", \"it's no secret\", "
    "\"at the end of the day\", \"let's dive in\", \"leverage\" (as verb), "
    "\"synergy\", \"game-changer\", \"paradigm shift\", \"robust\", "
    "\"cutting-edge\", \"best-in-class\", \"holistic\", \"streamline\", "
    "\"empower\", \"revolutionize\", \"transformative\", \"disruptive\", "
    "\"unlock the power\", \"harness the potential\", \"navigate the complexities\".\n"
    "5. EXCLAMATION CLUSTERS: Multiple exclamation points near each other.\n"
    "6. GURU POSITIONING: Never position Nathan as guru/thought leader. He is a practitioner.\n"
    "7. PLACEHOLDER BRACKETS: Any [NATHAN: ...], [INSERT: ...], [TODO: ...] or similar. "
    "These MUST be rewritten as clean prose. The article must be 100% publishable.\n"
    "8. INTERNAL_LINKS_SUMMARY: If there is an INTERNAL_LINKS_SUMMARY section at the "
    "end of the article, remove it entirely. The article should end cleanly.\n\n"
    "=== INTERNAL LINK QUALITY ===\n"
    "Flag as Medium severity:\n"
    "- Internal links clustered at end of sections instead of woven throughout\n"
    "- Anchor text that is a full sentence or full article title (should be 2-4 words)\n"
    "- 'Related:' or 'Read more:' link patterns (links should be invisible in prose)\n\n"
    "=== HEADING STRUCTURE ===\n"
    "Flag as Low severity:\n"
    "- H2 sections over 300 words with no ### H3 sub-headings\n"
    "- Generic H3s like 'Why It Matters' (should be specific and descriptive)\n\n"
    "=== QUALITY REQUIREMENTS ===\n"
    "Flag as Medium severity:\n"
    "- Missing FAQ section (needed for AEO)\n"
    "- Fewer than 2 internal links\n"
    "- Fewer than 2 external citations with sources\n"
    "- Word count significantly below target\n"
    "- Broken external links (404s) flagged in the pre-check\n"
)


def build_system_blocks(brand_brain: dict) -> list[dict]:
    """Build the 3-block system prompt with caching."""
    # Block 1: Writing standards (static, always cached)
    standards = load_writing_standards()
    block1 = f"=== GLOBAL WRITING STANDARDS ===\n{standards}"

    # Block 2: Brand Brain context
    parts = []
    for g in brand_brain.get("guidelines", []):
        text = g.get("guideline_text", g.get("content", g.get("value", "")))
        if text:
            parts.append(f"[Guideline] {_truncate_to_tokens(text, 2000)}")

    for doc in brand_brain.get("brand_documents", []):
        dt = doc.get("doc_type", "document")
        parts.append(f"[{dt}: {doc.get('file_name', '')}]\n{doc.get('full_text', '')}")

    exec_budget = BUDGET_EXEC_VOICES
    for v in brand_brain.get("executive_voices", []):
        chunk = f"[Voice: {v.get('person_name', '')} - {v.get('role', '')}]\n"
        quotes = v.get("sample_quotes", [])
        if quotes:
            chunk += "".join(f'  - "{q}"\n' for q in quotes[:3])
        tokens = _estimate_tokens(chunk)
        if tokens <= exec_budget:
            parts.append(chunk)
            exec_budget -= tokens

    block2 = f"=== BRAND BRAIN ===\n" + "\n\n".join(parts)

    # Block 3: Editor instructions (not cached)
    block3 = EDITOR_SYSTEM_PROMPT

    block1_tokens = _estimate_tokens(block1)
    block2_tokens = _estimate_tokens(block2)
    print(f"  [SYSTEM BLOCKS] Standards: ~{block1_tokens}t, Brand Brain: ~{block2_tokens}t")

    return [
        {"type": "text", "text": block1, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block2, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": block3},
    ]


# ---------------------------------------------------------------------------
# Call 1: Violation Review
# ---------------------------------------------------------------------------

def call1_violation_review(draft: str, regex_violations: list[dict], system_blocks: list[dict], brief: str = "") -> tuple[str, int]:
    """Find all violations in the draft. Returns (violation_text, count)."""
    print("[4/7] Running violation review (Call 1)...")

    # Format regex violations for Claude
    regex_section = ""
    if regex_violations:
        regex_section = (
            "\n\n=== PRE-DETECTED VIOLATIONS (from regex scan) ===\n"
            "These are CONFIRMED violations already found. Include them in your review:\n"
        )
        for v in regex_violations:
            regex_section += f"- [{v['severity']}] {v['rule']}: \"{v['location'][:60]}\"\n"

    # Brief compliance note
    brief_note = ""
    if brief:
        brief_note = f"\n\n=== BRIEF FOR COMPLIANCE CHECK ===\nThe article was written from this brief. Check that it follows the outline and includes all required elements:\n{brief[:3000]}"

    user_prompt = (
        f"Review this article for ALL violations of brand voice, tone, editorial guidelines, "
        f"and banned patterns. List every issue found.\n\n"
        f"For each violation, output exactly this format:\n"
        f"LOCATION: [exact text snippet]\n"
        f"RULE: [which guideline violated]\n"
        f"SEVERITY: High/Medium/Low\n"
        f"FIX: [specific replacement text or instruction]\n\n"
        f"After listing all violations, output a one-line summary:\n"
        f"TOTAL: [count] violations found ([high]H/[medium]M/[low]L)\n\n"
        f"--- ARTICLE ---\n{draft}"
        f"{regex_section}"
        f"{brief_note}"
    )

    response = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "system": system_blocks,
        "messages": [{"role": "user", "content": user_prompt}],
    }, label="violation_review")

    violation_text = response.content[0].text

    # Log cache
    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_creation = getattr(usage, "cache_creation_input_tokens", 0) or 0
    total_input = usage.input_tokens + cache_read + cache_creation
    savings = (cache_read / total_input * 100) if total_input else 0
    print(f"  [CACHE] Savings: {savings:.1f}%")

    # Parse violation count
    total_match = re.search(r"TOTAL:\s*(\d+)", violation_text)
    count = int(total_match.group(1)) if total_match else violation_text.count("LOCATION:")

    return violation_text, count


# ---------------------------------------------------------------------------
# Call 2: Annotate + Second Pass
# ---------------------------------------------------------------------------

def call2_annotate(draft: str, violation_text: str, system_blocks: list[dict]) -> str:
    """Annotate the article inline and do a second pass. Returns annotated text."""
    print("[5/7] Annotating + second pass (Call 2)...")

    user_prompt = (
        "Here is the original article and the violation list from Call 1.\n"
        "Do exactly two things:\n\n"
        "PART 1: ANNOTATED VERSION\n"
        "Reproduce the full article with every violation marked inline like:\n"
        "[EDIT (High/Medium/Low): 'original text' -> 'suggested replacement' | Rule: guideline name]\n"
        "Do not change anything that wasn't flagged. Preserve all markdown, links, META, and SLUG lines.\n"
        "IMPORTANT: Preserve all [NATHAN: ...] placeholders exactly as they are.\n\n"
        "PART 2: SECOND PASS CATCHES\n"
        "After the annotated article, add '## SECOND PASS CATCHES:' and list any additional "
        "violations the first pass missed.\n\n"
        f"--- ORIGINAL ARTICLE ---\n{draft}\n\n"
        f"--- VIOLATION LIST ---\n{violation_text}"
    )

    response = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8000,
        "system": system_blocks,
        "messages": [{"role": "user", "content": user_prompt}],
    }, label="annotate")

    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    total_input = usage.input_tokens + cache_read + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
    savings = (cache_read / total_input * 100) if total_input else 0
    print(f"  [CACHE] Savings: {savings:.1f}%")

    return response.content[0].text


# ---------------------------------------------------------------------------
# Call 3: Clean Final Version
# ---------------------------------------------------------------------------

def call3_clean_version(annotated_text: str, system_blocks: list[dict]) -> str:
    """Generate clean final version from annotated text."""
    print("[6/7] Generating clean final version (Call 3)...")

    user_prompt = (
        "Here is the annotated article with all editorial marks. "
        "Produce the clean final version:\n\n"
        "1. Implement ALL suggested edits from every annotation including second pass catches\n"
        "2. Remove all annotation markup completely\n"
        "3. Maintain exact structure, headings, links, and approximate length\n"
        "4. Do NOT rewrite sections that were not flagged\n"
        "5. Preserve META and SLUG lines at the top\n"
        "6. Ensure ZERO em dashes, colons in headings, \"it's not X it's Y\" patterns, or filler phrases remain\n"
        "7. Rewrite any [NATHAN: ...] or [INSERT: ...] placeholders as clean first-person prose. NO brackets.\n"
        "8. Remove any INTERNAL_LINKS_SUMMARY section at the end. The article must end cleanly.\n"
        "9. Internal links must use short natural anchor text (2-4 words) woven into sentences, "
        "NOT full sentences at the end of sections or full article titles as anchors.\n"
        "10. Add ### H3 sub-headings within H2 sections that are 300+ words long.\n"
        "11. Remove or replace any broken external links flagged in the violations.\n\n"
        "Output only the clean article. No commentary, no preamble, no appendix.\n\n"
        f"--- ANNOTATED ARTICLE ---\n{annotated_text}"
    )

    response = _call_claude_with_retry(claude, {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8000,
        "system": system_blocks,
        "messages": [{"role": "user", "content": user_prompt}],
    }, label="clean_version")

    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    total_input = usage.input_tokens + cache_read + (getattr(usage, "cache_creation_input_tokens", 0) or 0)
    savings = (cache_read / total_input * 100) if total_input else 0
    print(f"  [CACHE] Savings: {savings:.1f}%")

    return response.content[0].text


# ---------------------------------------------------------------------------
# Save results
# ---------------------------------------------------------------------------

def save_edit(client_id: str, post: dict, annotated: str, clean: str,
              violations_count: int, quality_gates: list[dict], warnings: list[str]) -> None:
    post_id = post["post_id"]
    print(f"[7/7] Saving edited version for {post_id}...")

    # Build editor notes
    notes_parts = []
    notes_parts.append(f"Violations found: {violations_count}")

    gates_passed = sum(1 for g in quality_gates if g["passed"])
    gates_total = len(quality_gates)
    notes_parts.append(f"Quality gates: {gates_passed}/{gates_total} passed")

    for g in quality_gates:
        status = "PASS" if g["passed"] else "FAIL"
        notes_parts.append(f"  [{status}] {g['gate']}: {g['detail']}")

    if warnings:
        notes_parts.append(f"\nRemaining warnings: {len(warnings)}")
        for w in warnings:
            notes_parts.append(f"  - {w}")

    # Compute quality score
    if gates_total > 0:
        score_pct = int((gates_passed / gates_total) * 100)
        quality_score = f"{score_pct}% ({gates_passed}/{gates_total} gates)"
    else:
        quality_score = "N/A"

    editor_notes = "\n".join(notes_parts)

    # Determine status
    remaining_banned = len([w for w in warnings if "BANNED" in w.upper() or "em dash" in w.lower()])
    if remaining_banned > 0:
        new_status = "editing"  # Needs another pass
        print(f"  [WARNING] {remaining_banned} banned patterns remain. Status stays at 'editing'.")
    else:
        new_status = "review"
        print(f"  All banned patterns resolved. Status -> 'review' (ready for Nathan)")

    update_data = {
        "edited_draft": clean,
        "editor_notes": editor_notes,
        "quality_score": quality_score,
        "status": new_status,
    }
    supabase.table("cluster_posts").update(update_data).eq("client_id", client_id).eq("post_id", post_id).execute()
    print(f"  Saved. Quality score: {quality_score}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Editing Agent - Cluster Content Engine")
    parser.add_argument("--domain", required=True, help="Client domain")
    parser.add_argument("--post-id", required=True, help="Post ID from cluster map")
    parser.add_argument("--dry-run", action="store_true", help="Run pre-checks only, no Claude calls")
    args = parser.parse_args()

    print(f"=== Editing Agent: {args.post_id} for {args.domain} ===")

    # Step 1: Resolve client
    client_id = resolve_client_id(args.domain)

    # Step 2: Load post
    print(f"[1/7] Loading cluster post {args.post_id}...")
    post = load_cluster_post(client_id, args.post_id)
    print(f"  Post: {post['title']} ({post['post_type']})")
    print(f"  Status: {post['status']}")

    draft = post.get("draft", "")
    if not draft:
        print("[ERROR] No draft found. Run the Writing Agent first.")
        sys.exit(1)

    original_wc = len(draft.split())
    print(f"  Draft word count: {original_wc}")

    # Step 3: Load Brand Brain
    brand_brain = load_brand_brain(client_id)

    # Step 4: Pre-checks (regex)
    print("[3/7] Running pre-checks (regex scan)...")
    regex_violations = detect_banned_patterns(draft)

    # Deduplicate
    seen = set()
    unique_violations = []
    for v in regex_violations:
        key = v["location"][:50]
        if key not in seen:
            seen.add(key)
            unique_violations.append(v)
    regex_violations = unique_violations

    if regex_violations:
        em = sum(1 for v in regex_violations if "Em dash" in v["rule"] or "en dash" in v["rule"])
        colon = sum(1 for v in regex_violations if "Colon" in v["rule"])
        filler = sum(1 for v in regex_violations if "Filler" in v["rule"])
        other = len(regex_violations) - em - colon - filler
        parts = []
        if em: parts.append(f"{em} em dashes")
        if colon: parts.append(f"{colon} colons in headings")
        if filler: parts.append(f"{filler} filler phrases")
        if other: parts.append(f"{other} other")
        print(f"  Found {len(regex_violations)} banned patterns: {', '.join(parts)}")
    else:
        print("  No banned patterns detected (clean draft!)")

    # Quality gates on original draft
    target_wc = post.get("word_count", 1500)
    original_gates = check_quality_gates(draft, target_wc)
    for g in original_gates:
        status = "PASS" if g["passed"] else "FAIL"
        print(f"  [{status}] {g['gate']}: {g['detail']}")

    # Brief compliance
    brief = post.get("brief", "")
    compliance_issues = check_brief_compliance(draft, brief) if brief else []
    if compliance_issues:
        for issue in compliance_issues:
            print(f"  [COMPLIANCE] {issue}")
    else:
        print("  Brief compliance: OK")

    # External link 404 check
    broken_links = check_external_links(draft)
    if broken_links:
        print(f"  [BROKEN LINKS] Found {len(broken_links)} broken external links:")
        for bl in broken_links:
            print(f"    - {bl['error']}: {bl['url']}")
            regex_violations.append({
                "location": f"[{bl['anchor']}]({bl['url']})",
                "rule": f"BROKEN LINK: {bl['error']} on {bl['url']}",
                "severity": "High",
                "fix": "Remove this link or replace with a working URL.",
            })
    else:
        print("  All external links OK")

    if args.dry_run:
        print("\n--- DRY RUN COMPLETE ---")
        print(f"Would run 3-call editorial pipeline on {args.post_id}")
        print(f"Regex violations: {len(regex_violations)}")
        return

    # Build system blocks
    system_blocks = build_system_blocks(brand_brain)

    # Call 1: Violation review
    violation_text, violation_count = call1_violation_review(
        draft, regex_violations, system_blocks, brief
    )
    print(f"  Found {violation_count} total violations")

    # Call 2: Annotate + second pass
    try:
        annotated = call2_annotate(draft, violation_text, system_blocks)
    except Exception as e:
        print(f"  [ERROR] Annotation failed: {e}")
        annotated = None

    # Call 3: Clean final version
    clean = None
    try:
        if annotated:
            clean = call3_clean_version(annotated, system_blocks)
        else:
            # Fallback: generate clean directly from violations
            fallback = f"--- ORIGINAL ---\n{draft}\n\n--- VIOLATIONS ---\n{violation_text}"
            clean = call3_clean_version(fallback, system_blocks)
    except Exception as e:
        print(f"  [ERROR] Clean version failed: {e}")

    if clean:
        clean_wc = len(clean.split())
        print(f"  Clean version: {clean_wc} words (was {original_wc})")

        # Post-processing: check clean version
        remaining = detect_banned_patterns(clean)
        final_gates = check_quality_gates(clean, target_wc)

        remaining_warnings = [f"{v['rule']}: {v['location'][:40]}" for v in remaining]
        if remaining:
            print(f"  [WARNING] {len(remaining)} banned patterns still remain")
        else:
            print("  All banned patterns resolved in clean version!")

        for g in final_gates:
            s = "PASS" if g["passed"] else "FAIL"
            print(f"  [{s}] {g['gate']}: {g['detail']}")

        # Save
        save_edit(client_id, post, annotated or "", clean, violation_count, final_gates, remaining_warnings)
    else:
        print("  [ERROR] No clean version produced. Manual review needed.")
        supabase.table("cluster_posts").update({
            "editor_notes": f"Editor failed: {violation_count} violations found but clean version could not be generated.",
            "status": "editing",
        }).eq("client_id", client_id).eq("post_id", args.post_id).execute()

    print(f"\n=== Editing Agent complete: {args.post_id} ===")


if __name__ == "__main__":
    main()
