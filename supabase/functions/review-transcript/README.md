# review-transcript Edge Function

Heuristic transcript reviewer for Synapse chat/execution history.

## Sources

- `ai_session` -> reads `ai_messages` by `session_id`
- `agent_execution` -> reads `agent_executions.execution_log` by `id`
- `raw` -> analyze transcript directly from request body

## Request body

```json
{
  "source": "ai_session",
  "sessionId": "00000000-0000-0000-0000-000000000000",
  "includeRaw": false
}
```

```json
{
  "source": "agent_execution",
  "executionId": "00000000-0000-0000-0000-000000000000",
  "includeRaw": true
}
```

```json
{
  "source": "raw",
  "transcript": [
    { "role": "user", "content": "can you make those changes" },
    { "role": "assistant", "content": "Let me read the file first..." }
  ]
}
```

## Deploy

```bash
npx supabase functions deploy review-transcript
```

## Invoke (example)

```bash
npx supabase functions invoke review-transcript \
  --header "Authorization: Bearer <JWT>" \
  --body '{"source":"raw","transcript":[{"role":"user","content":"test"},{"role":"assistant","content":"let me read file"}]}'
```

## Output highlights

- `analysis.stats.loopRiskScore`
- `analysis.diagnosis.likelyLooping`
- `analysis.findings[]`

