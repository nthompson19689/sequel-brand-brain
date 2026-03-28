#!/usr/bin/env python3
"""
Publisher: Checks for scheduled articles and publishes them to Webflow
Runs via cron every 30 minutes
"""

import os, logging
from datetime import datetime
from pathlib import Path
import httpx, markdown2
from supabase import create_client
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

(PROJECT_ROOT / "logs").mkdir(exist_ok=True)
logging.basicConfig(
    filename=str(PROJECT_ROOT / 'logs/publisher.log'),
    level=logging.INFO,
    format='%(asctime)s [PUBLISHER] %(message)s'
)
log = logging.getLogger(__name__)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))


def run_publisher():
    now = datetime.now()

    # Find articles due to publish
    due = supabase.table("content_output")\
        .select("*")\
        .eq("status", "scheduled")\
        .lte("scheduled_publish_at", now.isoformat())\
        .execute().data

    if not due:
        log.info(f"No articles due for publishing at {now.strftime('%H:%M')}")
        return

    log.info(f"Found {len(due)} articles due for publishing")

    for article in due:
        try:
            publish_to_webflow(article)
            supabase.table("content_output").update({
                "status": "published",
                "published_at": now.isoformat()
            }).eq("id", article["id"]).execute()
            log.info(f"Published: '{article['keyword']}'")
        except Exception as e:
            log.error(f"Failed to publish '{article['keyword']}': {str(e)}")
            supabase.table("content_output").update({
                "status": "publish_failed",
                "publish_error": str(e)
            }).eq("id", article["id"]).execute()


def publish_to_webflow(article: dict):
    import re, json

    content = article.get("clean_version") or article.get("raw_article", "")

    # Extract metadata
    slug_match = re.search(r'^SLUG:\s*(.+)$', content, re.MULTILINE)
    meta_match = re.search(r'^META:\s*(.+)$', content, re.MULTILINE)
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)

    slug = slug_match.group(1).strip() if slug_match else article['keyword'].lower().replace(' ', '-')
    meta = meta_match.group(1).strip() if meta_match else ""
    title = title_match.group(1).strip() if title_match else article['keyword']

    # Clean body
    body = content
    for pattern in [r'^SLUG:.*$', r'^META:.*$', r'^#\s+.+$']:
        body = re.sub(pattern, '', body, count=1, flags=re.MULTILINE)
    body = body.strip()

    # Convert to HTML
    html_body = markdown2.markdown(body, extras=["fenced-code-blocks", "tables"])

    # Extract FAQ schema
    faq_pairs = extract_faq_pairs(html_body)
    faq_schema = build_faq_schema(faq_pairs) if faq_pairs else ""

    payload = {
        "fieldData": {
            "name": title,
            "slug": slug,
            "meta-description": meta,
            "post-body": html_body,
        }
    }

    if faq_schema:
        payload["fieldData"]["faq-schema"] = faq_schema

    response = httpx.post(
        f"https://api.webflow.com/v2/collections/{os.getenv('WEBFLOW_COLLECTION_ID')}/items/live",
        headers={
            "Authorization": f"Bearer {os.getenv('WEBFLOW_API_TOKEN')}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=30
    )

    if response.status_code not in [200, 201, 202]:
        raise Exception(f"Webflow API error {response.status_code}: {response.text[:200]}")

    webflow_id = response.json().get("id")
    supabase.table("content_output").update({
        "webflow_item_id": webflow_id
    }).eq("id", article["id"]).execute()


def extract_faq_pairs(html):
    import re
    pairs = []
    faq_match = re.search(r'<h[23][^>]*>.*?(?:FAQ|Frequently Asked).*?</h[23]>(.*?)(?=<h2|$)', html, re.IGNORECASE | re.DOTALL)
    if not faq_match:
        return pairs
    faq_content = faq_match.group(1)
    questions = re.findall(r'<h3[^>]*>(.*?)</h3>', faq_content, re.DOTALL)
    answers = re.findall(r'</h3>\s*<p>(.*?)</p>', faq_content, re.DOTALL)
    for i, q in enumerate(questions):
        if i < len(answers):
            q_clean = re.sub(r'<[^>]+>', '', q).strip()
            a_clean = re.sub(r'<[^>]+>', '', answers[i]).strip()
            if q_clean and a_clean:
                pairs.append({"question": q_clean, "answer": a_clean})
    return pairs[:6]


def build_faq_schema(pairs):
    import json
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{
            "@type": "Question",
            "name": p["question"],
            "acceptedAnswer": {"@type": "Answer", "text": p["answer"]}
        } for p in pairs]
    }, indent=2)


if __name__ == "__main__":
    run_publisher()
