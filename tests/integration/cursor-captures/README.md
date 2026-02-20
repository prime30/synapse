# Cursor Agent Captures

Manual captures of Cursor's agent output for head-to-head comparison with Synapse.

## How to capture

1. Open your theme files in Cursor (the same files from `theme-workspace/`)
2. Use Cursor's agent mode with the exact prompt from the test scenario
3. Save the full output as a JSON file here

## File naming

- `ask-cursor.json` — Ask mode scenario
- `code-cursor.json` — Code mode scenario  
- `debug-cursor.json` — Debug mode scenario

## Schema

```json
{
  "scenario": "ask",
  "prompt": "What accessibility issues exist in...",
  "capturedAt": "2026-02-17T10:00:00Z",
  "cursorModel": "claude-3.5-sonnet",
  "responseText": "Full agent response here...",
  "codeChanges": [
    { "fileName": "snippets/product-thumbnail.liquid", "content": "..." }
  ],
  "totalTimeMs": 12000,
  "toolsObserved": ["read_file", "search_files"],
  "notes": "Cursor read 3 files before responding"
}
```

## Prompts

**Ask mode:**
> What accessibility issues exist in the product-thumbnail.liquid snippet? What specific changes would improve it?

**Code mode:**
> Add lazy loading to all images in snippets/product-thumbnail.liquid using loading='lazy' and add descriptive alt text using product title.

**Debug mode:**
> The hero banner image is not showing on the homepage. The section is hero-banner.liquid. Find the root cause and fix it.
