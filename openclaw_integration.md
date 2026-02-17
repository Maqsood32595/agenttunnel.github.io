# OpenClaw + AgentTunnel Integration Guide

## What This Does

AgentTunnel acts as a **policy validator** that OpenClaw consults before executing commands.

**Flow:**
```
You → WhatsApp → OpenClaw → "Can I do X?" → AgentTunnel → YES/NO → OpenClaw
```

---

## Setup on GCloud Server

### 1. Start AgentTunnel (Terminal 1)
```bash
cd ~/agenttunnel.github.io
pm2 start gateway.js --name agenttunnel
pm2 logs agenttunnel
```

You should see:
```
🌍 AgentTunnel Active at http://localhost:3000
🔒 Security: ENABLED
🔄 GitOps: ENABLED
```

### 2. Configure OpenClaw to Use Tunnel

OpenClaw needs to know:
1. Before executing any command, check with AgentTunnel
2. Send request to `http://localhost:3000/validate`
3. Include API key: `pilot_tier2_xyz789`

---

## Custom Tool for OpenClaw

Create this file on your GCloud server:

**File:** `~/openclaw_tools/git_clone_validated.sh`
```bash
#!/bin/bash
# Tunnel-validated git clone

URL=$1

# Ask AgentTunnel for permission
RESPONSE=$(curl -s -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"git_clone\", \"url\": \"$URL\"}")

# Check if allowed
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Tunnel ALLOWED - Cloning $URL"
  git clone "$URL"
else
  echo "❌ Tunnel BLOCKED - $RESPONSE"
  exit 1
fi
```

Make it executable:
```bash
chmod +x ~/openclaw_tools/git_clone_validated.sh
```

### Tell OpenClaw to Use This Tool

When OpenClaw wants to clone a repo, it should run:
```bash
~/openclaw_tools/git_clone_validated.sh <URL>
```

Instead of:
```bash
git clone <URL>
```

---

## Testing

### Test 1: Allowed URL
```bash
./git_clone_validated.sh https://github.com/Maqsood32595/agenttunnel.github.io.git
```
**Expected:** ✅ Clones successfully

### Test 2: Blocked URL
```bash
./git_clone_validated.sh https://github.com/hacker/malware.git
```
**Expected:** ❌ "Tunnel BLOCKED - URL not in whitelist"

---

## How OpenClaw Learns to Use This

### Option 1: System Prompt
Add to OpenClaw's system prompt:
```
Before executing any git command, you must validate it with AgentTunnel.
Use the script: ~/openclaw_tools/git_clone_validated.sh <URL>
Never use 'git clone' directly.
```

### Option 2: Tool Registration
If OpenClaw supports tool definitions, register:
```json
{
  "name": "clone_repository",
  "script": "~/openclaw_tools/git_clone_validated.sh",
  "args": ["url"]
}
```

---

## Verification

Check AgentTunnel logs:
```bash
pm2 logs agenttunnel
```

You should see:
```
✅ [Gateway] Pilot Client - Tier 2 (DevOps-Tunnel) -> POST /validate
```

Or if blocked:
```
🛑 [Gateway] Tunnel Blocked: tried POST /validate - URL not in whitelist
```

---

## Updating Policies

To allow more repositories:
1. Edit `auth/tunnels.json` on GitHub
2. Add URL to `whitelist_urls`
3. Commit and push
4. Wait 60 seconds
5. AgentTunnel auto-syncs

---

## Troubleshooting

**OpenClaw still clones unauthorized repos?**
- Check if OpenClaw is using the validated script
- Verify system prompt or tool registration

**Tunnel returns 401?**
- Check API key in script: `pilot_tier2_xyz789`
- Verify key exists in `auth/api_keys.json`

**Tunnel returns 403?**
- URL is not in whitelist
- Check `auth/tunnels.json` for allowed URLs
