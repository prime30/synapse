# Context Engine

The Context Engine is how Synapse's AI understands your theme. It builds a rich context from multiple sources and delivers it to every agent interaction.

## How Context is Built

![Context engine diagram showing layers of context](./images/ai-context-engine.png)

### Layer 1: Active File

The file currently open in the editor, including full content and cursor position.

### Layer 2: File Dependencies

Files referenced by the active file:
- `{% render 'snippet-name' %}` — Snippets
- `{% section 'section-name' %}` — Sections
- `{{ 'file.css' | asset_url }}` — Assets
- Template JSON section types

### Layer 3: Selected Text

Any text highlighted in the editor is automatically included as context when you send a chat message.

### Layer 4: Preview DOM

When the preview panel is open, a snapshot of the rendered DOM is included — limited to ~3,500 tokens for efficiency.

### Layer 5: Conversation History

Prior messages in the current chat session provide continuity.

### Layer 6: Design Tokens

Extracted color, typography, and spacing tokens from the theme.

### Layer 7: Project Files Index

Metadata about all project files (path, type, size, last modified) enables fuzzy file matching — e.g., "match the style of my hero" resolves to `sections/hero-banner.liquid`.

## Token Budget

The context engine manages a token budget of ~16,000 tokens for specialist agents. Files are prioritized:

1. **Priority files** (explicitly mentioned in the request)
2. **Active file** and selection
3. **Dependencies** (transitive resolution)
4. **Related files** (fuzzy matched)

If the budget is exceeded, lower-priority files are truncated or excluded.
