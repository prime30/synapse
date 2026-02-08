#!/bin/bash
# Notify Slack of agent task completion/blocker
# Usage: ./scripts/notify-slack.sh <REQ-ID> <agent-id> <status> [branch]
# Example: ./scripts/notify-slack.sh REQ-123 agent-1 complete feature/req-123
#
# Setup: Add SLACK_WEBHOOK_URL to GitHub Secrets and .env.local
# Create webhook: https://api.slack.com/messaging/webhooks

set -e
REQ_ID=$1
AGENT_ID=$2
STATUS=$3
BRANCH=${4:-""}

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "SLACK_WEBHOOK_URL not set. Skipping notification."
  exit 0
fi

if [ -z "$REQ_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$STATUS" ]; then
  echo "Usage: notify-slack.sh <REQ-ID> <agent-id> <status> [branch]"
  exit 1
fi

MSG="Agent $AGENT_ID: $REQ_ID $STATUS"
[ -n "$BRANCH" ] && MSG="$MSG | Branch: $BRANCH"

curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"text\":\"$MSG\"}"
