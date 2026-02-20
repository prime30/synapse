# AI Assistant

Synapse's AI assistant understands Shopify themes end-to-end — Liquid, CSS, JavaScript, schema blocks, and accessibility best practices.

![AI sidebar showing a conversation about generating a hero section](./images/ai-overview.png)

## Chat Interface

The AI sidebar provides a Cursor-style chat experience:

- **Syntax-highlighted code blocks** with line numbers and Copy / Apply / Save actions
- **Inline diff preview** when applying changes
- **Model selector** — Choose between Claude, Gemini, and GPT models
- **Subagent count** — 1x (single agent) to 4x (multiple subagents)
- **Specialist mode** — Opt-in toggle for domain agents (Liquid/CSS/JS/JSON) vs general subagents
- **Image upload** — Paste or drag images for visual analysis

![Chat interface with code block and action buttons](./images/ai-chat-interface.png)

## Agent Modes

### Subagent Count (1x–4x)

- **1x** — A single agent handles everything in one pass. Faster for simple tasks like "add a heading to this section" or "change the background color."
- **2x–4x** — Multiple general-purpose subagents work in parallel. Best for complex, multi-file tasks.

### Specialist Mode

When specialist mode is ON, domain agents are used instead of general subagents:

| Agent | Specialization |
|-------|---------------|
| **PM** | Understands requests, delegates tasks, coordinates workflow |
| **Liquid** | Shopify Liquid templates, schema blocks, Dawn patterns |
| **CSS** | Theme styles, animations, `prefers-reduced-motion` |
| **JavaScript** | Theme scripts, IntersectionObserver, scroll handling |
| **JSON** | Theme config, template JSON, schema |
| **Review** | Validates all changes for errors, security, and accessibility |

![Specialist mode diagram showing PM delegating to domain agents](./images/ai-orchestrated-mode.png)

## Suggestions

Contextual suggestion chips appear based on:
- The file you're editing (file type, path patterns)
- The AI's last response (detected signals)
- Your conversation history (turn count, escalation)

Suggestions are scored by relevance, recency, and novelty. Frequently ignored suggestions are automatically dampened.

![Suggestion chips below the AI response](./images/ai-suggestions.png)

## Ambient Intelligence

Synapse proactively scans your work and shows nudges in the ambient bar — a non-intrusive strip below chat.

**6 signal types** are detected:

| Signal | Example |
|--------|---------|
| Missing schema | "This section has no schema — generate one?" |
| Unused variable | "Unused variable `hero_text` — remove?" |
| Broken reference | "Snippet `price-card` not found — fix?" |
| Style inconsistency | "Mixed color formats (hex, rgb) — standardize?" |
| Performance issue | "Deep nesting (7 levels) — extract to snippet?" |
| Accessibility gap | "3 images missing alt — fix?" |

![Ambient bar showing a missing schema nudge](./images/ai-ambient-bar.png)

Click the action button to resolve instantly, or dismiss with **X**. Dismissed signals are dampened in future suggestions.

## Intent Completion

When Synapse detects a multi-step workflow, it offers to complete all remaining steps:

| Pattern | Trigger | Steps offered |
|---------|---------|---------------|
| **Rename propagation** | Rename a file | Update all `{% render %}` references, template JSON |
| **Section creation** | Create a new section | Add schema, register in template, create CSS |
| **Component extraction** | Create a new snippet | Add `{% render %}` in source section, wire variables |
| **Locale sync** | Edit a locale file | Sync new keys to other locale files |

![Intent completion panel with checkbox tree and Apply All button](./images/ai-intent-completion.png)

**Preview All** opens a multi-file diff modal so you can review every change before applying.

**Apply All** uses batch undo — a single `Ctrl+Z` reverts all changes.

## Theme Review

Run a comprehensive AI-powered theme review:

1. **Quick scan** (< 2s) — Rule-based checks for broken references, unclosed tags, missing assets
2. **Full review** (30–60s) — AI-powered scored report across 5 categories

| Category | What it checks |
|----------|----------------|
| Performance | Render-blocking scripts, large inline scripts, deep nesting |
| Accessibility | Missing alt, form labels, heading hierarchy |
| SEO | Title tag, meta description, canonical URL |
| Best Practices | Deprecated tags (`{% include %}`, `img_tag`) |
| Liquid Quality | Unused variables, deep nesting, long files |

![Theme review report showing category scores](./images/ai-theme-review.png)
