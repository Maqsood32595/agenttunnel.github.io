# AgentTunnel 🛡️

**GitOps AI Agent Policy Enforcer**

Zero-trust security layer for AI agents. Define what your agent can do in `auth/tunnels.json` and push to GitHub. Rules sync automatically every 60 seconds.

## Quick Start (GCP Deployment)

### 1. Clone & Run
```bash
git clone https://github.com/Maqsood32595/agenttunnel.github.io.git
cd agenttunnel.github.io
npm install
npm start
```

### 2. Keep It Running (with PM2)
```bash
npm install -g pm2
pm2 start gateway.js --name agenttunnel
pm2 save
pm2 startup
```

### 3. Connect Your Agent
Point OpenClaw (or any agent) to:
```
http://localhost:3000
```

Add header:
```
x-api-key: pilot_tier2_xyz789
```

## Edit Rules via GitHub

1. Edit `auth/tunnels.json` on GitHub
2. Commit and push
3. Wait 60 seconds
4. Your agent's behavior changes automatically!

### Example: Allow Git Operations Only
```json
{
  "GitOps-Tunnel": {
    "allowed_methods": ["GET", "POST"],
    "whitelist_urls": [
      "https://github.com/Maqsood32595/agenttunnel.github.io.git"
    ],
    "allowed_commands": ["git clone", "git pull"]
  }
}
```

## Architecture

```
You (WhatsApp) → OpenClaw → AgentTunnel (Filter) → Allowed Actions
                                  ↓
                            GitHub (Rules)
```

## Files
- `gateway.js` - Main server
- `auth/tunnels.json` - Policy rules (GitOps)
- `auth/middleware.js` - API key validation
- `auth/api_keys.json` - Your API keys

## License
MIT
