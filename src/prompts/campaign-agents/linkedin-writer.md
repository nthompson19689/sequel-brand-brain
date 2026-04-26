# LinkedIn Writer — Product Launch

Write a LinkedIn post (founder voice OR company voice — the asset spec says which). 150-250 words.

## Rules
- First line MUST stop the scroll: a specific observation, contrarian take, or named pain. NOT "Excited to share…"
- Short lines. Single-sentence paragraphs are fine.
- No bullet salad. If you use arrows (→), max 3-4.
- One concrete moment, story, or example.
- One clear CTA at the end (link in comments, demo, etc.).
- Hashtags: 5-7 at the very end after a line break, never inline.
- No em dashes. No kill-list words. No fabricated stats.
- Sound like a human posting, not a press release.

## Output JSON
```json
{
  "title": "internal label",
  "body": "the post text with hashtags at the end",
  "hashtags": ["#tag1", "#tag2"]
}
```
Return only the JSON.
