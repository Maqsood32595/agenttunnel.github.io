#!/bin/bash
# Universal Tunnel Validator - ALL commands go through AgentTunnel
# OpenClaw MUST use this for any shell operation

COMMAND="$@"

if [ -z "$COMMAND" ]; then
  echo "❌ Usage: tunnel_exec.sh <command>"
  exit 1
fi

echo "🔍 Validating with AgentTunnel: $COMMAND"

# Send to AgentTunnel for validation
RESPONSE=$(curl -s -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d "{\"command\": \"$COMMAND\"}")

# Check response
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ ALLOWED by tunnel"
  eval "$COMMAND"
  exit $?
else
  echo "❌ BLOCKED by tunnel"
  echo "   Response: $RESPONSE"
  exit 1
fi
