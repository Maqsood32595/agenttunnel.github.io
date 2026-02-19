# AgentTunnel 🛡️ (test4 - Production Ready)

**Two-Tier Agent Architecture: OpenClaw Free, Sub-Agents Caged**

---

## ⚡ Installation (One Command)

SSH into your GCloud server and run:

```bash
curl -s https://raw.githubusercontent.com/Maqsood32595/agenttunnel.github.io/test4/install.sh | bash
```

**That's it.** The script handles everything automatically.

---

## 🏗️ How It Works

```
You (WhatsApp)
      ↓
OpenClaw (UNCAGED - internal validation, no tunnel delay)
      ↓ uses orchestrator API to create tunnels
Sub-Agent 1        Sub-Agent 2        Sub-Agent 3
(CAGED: only       (CAGED: only       (CAGED: only
 git pull)          pay 1 rupee)       read files)
```

### OpenClaw Config (`openclaw.json`):
- **Main agent:** `validation: internal` → No tunnel overhead, instant responses
- **Sub-agents:** `validation: tunnel` → Forced through port 3000
- **Max spawn depth:** 2 (sub-agents cannot spawn more sub-agents)

---

## 👑 OpenClaw Orchestrator API

API Key: `orchestrator_key_openclaw`

### Create a tunnel for a new sub-agent
```bash
curl -X POST http://localhost:3000/orchestrator/tunnels/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyTask-Tunnel",
    "description": "Sub-agent for deploying app",
    "allowed_commands": ["git pull", "pm2 restart myapp"],
    "allowed_methods": ["POST"]
  }'
```

### Create a sub-agent API key
```bash
curl -X POST http://localhost:3000/orchestrator/agents/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Deploy Agent",
    "tunnel": "MyTask-Tunnel"
  }'
```

### Spawn sub-agent with that key (OpenClaw TUI)
```
Orchestrate a new sub-agent for the task: deploy my app.
Instructions:
1. Spawn using /spawn command
2. Initialize with validation: tunnel
3. Use API key returned from orchestrator/agents/create
4. Hard Guardrail: Every command must be validated via localhost:3000. If tunnel is down, wait and retry, never bypass.
```

---

## 🔒 Worker Validation

Sub-agents use their own API key and get checked:

```bash
# Allowed (in whitelist)
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: <worker-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"command": "git pull"}'
# → {"success":true}

# Blocked (not in whitelist)
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: <worker-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"command": "rm -rf /"}'
# → {"error":"Command 'rm -rf /' not in whitelist"}
```

---

## 🔑 Default API Keys

| Key | Role | Access |
|-----|------|--------|
| `orchestrator_key_openclaw` | Orchestrator | Full - create/manage tunnels |
| `pilot_tier2_xyz789` | Worker | DevOps-Tunnel (ls, cat, pwd) |
| `demo_tier1_abc123` | Worker | PublicViewer (status only) |

---

## ⚡ Key Differences from Previous Branches

| Feature | test1 | test2 | test3 | test4 |
|---------|-------|-------|-------|-------|
| GitOps | ✅ | ❌ | ❌ | ❌ |
| Strict enforcement | ❌ | ✅ | ✅ | ✅ |
| Two-tier | ❌ | ❌ | ✅ | ✅ |
| Auto-install script | ❌ | ❌ | ❌ | ✅ |
| openclaw.json config | ❌ | ❌ | ❌ | ✅ |
| OpenClaw uncaged | ❌ | ❌ | ✅ | ✅ |

---

## 📂 Files

```
gateway.js          - Main two-tier server
openclaw.json       - OpenClaw tier config (copy to ~/.openclaw/)
install.sh          - Automated install script
auth/
  tunnels.json      - Worker tunnel policies (auto-reloads)
  api_keys.json     - Orchestrator + worker API keys
  middleware.js     - Authentication layer
tools/
  tunnel_exec.sh    - Command wrapper for manual testing
```

---

## 🆘 Troubleshooting

**OpenClaw getting stuck in tunnel?**
→ Check `~/.openclaw/openclaw.json` has `"main": { "validation": "internal" }`

**Tunnel not running?**
```bash
cd ~/.openclaw/workspace/agenttunnel.github.io
node gateway.js &
```

**Port 3000 already in use?**
```bash
fuser -k 3000/tcp
```

---

## License
MIT
