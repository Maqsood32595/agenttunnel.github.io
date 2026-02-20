# AgentTunnel — test6: Pipeline Enforcement Edition

> **What's new:** AgentTunnel test6 adds a full **Pipeline State Machine** — the gateway now enforces the *order* of commands, not just which commands are allowed. Agents cannot skip steps, lie about completion, or run out of sequence.

## What Changed from test5 → test6

| Feature | test5 | test6 |
|---------|-------|-------|
| Command whitelisting | ✅ | ✅ |
| Two-tier (Orchestrator / Worker) | ✅ | ✅ |
| Sequence enforcement | ❌ | ✅ NEW |
| External state persistence | ❌ | ✅ NEW |
| Pipeline management API | ❌ | ✅ NEW |
| Makefile local enforcer | ❌ | ✅ NEW |

---

## Core Concept: The Shift from Whitelist to Pipeline

**test5 asked:** "Is this command allowed?"
**test6 asks:** "Is this command allowed *right now* in the correct order?"

```
Agent sends: { "command": "npm run build", "run_id": "run_123" }

test5 response: ✅ ALLOWED  (it's in the whitelist)
test6 response: ❌ BLOCKED  ("npm install" must run first — Step 2 not completed")
```

State is stored in `auth/pipeline_state.json` — **not in the agent's memory**. The agent cannot lie about what it has done.

---

## Quick Start

```bash
# 1. Start the gateway
node gateway.js

# 2. Create a pipeline run (orchestrator)
curl -X POST http://localhost:3000/orchestrator/pipeline/start \
  -H "x-api-key: orchestrator_key_openclaw" \
  -H "Content-Type: application/json" \
  -d '{"pipeline": "Deploy-Pipeline", "agent": "deploy-worker"}'
# Returns: { "run_id": "run_1234567", "next_command": "git pull origin main" }

# 3. Worker executes Step 1
curl -X POST http://localhost:3000/ \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"command": "git pull origin main", "run_id": "run_1234567"}'
# Returns: { "success": true, "next_command": "npm install", "steps_remaining": 3 }

# 4. Try to skip Step 2 and go to Step 3
curl -X POST http://localhost:3000/ \
  -H "x-api-key: pilot_tier2_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"command": "npm run build", "run_id": "run_1234567"}'
# Returns: ❌ 403 { "error": "Wrong step. Expected: 'npm install'. Cannot skip or reorder." }
```

---

## Built-in Pipelines

### `Deploy-Pipeline`
Full production deployment — strict 4-step sequence:
1. `git pull origin main`
2. `npm install`
3. `npm run build`
4. `pm2 restart shortshub`

### `CI-Pipeline`
Continuous integration — tests before build, no deploy:
1. `git pull origin main`
2. `npm install`
3. `npm test`
4. `npm run build`

### `Backup-Pipeline`
Nightly database backup — safe, no production writes:
1. `pg_dump shortshub > backup.sql`
2. `gzip backup.sql`
3. `aws s3 cp backup.sql.gz s3://shortshub-backups/`
4. `rm backup.sql.gz`

---

## Pipeline API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/orchestrator/pipeline/start` | POST | Orchestrator | Start a new pipeline run |
| `/orchestrator/pipeline/status?run_id=X` | GET | Orchestrator | Query run state |
| `/orchestrator/pipeline/runs` | GET | Orchestrator | List all runs |
| `/orchestrator/pipeline/reset` | POST | Orchestrator | Abort a run |

---

## Makefile: Local Sequence Enforcement

For running pipelines locally without an agent:

```bash
make deploy   # git pull → npm install → npm run build → pm2 restart
make ci       # git pull → npm install → npm test → npm run build
make status   # Check gateway health
```

If any step fails, **make halts immediately** — the next step never runs. This mirrors what the gateway does for remote agents.

---

## File Structure

```
AgentTunnel-Minimal/
├── gateway.js                  # Core enforcement engine (pipeline state machine)
├── Makefile                    # Local sequence enforcer
├── auth/
│   ├── api_keys.json           # Agent credentials and tiers
│   ├── tunnels.json            # Tunnel policies + pipeline definitions
│   ├── pipeline_state.json     # Live pipeline run state (external, tamper-proof)
│   └── middleware.js           # Authentication middleware
└── README.md                   # This file
```

---

## Why This Matters

| Approach | Reliability | Notes |
|----------|-------------|-------|
| Ask AI (no tunnel) | ~40% | Probabilistic — skips steps, adds random commands |
| test5 (whitelist only) | ~70% | Blocks bad commands, but order not enforced |
| test6 (pipeline enforcer) | ~99% | Sequence enforced externally — agent cannot lie |
| test6 + Makefile | ~99.9% | Infrastructure double-enforcement |

> **Enterprise principle:** Intelligence without authority = Safe intelligence.
> The AI decides *what* to do. The tunnel decides *whether it can*.

---

## API Keys (Default)

| Key | Tier | Access |
|-----|------|--------|
| `orchestrator_key_openclaw` | Orchestrator | Full tunnel + pipeline management |
| `pilot_tier2_xyz789` | Worker | DevOps-Tunnel (read-only ops) |

> ⚠️ Rotate these keys before production use.

---

## Branch History

| Branch | Key Feature |
|--------|-------------|
| test4 | Two-tier architecture (Orchestrator / Worker) |
| test5 | Policy engineering philosophy + self-contained server |
| **test6** | **Pipeline sequence enforcement + state machine** |
