# AgentTunnel 🛡️ (Local-Only - test2)

**Minimal AI Agent Policy Enforcer**

Strict whitelist enforcement with ZERO external dependencies. The agent can ONLY execute commands you explicitly allow.

---

## 🚀 Quick Start (GCP Deployment)

### Step 1: Clone & Install
```bash
# Clone the test2 branch
git clone -b test2 https://github.com/Maqsood32595/agenttunnel.github.io.git
cd agenttunnel.github.io

# No dependencies needed - pure Node.js
node gateway.js
```

### Step 2: Run in Background (PM2)
```bash
npm install -g pm2
pm2 start gateway.js --name agenttunnel
pm2 save
pm2 startup
```

**Tunnel is now running on `http://localhost:3000`** ✅

---

## 🔒 How It Works

**Strict Whitelist Mode:**
- Agent can ONLY execute commands in `allowed_commands` array
- Everything else = BLOCKED
- No exceptions, no bypasses

**Current Default (GitOps-Tunnel):**
- ✅ `cat` - Read tunnel config
- ✅ `nano` / `vi` - Edit tunnel config
- ❌ Everything else (git, ls, rm, shutdown, etc.)

---

## 📝 Updating Rules

Edit the local file:
```bash
nano auth/tunnels.json
```

Changes take effect **immediately** (file watcher auto-reloads).

### Example: Allow More Commands
```json
{
  "GitOps-Tunnel": {
    "allowed_commands": [
      "cat",
      "nano",
      "vi",
      "ls",
      "pwd"
    ],
    "command_whitelist_mode": "strict"
  }
}
```

Now agent can also use `ls` and `pwd`.

---

## 🧪 Testing

```bash
# Check status
curl http://localhost:3000/status

# Test BLOCKED command
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"command": "shutdown now"}'

# Expected: 403 - "Command not in whitelist"

# Test ALLOWED command
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"command": "cat tunnels.json"}'

# Expected: 200 - "Request allowed"
```

---

## 🔑 API Keys

Default keys (edit in `auth/api_keys.json`):
- `pilot_tier2_xyz789` - GitOps-Tunnel (ultra-strict)
- `demo_tier1_abc123` - PublicViewer (status only)

---

## 📂 Files

- `gateway.js` - Main server (port 3000)
- `auth/tunnels.json` - Policy rules (auto-reloads on change)
- `auth/middleware.js` - API key validation
- `auth/api_keys.json` - Valid API keys

---

## ⚡ Key Differences from test1

| Feature | test1 | test2 |
|---------|-------|-------|
| GitOps (GitHub sync) | ✅ Yes | ❌ No |
| External dependencies | GitHub API | None |
| Config updates | 60s delay | Instant |
| Stability | Terminates randomly | Stable |
| Whitelist enforcement | Buggy | Fixed |

---

## 🛠️ OpenClaw Integration

**System Prompt:**
```
You must validate ALL shell commands with AgentTunnel before execution.

Use: ./tools/tunnel_exec.sh <command>

If tunnel returns BLOCKED, you MUST refuse and explain to user.
Never bypass or find workarounds.
```

**Wrapper Script:**
```bash
#!/bin/bash
COMMAND="$@"
RESPONSE=$(curl -s -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d "{\"command\": \"$COMMAND\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
  eval "$COMMAND"
else
  echo "❌ BLOCKED by tunnel: $RESPONSE"
  exit 1
fi
```

---

## License
MIT
