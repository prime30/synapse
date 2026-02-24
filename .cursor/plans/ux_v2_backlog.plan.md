---
name: Synapse UX V2 Backlog
overview: Ranked next-best enhancements following the UX Overhaul (EPICs U1-U8). Prioritized by impact/effort ratio.
todos:
  - id: v2-1
    content: "Chip Learning -- Track which predictive chips get clicked, weight them higher in scoring. Requires: analytics event on chip click, click count in cx_pattern_dismissed table"
    status: pending
  - id: v2-2
    content: Feedback-Driven Confidence Calibration -- Use thumbs-down on high-confidence changes to recalibrate. Analyze feedback_rating vs confidence correlation, adjust thresholds
    status: pending
  - id: v2-3
    content: Context Drawer File Dependencies -- Show file dependency graph (which files import/reference which) instead of flat list. Uses existing Liquid AST parser
    status: pending
  - id: v2-4
    content: Slash Command History -- Up arrow in prompt recalls recent commands. Store in localStorage, show as ghost text
    status: pending
  - id: v2-5
    content: Session Summary Sharing -- Generate shareable link for session summaries. Requires public URL + summary API route
    status: pending
  - id: v2-6
    content: Proactive Theme Health Monitoring -- Background scan on project load, surface issues via AmbientBar. Combines a11y checker + performance dashboard + CX gap detector
    status: pending
  - id: v2-7
    content: Notification Center -- Persistent inbox for feedback confirmations, CX alerts, export completions, publish events. Replaces transient toasts for important events
    status: pending
  - id: v2-8
    content: Conversion Funnel Visualization -- Visual map of home → collection → product → cart → checkout with drop-off indicators. Uses theme file analysis + CX patterns
    status: pending
  - id: v2-9
    content: "Agent Memory Dashboard -- Visualize what the agent has learned about the project: patterns, preferences, corrections, decisions. Read from developer_memory table"
    status: pending
  - id: v2-10
    content: Mid-Execution Course Correction -- Allow user to edit prompt while agent is running. Requires coordinator cancellation support (architectural change)
    status: pending
isProject: false
---

# Synapse UX V2 Backlog

Prioritized enhancements following the UX Overhaul (Phase 0 + EPICs U1-U8).

## Ranking Criteria

Each enhancement scored on:

- **User Impact** (1-5): Daily experience improvement
- **CX Impact** (1-5): Store shopper benefit
- **Effort** (S/M/L/XL): Implementation time
- **Dependencies**: What must exist first

## Ranked Enhancements

### 1. Chip Learning (User: 4, CX: 4, Effort: S)

Track which predictive chips users click. Weight clicked patterns higher in the scoring algorithm. Requires adding a click counter to the chip generation engine and an analytics event.

### 2. Feedback-Driven Confidence Calibration (User: 5, CX: 3, Effort: M)

When users thumbs-down a high-confidence change, use that signal to recalibrate confidence thresholds. Analyze the correlation between feedback_rating and confidence across sessions. Adjust the coordinator's confidence scoring.

### 3. Context Drawer File Dependencies (User: 4, CX: 2, Effort: M)

Replace the flat file list in ContextDrawer with a dependency graph showing which files reference each other. Leverages the existing Liquid AST parser (EPIC 4) and CSS/JS import detection.

### 4. Slash Command History (User: 4, CX: 1, Effort: S)

Up arrow in the prompt recalls recent slash commands. Store last 20 commands in localStorage. Show as ghost text or dropdown.

### 5. Proactive Theme Health Monitoring (User: 3, CX: 5, Effort: L)

Background scan on project load combining a11y checker, performance dashboard, and CX gap detector. Surface issues via AmbientBar (EPIC 12) with one-click fix actions.

### 6. Session Summary Sharing (User: 3, CX: 2, Effort: S)

Generate a shareable public link for session summaries. Useful for team review and client communication.

### 7. Notification Center (User: 4, CX: 2, Effort: M)

Persistent notification inbox replacing transient toasts for important events: feedback confirmations, CX scan results, export completions, publish status.

### 8. Conversion Funnel Visualization (User: 2, CX: 5, Effort: L)

Visual map of the customer journey with drop-off indicators. Analyzes theme structure to identify which pages exist and which conversion patterns are present at each stage.

### 9. Agent Memory Dashboard (User: 3, CX: 2, Effort: M)

UI to browse, edit, and understand what the agent has learned: patterns detected, corrections received, preferences stored, decisions recorded. Surfaces developer_memory entries with search and filtering.

### 10. Mid-Execution Course Correction (User: 5, CX: 3, Effort: XL)

Allow users to modify or cancel agent execution mid-stream. Requires architectural changes to the coordinator to support cancellation and prompt replacement without losing context.

## Impact/Effort Matrix


| Enhancement             | Impact Score | Effort | Ratio  |
| ----------------------- | ------------ | ------ | ------ |
| Chip Learning           | 8            | S      | High   |
| Slash Command History   | 5            | S      | High   |
| Session Summary Sharing | 5            | S      | High   |
| Confidence Calibration  | 8            | M      | High   |
| Context Dependencies    | 6            | M      | Medium |
| Notification Center     | 6            | M      | Medium |
| Memory Dashboard        | 5            | M      | Medium |
| Theme Health Monitoring | 8            | L      | Medium |
| Funnel Visualization    | 7            | L      | Medium |
| Course Correction       | 8            | XL     | Low    |


