#!/bin/bash
# Tunnel-Validated Git Clone for OpenClaw
# This script asks AgentTunnel for permission before cloning

URL=$1

if [ -z "$URL" ]; then
  echo "❌ Usage: $0 <git-url>"
  exit 1
fi

echo "🔍 Checking with AgentTunnel..."

# Ask AgentTunnel for permission
RESPONSE=$(curl -s -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"git_clone\", \"url\": \"$URL\"}")

# Check if allowed
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Tunnel ALLOWED - Cloning $URL"
  git clone "$URL"
  exit 0
else
  echo "❌ Tunnel BLOCKED"
  echo "   Reason: $RESPONSE"
  exit 1
fi
