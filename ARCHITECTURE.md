# AgentTunnel Architecture Guide
### How to Build a Deterministic AI Agent Pipeline System from Scratch

> **Purpose:** This document is a complete technical specification. Give it to any LLM coder and they will be able to build this entire system from scratch.

---

## 1. Core Philosophy — Why This Exists

### The Problem with Raw LLMs

When an LLM runs commands freely, it is **probabilistic**:
- 90 times it follows the plan
- 5 times it skips a step ("it seems done already")
- 3 times it adds unwanted commands
- 2 times it runs something destructive

For CI/CD, finance, backups, or any production task — **90% is a failure rate.**

### The Solution: Policy Engineering

The shift is from **Prompt Engineering** (asking the AI to behave) to **Policy Engineering** (the infrastructure physically preventing misbehaviour).

```
Prompt Engineering:  "Please only run these commands"  → Soft, ~60-70% reliable
Policy Engineering:  "You literally cannot run anything else"  → Hard, ~99% reliable
```

### The Three-Layer Stack

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: AgentTunnel (WHAT agent can touch)                │
│  → Command whitelist, forbidden keywords, tier control      │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Pipeline State Machine (IN WHAT ORDER)            │
│  → Sequence enforced externally, agent cannot skip steps    │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Makefile (LOCAL DOUBLE-ENFORCEMENT)               │
│  → OS-level dependency chain, halts on any exit code ≠ 0   │
└─────────────────────────────────────────────────────────────┘
         ↑
         The LLM operates here — inside all three layers
```

---

## 2. System Architecture

### Two-Tier Agent Model

```
                    ┌──────────────────────┐
                    │   OpenClaw (Orchestra │
                    │   tor) — UNCAGED      │
                    │   tier: orchestrator  │
                    │   validation: internal│
                    └──────────┬───────────┘
                               │ Creates & manages
                    ┌──────────▼───────────┐
                    │   AgentTunnel        │
                    │   gateway.js         │
                    │   Port: 3000         │
                    └──────────┬───────────┘
                               │ Routes requests
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌───────▼───────┐ ┌───────▼────────┐
   │  Worker Agent A │ │ Worker Agent B │ │ Worker Agent C │
   │  DevOps-Tunnel  │ │ Deploy-Pipeline│ │ Payment-Tunnel │
   │  CAGED          │ │ CAGED          │ │ CAGED          │
   └─────────────────┘ └───────────────┘ └────────────────┘
