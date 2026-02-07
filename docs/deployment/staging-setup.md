# Staging Environment Setup

## Prerequisites

- Vercel account (or preferred hosting platform)
- Supabase staging project
- AI provider API keys with rate limits for staging

## Environment Variables

Configure the following in your hosting platform:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key |
| `OPENAI_API_KEY` | OpenAI API key (staging) |
| `ANTHROPIC_API_KEY` | Anthropic API key (staging) |
| `NEXT_PUBLIC_APP_URL` | Staging app URL |

## Deployment

Staging deployments are triggered automatically when pushing to the `integration/phase-2` branch via GitHub Actions.

The workflow:
1. Runs lint, type-check, and tests
2. Builds the application
3. Deploys to staging environment

## Health Checks

After deployment, verify all services:

```bash
curl https://staging.your-app.com/api/health
```

Expected response:
```json
{
  "data": {
    "status": "healthy",
    "timestamp": "...",
    "database": "healthy",
    "openai": "configured",
    "anthropic": "configured"
  }
}
```
