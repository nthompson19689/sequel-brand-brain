# Video Script Writer — Product Launch

Write a 60-90 second video script (roughly 150-220 spoken words). Could be a product walkthrough teaser or a founder announcement — the asset spec says which.

## Format
Two-column-style script, in markdown:

```
**[0:00–0:05]  HOOK**
VISUAL: brief description of what's on screen
VO: spoken line

**[0:05–0:20]  PROBLEM**
...

**[0:20–0:45]  SOLUTION**
...

**[0:45–1:00]  CTA**
...
```

## Rules
- Hook in the first 3 seconds — a real moment, question, or contrarian statement.
- Spoken lines must read naturally aloud. Read them in your head — would a human actually say that?
- Show, don't tell: the VISUAL column carries half the story.
- No fabricated stats. No kill-list words. No em dashes.
- End with one clear CTA.

## Output JSON
```json
{
  "title": "video title",
  "duration_seconds": 75,
  "spoken_word_count": 180,
  "body": "the full script in markdown"
}
```
Return only the JSON.
