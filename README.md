# AgentTunnel 🛡️ (Two-Tier Architecture - test3)

**Orchestrator + Worker Agent Policy Enforcer**

OpenClaw is the **uncaged orchestrator** with full control. Worker agents are **caged** inside their specific tunnels.

---

## 🏗️ Architecture

```
You (WhatsApp)
      ↓
OpenClaw (Orchestrator - UNCAGED)
      ↓ creates tunnels for ↓
┌─────────────────────────────────────┐
│                                     │
Payment Agent    DevOps Agent    Data Agent
(tunnel: pay     (tunnel: read   (tunnel: read
 1 rupee only)    files only)     DB only)
```

---

## 🚀 Quick Start

```bash
git clone -b test3 https://github.com/Maqsood32595/agenttunnel.github.io.git
cd agenttunnel.github.io
node gateway.js
```

---

## 👑 Orchestrator API (OpenClaw - Full Access)

Use API key: `orchestrator_key_openclaw`

### List all tunnels
```bash
curl http://localhost:3000/orchestrator/tunnels \
  -H "x-api-key: orchestrator_key_openclaw"
```

### Create a tunnel for a new worker agent
```bash
curl -X POST http://localhost:3000/orchestrator/tunnels/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Payment-Tunnel",
    "description": "Payment worker - 1 rupee only",
    "allowed_commands": ["pay 1 rupee to maqsood"],
    "allowed_methods": ["POST"]
  }'
```

### Create a worker agent API key
```bash
curl -X POST http://localhost:3000/orchestrator/agents/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Payment Agent",
    "tunnel": "Payment-Tunnel"
  }'
```

### Update a tunnel (add more commands)
```bash
curl -X POST http://localhost:3000/orchestrator/tunnels/update \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DevOps-Tunnel",
    "allowed_commands": ["ls", "cat", "pwd", "git pull"]
  }'
```

### Delete a tunnel
```bash
curl -X POST http://localhost:3000/orchestrator/tunnels/delete \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{"name": "Payment-Tunnel"}'
```

### List all worker agents
```bash
curl http://localhost:3000/orchestrator/agents \
  -H "x-api-key: orchestrator_key_openclaw"
```

---

## 🔒 Worker Agent Validation

Workers use their own API keys and are caged in their tunnel.

```bash
# Worker validates a command (will be checked against their tunnel)
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"command": "ls"}'
```

---

## 📂 Files

- `gateway.js` - Main server with two-tier logic
- `auth/tunnels.json` - Worker tunnel policies
- `auth/api_keys.json` - Orchestrator + worker API keys
- `auth/middleware.js` - Authentication

---

## 🔑 Default API Keys

| Key | Role | Access |
|-----|------|--------|
| `orchestrator_key_openclaw` | Orchestrator | Full - create/manage tunnels |
| `pilot_tier2_xyz789` | Worker | DevOps-Tunnel only |
| `demo_tier1_abc123` | Worker | PublicViewer only |

---

## ⚡ Key Differences from test2

| Feature | test2 | test3 |
|---------|-------|-------|
| OpenClaw access | Caged | Uncaged (orchestrator) |
| Tunnel management | Manual file edit | API-driven |
| Worker agents | Single policy | Per-agent policies |
| Dynamic rules | File watch | API + file watch |

---

## License
MIT
