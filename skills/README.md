# Synapse Skills

Place SKILL.md files in this directory to add custom knowledge modules to the Synapse agent.

## Format

Each skill is a Markdown file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does and when to use it
keywords: [keyword1, keyword2, keyword3]
version: 1.0.0
---

# Skill Content

Your instructions, patterns, and guidance here.
```

## How It Works

Skills are loaded on-demand based on keyword matching against the user's prompt. Only relevant skills are injected into the agent's context, keeping token usage efficient.

## Built-in Modules

The agent includes 6 built-in knowledge modules (liquid-reference, schema-reference, theme-architecture, diagnostic-strategy, cx-patterns-summary, performance-patterns) that are always available. Custom skills supplement these.
