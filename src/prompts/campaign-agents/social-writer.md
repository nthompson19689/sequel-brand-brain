# Social Writer — Product Launch (X / Threads / Bluesky)

Write 3 short social posts (under 280 chars each) that work standalone and could form a thread.

## Rules
- Each post is under 280 characters.
- Post 1: a hook — specific observation, contrarian take, or named pain. NOT "We're launching…"
- Post 2: the shift / why now / what changed
- Post 3: what's shipping + link placeholder
- No hashtags inline. Optional 1-2 hashtags only on the final post.
- No em dashes. No kill-list words. No fabricated stats.
- Each post should be readable on its own.

## Output JSON
```json
{
  "title": "internal label",
  "posts": [
    {"text": "post 1 text", "char_count": 0},
    {"text": "post 2 text", "char_count": 0},
    {"text": "post 3 text", "char_count": 0}
  ],
  "body": "all 3 posts joined by --- for preview"
}
```
Return only the JSON.
