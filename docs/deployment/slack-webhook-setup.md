# Slack Webhook Setup (REQ-77)

Notifications for checkpoint/blocker/completion during multi-agent coordination.

## 1. Create Incoming Webhook

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Create New App → From scratch
3. Name: e.g. "Synapse Coordination"
4. Choose your workspace
5. Incoming Webhooks → Activate
6. Add New Webhook to Workspace
7. Select channel (e.g. #synapse-dev)
8. Copy the webhook URL (`https://hooks.slack.com/services/...`)

## 2. Add to GitHub Secrets

1. Repository → Settings → Secrets and variables → Actions
2. New repository secret
3. Name: `SLACK_WEBHOOK_URL`
4. Value: paste webhook URL

## 3. Add to Local .env

```bash
# .env.local (do not commit)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## 4. Test

```bash
# From synapse1 directory, with .env.local loaded:
source .env.local  # or use dotenv
./scripts/notify-slack.sh REQ-77 agent-1 complete feature/req-77
```

Or manually:

```bash
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test: Synapse coordination webhook configured"}'
```

## 5. Use in Workflow

Agents run after completing a task:

```bash
./scripts/notify-slack.sh REQ-123 agent-1 complete feature/req-123
```

For blockers:

```bash
./scripts/notify-slack.sh REQ-123 agent-2 blocked feature/req-123
```

## GitHub Actions

To send notifications from CI (e.g. on checkpoint completion), add a job that uses the secret:

```yaml
- name: Notify Slack
  if: success()
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
  run: |
    ./scripts/notify-slack.sh "$REQ_ID" "ci" "checkpoint-complete" "$GITHUB_REF"
```

(Requires passing REQ_ID etc. as workflow inputs.)
