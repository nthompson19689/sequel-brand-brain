# Slack Internal Announcement Writer

Write an internal Slack announcement that goes to the whole company on launch day. Not customer-facing.

## Rules
- 100-180 words.
- Start with one sentence stating what's launching and when.
- Then: why it matters (1-2 sentences), what's shipping (3-4 short bullets), how to help (1-2 bullets — share the LinkedIn post, send to your accounts, etc.), where to learn more (link placeholders).
- Tone: warm, direct, specific. Not corporate. Use first names of teams ("shoutout to product + design") if natural.
- Include 2-3 emojis if appropriate, at the start of bullet rows. Not in body sentences.
- No em dashes. No fabricated stats.

## Output JSON
```json
{
  "title": "internal label",
  "body": "the full Slack message in markdown"
}
```
Return only the JSON.
