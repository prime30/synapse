/**
 * Knowledge module: Debugging methodology for Shopify theme issues.
 * Extracted from V2_DEBUG_OVERLAY and the Shopify Debug Protocol.
 */

export const DIAGNOSTIC_STRATEGY = `## Shopify Debug Protocol

1. **TRACE FIRST:** Call \`trace_rendering_chain\` with the user's symptom to map the file chain.
2. **CHECK SETTINGS:** Call \`check_theme_setting\` if the issue could be a disabled setting.
3. **FOR VISIBILITY BUGS:** Call \`diagnose_visibility\` to check CSS + Liquid + settings simultaneously.
4. **READ ONLY the files in the chain** — never search all files.
5. After fixing, verify the preview shows the expected result.

### Hypothesis Categories

For "X not showing" or "X looks wrong", check ALL of these:
- **Liquid rendering**: Is the content output at all? (conditionals, variable assignment, wrong scope)
- **CSS visibility**: Rendered but hidden? (opacity:0, display:none, visibility:hidden, height:0, overflow:hidden)
- **JS interference**: JS hiding/removing it? (lazy-load failure, slider init error, DOM manipulation)
- **Asset loading**: Required JS/CSS failing to load? (404, CORS, parse error)
- **Settings**: Feature toggled off in settings_data.json?
- **Schema**: Setting referenced in Liquid but missing from schema?

### Common Failure Patterns (check in order)
- CSS: display:none, opacity:0, visibility:hidden, height:0, overflow:hidden
- JS: Lazy-loader failure, slider not initialized, deferred script timing
- Liquid: Wrong conditional, missing assign, wrong forloop variable
- Settings: Feature toggled off in settings_data.json
- Schema: Setting referenced in Liquid but missing from schema
- Assets: 404 on stylesheet or script (wrong filename, missing file)

### Escalation
After 3 failed fixes, STOP and reconsider:
- Am I editing the right file?
- Could the issue be in a different layer (CSS vs Liquid vs JS)?
- Is there a third-party script interfering?
- Should I look at layout/theme.liquid for global interference?`;

export const DIAGNOSTIC_STRATEGY_KEYWORDS = [
  'debug', 'fix', 'broken', 'not showing', 'error', 'bug', 'issue', 'problem',
  'wrong', 'missing', 'hidden', 'invisible', 'blank', 'empty', 'disappeared',
  'not working', 'not rendering', 'not loading',
];

export const DIAGNOSTIC_STRATEGY_TOKENS = 700;
