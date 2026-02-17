# AgentTunnel 🛡️

**GitOps AI Agent Policy Enforcer**

Zero-trust security layer that validates AI agent actions before execution. Define what your agent can do in `auth/tunnels.json`, and the rules sync from GitHub every 60 seconds.

---

## 🚀 Quick Start (GCP Deployment)

### Step 1: Clone & Install
```bash
# Clone the test1 branch (latest stable)
git clone -b test1 https://github.com/Maqsood32595/agenttunnel.github.io.git
cd agenttunnel.github.io

# Install dependencies (none required - pure Node.js)
npm install

# Start the tunnel
node gateway.js
```

### Step 2: Keep It Running (PM2)
```bash
npm install -g pm2
pm2 start gateway.js --name agenttunnel
pm2 save
pm2 startup
```

**Tunnel is now running on `http://localhost:3000`** ✅

---

## 🤝 OpenClaw Integration

### How It Works

```
You (WhatsApp) → OpenClaw → "Can I run git clone X?" → AgentTunnel
                                                              ↓
                                                         ✅ YES / ❌ NO
                                                              ↓
                               OpenClaw ← Response ← AgentTunnel
                                    ↓
                         Executes (if allowed) or Rejects
```

**AgentTunnel does NOT execute commands.** It only validates them.

### Step 3: Configure OpenClaw to Use AgentTunnel

OpenClaw needs custom tools that check with AgentTunnel before executing.

#### Option A: Load Custom Tools (Recommended)
Create a file `~/.openclaw/tools/tunnel_git.json`:

```json
{
  "name": "git_clone",
  "description": "Clone a git repository (tunnel-validated)",
  "pre_validation": {
    "endpoint": "http://localhost:3000/validate",
    "method": "POST",
    "headers": {
      "x-api-key": "pilot_tier2_xyz789",
      "Content-Type": "application/json"
    },
    "body": {
      "action": "git_clone",
      "url": "{{url}}"
    }
  },
  "execute_if_allowed": "git clone {{url}}"
}
```

#### Option B: Manual Prompting
When you ask OpenClaw to do something:
1. OpenClaw sends a validation request to `http://localhost:3000`
2. If response is `{"success": true}`, OpenClaw executes
3. If response is `403`, OpenClaw refuses and tells you why

---

## 🔒 Current Policy (GitOps-Tunnel)

By default, the tunnel **ONLY allows**:
- Git operations on: `https://github.com/Maqsood32595/agenttunnel.github.io.git`
- No other repositories
- No destructive operations (DELETE, DROP, etc.)

### Example Request (What OpenClaw Sends)
```bash
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "git_clone",
    "url": "https://github.com/Maqsood32595/agenttunnel.github.io.git"
  }'
```

**Response (Allowed):**
```json
{
  "success": true,
  "message": "Request allowed by tunnel policy",
  "tunnel": "GitOps-Tunnel"
}
```

**Response (Blocked):**
```json
{
  "error": "Access Denied by Tunnel Policy",
  "reason": "URL not in whitelist"
}
```

---

## 📝 Updating Rules (GitOps)

1. Edit `auth/tunnels.json` on GitHub (test1 branch)
2. Commit and push
3. Wait 60 seconds
4. AgentTunnel auto-syncs the new rules
5. OpenClaw's behavior changes immediately

### Example: Allow Payment Operations
```json
{
  "DevOps-Tunnel": {
    "allowed_methods": ["POST"],
    "allowed_paths": ["/pay"],
    "forbidden_keywords": []
  }
}
```

---

## 🧪 Testing the Tunnel

```bash
# Test status (no auth required)
curl http://localhost:3000/status

# Test validation (requires API key)
curl -X POST http://localhost:3000/validate \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"action": "git_clone", "url": "https://github.com/hacker/evil.git"}'

# Expected: 403 - URL not whitelisted
```

---

## 📂 Files

- `gateway.js` - Main tunnel server (port 3000)
- `auth/tunnels.json` - Policy rules (synced from GitHub)
- `auth/middleware.js` - API key authentication
- `auth/api_keys.json` - Valid API keys

---

## 🔑 API Keys

Default keys (change in production):
- `pilot_tier2_xyz789` - DevOps-Tunnel (general use)
- `demo_tier1_abc123` - PublicViewer (read-only)

---

## ⚙️ Environment Variables

```bash
# Optional: Change GitHub sync URL
GITHUB_CONFIG_URL=https://raw.githubusercontent.com/YOUR_REPO/main/auth/tunnels.json

# Start tunnel
node gateway.js
```

---

## 🛡️ Architecture

**Validator-Only Design:**
- AgentTunnel validates requests against policies
- OpenClaw executes (or refuses) based on validation
- No command execution in AgentTunnel (low latency, low cost)

**GitOps:**
- Rules stored in version control (GitHub)
- Every change is audited
- Agents can propose rule changes via Pull Requests

---

## License
MIT