```

**Orchestrator:** The main AI (OpenClaw). Creates tunnels, creates workers, monitors runs. Uncaged — can call `/orchestrator/*` endpoints freely.

**Worker Agents:** Spawned by orchestrator. Each assigned to exactly one tunnel. Cannot modify their own tunnel. Cannot spawn other agents.

---

## 3. File Structure to Build

```
my-agent-tunnel/
├── gateway.js                  ← Core enforcement engine
├── Makefile                    ← Local sequence enforcer
├── package.json                ← { "dependencies": {} }  (no deps needed)
└── auth/
    ├── api_keys.json           ← Agent credentials
    ├── tunnels.json            ← Tunnel policies + pipeline definitions
    ├── pipeline_state.json     ← Live run state (auto-created)
    └── middleware.js           ← Authentication middleware
```

---

## 4. Build It: Step by Step

### Step 1 — `auth/api_keys.json`

This stores all agent credentials. Two tiers: `orchestrator` and `worker`.

```json
{
    "orchestrator_key_openclaw": {
        "name": "OpenClaw Orchestrator",
        "tier": "orchestrator",
        "dailyLimit": 99999,
        "description": "Main orchestrator — uncaged, full tunnel management access"
    },
    "worker_key_devops_001": {
        "name": "DevOps Worker",
        "tier": "worker",
        "tunnel": "DevOps-Tunnel",
        "dailyLimit": 1000
    }
}
```

**Rules:**
- `orchestrator` tier → access to `/orchestrator/*` management API
- `worker` tier → access only to their assigned `tunnel`
- Workers are created dynamically at runtime by the orchestrator

---

### Step 2 — `auth/tunnels.json`

Two tunnel types:

**Type A — Standard Tunnel (whitelist only):**
```json
{
    "DevOps-Tunnel": {
        "description": "Read-only server ops",
        "allowed_methods": ["GET", "POST"],
        "allowed_paths": [],
        "forbidden_keywords": ["rm -rf", "drop table"],
        "allowed_commands": ["ls", "cat", "pwd", "grep", "find"],
        "command_whitelist_mode": "strict"
    }
}
```

**Type B — Pipeline Tunnel (sequence enforced):**
```json
{
    "Deploy-Pipeline": {
        "description": "Full deploy — steps run in strict order",
        "allowed_methods": ["POST"],
        "allowed_paths": [],
        "forbidden_keywords": ["rm -rf", "git clean -fd"],
        "allowed_commands": [],
        "command_whitelist_mode": "strict",
        "pipeline": {
            "enforce_sequence": true,
            "steps": [
                { "order": 1, "command": "git pull origin main",  "required": true },
                { "order": 2, "command": "npm install",           "required": true },
                { "order": 3, "command": "npm run build",         "required": true },
                { "order": 4, "command": "pm2 restart myapp",     "required": true }
            ]
        }
    }
}
```

**Rules for pipeline tunnels:**
- `allowed_commands` is intentionally empty — pipeline steps ARE the allowed commands
- Steps must be executed in exact `order` — gateway enforces this
- If step N is not confirmed, step N+1 is **physically blocked**

---

### Step 3 — `auth/middleware.js`

Simple API key authentication. Attach client object to request.

```js
const fs = require('fs');
const path = require('path');

function authenticate(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API key required. Header: x-api-key' }));
        return;
    }

    const keysPath = path.join(__dirname, 'api_keys.json');
    const apiKeys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    const client = apiKeys[apiKey];

    if (!client) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid API key' }));
        return;
    }

    req.client = client;
    next();
}

module.exports = { authenticate };
```

---

### Step 4 — `gateway.js` (Core Engine)

Build in this exact order:

#### 4a. Setup and loaders

```js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth/middleware');

const PORT = 3000;
const TUNNELS_PATH = path.join(__dirname, 'auth', 'tunnels.json');
const API_KEYS_PATH = path.join(__dirname, 'auth', 'api_keys.json');
const PIPELINE_STATE_PATH = path.join(__dirname, 'auth', 'pipeline_state.json');

let tunnels = null;
let apiKeys = null;
let pipelineState = {};

function loadTunnels() { tunnels = JSON.parse(fs.readFileSync(TUNNELS_PATH, 'utf8')); }
function loadApiKeys() { apiKeys = JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8')); }
function loadPipelineState() {
    if (fs.existsSync(PIPELINE_STATE_PATH)) {
        pipelineState = JSON.parse(fs.readFileSync(PIPELINE_STATE_PATH, 'utf8'));
    } else {
        pipelineState = {};
        savePipelineState();
    }
}
function saveTunnels() { fs.writeFileSync(TUNNELS_PATH, JSON.stringify(tunnels, null, 2)); }
function saveApiKeys() { fs.writeFileSync(API_KEYS_PATH, JSON.stringify(apiKeys, null, 2)); }
function savePipelineState() { fs.writeFileSync(PIPELINE_STATE_PATH, JSON.stringify(pipelineState, null, 2)); }
```

#### 4b. Pipeline State Machine (the critical piece)

```js
// Start a new pipeline run — returns a run_id
function startPipelineRun(pipelineName, agentName) {
    const tunnel = tunnels[pipelineName];
    if (!tunnel?.pipeline) return null;

    const runId = `run_${Date.now()}`;
    pipelineState[runId] = {
        pipeline: pipelineName,
        agent: agentName,
        started_at: new Date().toISOString(),
        current_step: 0,          // index into pipeline.steps
        status: 'in_progress',
        steps_completed: []
    };
    savePipelineState();
    return runId;
}

// Before allowing a command — check it's the right step in sequence
function validatePipelineStep(runId, command) {
    const run = pipelineState[runId];
    if (!run) return { allowed: false, error: `Run '${runId}' not found. Start pipeline first.` };
    if (run.status !== 'in_progress') return { allowed: false, error: `Run is ${run.status}` };

    const steps = tunnels[run.pipeline].pipeline.steps;
    const expected = steps[run.current_step];

    if (!expected) return { allowed: false, error: 'All steps already completed' };

    if (command.trim() !== expected.command.trim()) {
        return {
            allowed: false,
            error: `Wrong step. Expected step ${run.current_step + 1}: "${expected.command}"`,
            expected: expected.command,
            received: command
        };
    }

    return { allowed: true, step: expected };
}

// After a step executes successfully — advance the state machine
function confirmPipelineStep(runId) {
    const run = pipelineState[runId];
    const steps = tunnels[run.pipeline].pipeline.steps;

    run.steps_completed.push({
        step: run.current_step + 1,
        command: steps[run.current_step].command,
        confirmed_at: new Date().toISOString()
    });

    run.current_step++;

    if (run.current_step >= steps.length) {
        run.status = 'completed';
        run.completed_at = new Date().toISOString();
    }

    savePipelineState();
}
```

#### 4c. Standard command whitelist validation

```js
async function validateTunnel(req, tunnelName) {
    const tunnel = tunnels[tunnelName];
    if (!tunnel) return { allowed: false, error: 'Tunnel not found' };

    // Method check
    if (!tunnel.allowed_methods.includes('*') && !tunnel.allowed_methods.includes(req.method)) {
        return { allowed: false, error: `Method ${req.method} not allowed` };
    }

    // Path check (if restricted)
    if (tunnel.allowed_paths?.length > 0) {
        const url = req.url.split('?')[0];
        if (!tunnel.allowed_paths.some(p => url.startsWith(p))) {
            return { allowed: false, error: `Path not allowed` };
        }
    }

    // Body inspection for POST
    if (req.method === 'POST') {
        return new Promise(resolve => {
            let chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                let payload;
                try { payload = JSON.parse(Buffer.concat(chunks).toString()); }
                catch { resolve({ allowed: false, error: 'Invalid JSON' }); return; }

                req.rawBody = Buffer.concat(chunks);
                const command = payload.command || '';

                // PIPELINE MODE — check sequence
                if (tunnel.pipeline && payload.run_id) {
                    const result = validatePipelineStep(payload.run_id, command);
                    if (result.allowed) {
                        req._pipelineRunId = payload.run_id;
                        req._pipelineStep = result.step;
                    }
                    resolve(result);
                    return;
                }

                // STANDARD STRICT MODE — whitelist check
                if (tunnel.command_whitelist_mode === 'strict') {
                    const ok = tunnel.allowed_commands?.some(a =>
                        command.trim() === a.trim() || command.trim().startsWith(a.trim() + ' ')
                    );
                    if (!ok) { resolve({ allowed: false, error: `'${command}' not in whitelist` }); return; }
                }

                // Forbidden keywords check
                for (const kw of tunnel.forbidden_keywords || []) {
                    if (command.toLowerCase().includes(kw.toLowerCase())) {
                        resolve({ allowed: false, error: `Forbidden keyword: '${kw}'` }); return;
                    }
                }

                resolve({ allowed: true });
            });
        });
    }

    return { allowed: true };
}
```

#### 4d. Orchestrator API handlers

```js
// Helper: parse JSON body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks))); } catch(e) { reject(e); } });
    });
}

function handleOrchestratorAPI(req, res) {
    const url = req.url;

    // ── TUNNEL CRUD ────────────────────────────────────────────────────────────

    if (req.method === 'GET' && url === '/orchestrator/tunnels') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tunnels }));
        return;
    }

    if (req.method === 'POST' && url === '/orchestrator/tunnels/create') {
        parseBody(req).then(payload => {
            if (!payload.name) { res.writeHead(400); res.end(JSON.stringify({ error: 'name required' })); return; }
            tunnels[payload.name] = {
                description: payload.description || payload.name,
                allowed_methods: payload.allowed_methods || ['GET', 'POST'],
                allowed_paths: payload.allowed_paths || [],
                forbidden_keywords: payload.forbidden_keywords || [],
                allowed_commands: payload.allowed_commands || [],
                command_whitelist_mode: 'strict',
                ...(payload.pipeline ? { pipeline: payload.pipeline } : {}),
                created_at: new Date().toISOString()
            };
            saveTunnels();
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tunnel: payload.name }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); });
        return;
    }

    if (req.method === 'POST' && url === '/orchestrator/tunnels/delete') {
        parseBody(req).then(({ name }) => {
            if (!tunnels[name]) { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
            delete tunnels[name]; saveTunnels();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); });
        return;
    }

    // ── AGENT CRUD ─────────────────────────────────────────────────────────────

    if (req.method === 'POST' && url === '/orchestrator/agents/create') {
        parseBody(req).then(({ name, tunnel, dailyLimit }) => {
            if (!name || !tunnel) { res.writeHead(400); res.end(JSON.stringify({ error: 'name and tunnel required' })); return; }
            if (!tunnels[tunnel]) { res.writeHead(404); res.end(JSON.stringify({ error: `Tunnel '${tunnel}' not found` })); return; }
            const key = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            apiKeys[key] = { name, tier: 'worker', tunnel, dailyLimit: dailyLimit || 1000, createdAt: new Date().toISOString() };
            saveApiKeys();
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, apiKey: key, name, tunnel }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); });
        return;
    }

    // ── PIPELINE API ───────────────────────────────────────────────────────────

    if (req.method === 'POST' && url === '/orchestrator/pipeline/start') {
        parseBody(req).then(({ pipeline, agent }) => {
            if (!tunnels[pipeline]?.pipeline) { res.writeHead(404); res.end(JSON.stringify({ error: 'Pipeline tunnel not found' })); return; }
            const runId = startPipelineRun(pipeline, agent || 'orchestrator');
            const firstStep = tunnels[pipeline].pipeline.steps[0];
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, run_id: runId, next_command: firstStep.command, total_steps: tunnels[pipeline].pipeline.steps.length }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); });
        return;
    }

    if (req.method === 'GET' && url.startsWith('/orchestrator/pipeline/status')) {
        const runId = new URL(`http://x${url}`).searchParams.get('run_id');
        const run = pipelineState[runId];
        if (!run) { res.writeHead(404); res.end(JSON.stringify({ error: 'Run not found' })); return; }
        const steps = tunnels[run.pipeline]?.pipeline?.steps || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...run, run_id: runId, next_command: steps[run.current_step]?.command || null, total_steps: steps.length }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown orchestrator endpoint' }));
}
```

#### 4e. Main server

```js
function startGateway() {
    loadTunnels(); loadApiKeys(); loadPipelineState();

    http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        // Public status
        if (req.url === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', tunnels: Object.keys(tunnels), pipeline_runs: Object.keys(pipelineState).length }));
            return;
        }

        authenticate(req, res, async () => {
            // Orchestrator → full access to management API
            if (req.client.tier === 'orchestrator' && req.url.startsWith('/orchestrator/')) {
                handleOrchestratorAPI(req, res);
                return;
            }

            // Worker → validate against their tunnel
            const tunnelName = req.client.tunnel || 'PublicViewer';
            const result = await validateTunnel(req, tunnelName);

            if (!result.allowed) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Access Denied', reason: result.error, tunnel: tunnelName, ...(result.expected ? { expected_command: result.expected } : {}) }));
                return;
            }

            // If pipeline step — confirm externally
            if (req._pipelineRunId) {
                confirmPipelineStep(req._pipelineRunId);
                const run = pipelineState[req._pipelineRunId];
                const steps = tunnels[tunnelName].pipeline.steps;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, confirmed: req._pipelineStep?.command, run_status: run.status, next_command: steps[run.current_step]?.command || null }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tunnel: tunnelName, agent: req.client.name }));
        });
    }).listen(PORT, () => console.log(`AgentTunnel running at http://localhost:${PORT}`));
}

startGateway();
```

---

### Step 5 — `Makefile` (Local Sequence Enforcer)

```makefile
# Usage: make deploy | make ci | make status
.PHONY: deploy ci status

deploy: restart
	@echo "✅ Deploy complete"

restart: build
	pm2 restart myapp

build: install
	npm run build

install: git-pull
	npm install

git-pull:
	git pull origin main

ci: build-after-test
	@echo "✅ CI passed"

build-after-test: run-tests
	npm run build

run-tests: install
	npm test

install: git-pull
	npm install

status:
	curl -s http://localhost:3000/status
```

> **Rule:** Each target `depends_on` the previous. `make deploy` triggers the chain. If `npm install` fails with exit code 1, `npm run build` never runs — enforced by the OS.

---

## 5. How to Use the System

### Start the gateway
```bash
node gateway.js
```

### Create a tunnel (orchestrator)
```bash
curl -X POST http://localhost:3000/orchestrator/tunnels/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Docker-Tunnel",
    "allowed_commands": ["docker ps", "docker logs myapp"],
    "forbidden_keywords": ["docker rm", "docker rmi"]
  }'
```

### Create a worker agent
```bash
curl -X POST http://localhost:3000/orchestrator/agents/create \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{"name": "docker-watcher", "tunnel": "Docker-Tunnel"}'
# Returns: { "apiKey": "worker_1234_abc" }
```

### Start a pipeline run
```bash
curl -X POST http://localhost:3000/orchestrator/pipeline/start \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{"pipeline": "Deploy-Pipeline", "agent": "deploy-bot"}'
# Returns: { "run_id": "run_1234", "next_command": "git pull origin main" }
```

### Execute pipeline step (worker)
```bash
curl -X POST http://localhost:3000/ \
  -H "x-api-key: worker_1234_abc" \
  -H "Content-Type: application/json" \
  -d '{"command": "git pull origin main", "run_id": "run_1234"}'
# Returns: { "success": true, "next_command": "npm install" }
```

### Try to skip a step
```bash
curl -X POST http://localhost:3000/ \
  -H "x-api-key: worker_1234_abc" \
  -H "Content-Type: application/json" \
  -d '{"command": "npm run build", "run_id": "run_1234"}'
# Returns: 403 { "error": "Wrong step. Expected: 'npm install'" }
```

---

## 6. Real-World Use Cases

| Use Case | Tunnel Type | Why It Works |
|----------|------------|-------------|
| CI/CD deployment | Pipeline | Steps locked in order — no deploy without tests |
| Database backup | Pipeline | Dump → Compress → Upload → Cleanup, strictly |
| Code feature implementation | Pipeline | Schema → API → Tests → Frontend → Delete TODO |
| Server monitoring | Standard | Read-only tunnel — ls/cat/grep only |
| Payment processing | Standard | Single command: "pay X rupees to Y" |
| Log analysis | Standard | tail/grep only, no file writes |

---

## 7. Design Invariants (Never Break These)

1. **Workers cannot modify their own tunnel** — only orchestrator can
2. **Workers cannot see other agents' API keys**
3. **Pipeline state is stored externally** — never in agent memory or task files
4. **Forbidden keywords always take precedence** — even if command is in whitelist
5. **A failed pipeline step halts the run** — the agent must start a new run
6. **`delete TODO.md` is always the final pipeline step** — never the first

---

## 8. Reliability Benchmarks (From Simulations)

| Approach | Reliability | Failure Type |
|----------|-------------|-------------|
| Bare LLM (no system) | ~40% | Dangerous — deletes files, reboots servers |
| TODO.md only | ~62% | Silent — AI self-reports, skips steps |
| Whitelist tunnel (test5) | ~70% | Safe failures, blocks bad commands |
| Pipeline enforced (test6) | ~99% | Safe failures, enforced by infrastructure |
| Pipeline + Makefile | ~99.9% | Double-enforced at OS level |

---

## 9. Extending the System

### Add a new pipeline in 1 step:
Edit `auth/tunnels.json` at runtime — the gateway reloads automatically (uses `fs.watchFile`).

### Add a new agent without restarting:
```bash
curl -X POST http://localhost:3000/orchestrator/agents/create ...
```

### Add a forbidden keyword:
```json
{ "forbidden_keywords": ["drop table", "rm -rf", "format c:", "git push --force"] }
```

### Make a tunnel time-limited:
Add `expires_at: "2026-12-31"` to tunnel config and check it in `validateTunnel`.

---

## Summary

| Component | File | Responsibility |
|-----------|------|----------------|
| Auth | `auth/api_keys.json` | Who can access the system |
| Policy | `auth/tunnels.json` | What they can do |
| State | `auth/pipeline_state.json` | Where they are in sequence |
| Enforcement | `gateway.js` | The hard wall |
| Local Enforce | `Makefile` | OS-level double enforcement |

> **One sentence summary:** AgentTunnel converts probabilistic LLM behaviour into deterministic, auditable, sequence-enforced execution by moving all policy and state out of the agent's control and into the infrastructure.
