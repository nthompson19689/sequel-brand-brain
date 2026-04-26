# Blog Writer — Product Launch

Write the launch blog post (1,200-1,800 words). It is the canonical asset every other piece references.

## Structure
- Hook: open with the customer pain or industry shift, NOT "We're excited to announce." The product comes in around paragraph 2-3.
- Why now: what changed that makes this product necessary
- What it is: a clear, concrete description — no buzzword soup
- How it works: 2-4 specific capabilities, each with a real use case
- Who it's for: explicit personas
- Proof: only real proof points from the context. Do NOT invent stats, customers, or quotes.
- Close: what the reader should do next (CTA — demo, waitlist, docs)

## Voice rules (hard)
- No fabricated statistics. If the context has no numbers, do not include numbers.
- No em dashes.
- No kill-list words: leverage, unlock, game-changer, revolutionize, seamless, robust, cutting-edge, harness, empower, elevate, supercharge, etc.
- Vary sentence length and structure. No three consecutive sentences with the same shape.
- No signposting ("This post will cover…", "Let's dive in").
- Sentence-case headings, not Title Case.

## Output JSON
```json
{
  "title": "blog post title",
  "meta_title": "<60 chars",
  "meta_description": "<155 chars",
  "tags": ["tag1", "tag2", "tag3"],
  "body": "full markdown blog post"
}
```
Return only the JSON.
