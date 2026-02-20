const http = require('http');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth/middleware');

/**
 * 🛡️ AgentTunnel - test6: Pipeline Enforcement Edition
 *
 * NEW IN TEST6:
 * ─────────────────────────────────────────────────────
 * 1. Pipeline State Machine — Tunnels can define ordered steps.
 *    Agents CANNOT skip steps or run out of sequence.
 *
 * 2. External State Persistence — Completed steps are recorded
 *    in auth/pipeline_state.json (not in agent memory).
 *    The agent cannot lie about what it has done.
 *
 * 3. Pipeline API — Orchestrator can define, start, advance,
 *    and query pipeline runs via the /orchestrator/pipeline/* API.
 *
 * INHERITED FROM TEST5:
 * ─────────────────────────────────────────────────────
 * Tier 1: Orchestrator (OpenClaw) - UNCAGED
 * Tier 2: Worker Agents - CAGED within their tunnel policy
 */

const GATEWAY_PORT = 3000;
const TUNNELS_PATH = path.join(__dirname, 'auth', 'tunnels.json');
const API_KEYS_PATH = path.join(__dirname, 'auth', 'api_keys.json');
const PIPELINE_STATE_PATH = path.join(__dirname, 'auth', 'pipeline_state.json');

let tunnelsCache = null;
let apiKeysCache = null;
let pipelineStateCache = {};

// ─── Config Loaders ───────────────────────────────────────────────────────────

function loadTunnels() {
    try {
        tunnelsCache = JSON.parse(fs.readFileSync(TUNNELS_PATH, 'utf8'));
        console.log("✅ [Gateway] Loaded tunnels.json");
    } catch (e) {
        console.error("❌ [Gateway] Failed to load tunnels.json:", e.message);
        process.exit(1);
    }
}

function loadApiKeys() {
    try {
        apiKeysCache = JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8'));
        console.log("✅ [Gateway] Loaded api_keys.json");
    } catch (e) {
        console.error("❌ [Gateway] Failed to load api_keys.json:", e.message);
        process.exit(1);
    }
}

function loadPipelineState() {
    try {
        if (fs.existsSync(PIPELINE_STATE_PATH)) {
            pipelineStateCache = JSON.parse(fs.readFileSync(PIPELINE_STATE_PATH, 'utf8'));
            console.log("✅ [Gateway] Loaded pipeline_state.json");
        } else {
            pipelineStateCache = {};
            savePipelineState();
            console.log("✅ [Gateway] Created new pipeline_state.json");
        }
    } catch (e) {
        pipelineStateCache = {};
        console.warn("⚠️ [Gateway] Could not load pipeline_state.json, starting fresh.");
    }
}

function saveTunnels() { fs.writeFileSync(TUNNELS_PATH, JSON.stringify(tunnelsCache, null, 2)); }
function saveApiKeys() { fs.writeFileSync(API_KEYS_PATH, JSON.stringify(apiKeysCache, null, 2)); }
function savePipelineState() { fs.writeFileSync(PIPELINE_STATE_PATH, JSON.stringify(pipelineStateCache, null, 2)); }

// Watch for runtime config changes
fs.watchFile(TUNNELS_PATH, () => { console.log("🔄 tunnels.json changed, reloading..."); loadTunnels(); });
fs.watchFile(API_KEYS_PATH, () => { console.log("🔄 api_keys.json changed, reloading..."); loadApiKeys(); });

// ─── Pipeline State Machine ───────────────────────────────────────────────────
// This is test6's core feature: sequence enforcement baked into the tunnel.
// State is stored EXTERNALLY — the agent cannot self-report completion.

function startPipelineRun(pipelineName, agentName) {
    const tunnel = tunnelsCache[pipelineName];
    if (!tunnel || !tunnel.pipeline) return null;

    const runId = `run_${Date.now()}`;
    pipelineStateCache[runId] = {
        pipeline: pipelineName,
        agent: agentName,
        started_at: new Date().toISOString(),
        current_step: 0,  // 0-indexed into tunnel.pipeline.steps
        status: 'in_progress',
        steps_completed: []
    };
    savePipelineState();
    console.log(`🚀 [Pipeline] Started run ${runId} for ${pipelineName} by ${agentName}`);
    return runId;
}

function validatePipelineStep(runId, command) {
    const run = pipelineStateCache[runId];
    if (!run) return { allowed: false, error: `Pipeline run '${runId}' not found. Start pipeline first.` };
    if (run.status === 'completed') return { allowed: false, error: `Pipeline run '${runId}' already completed.` };
    if (run.status === 'failed') return { allowed: false, error: `Pipeline run '${runId}' failed. Start a new run.` };

    const tunnel = tunnelsCache[run.pipeline];
    if (!tunnel || !tunnel.pipeline) return { allowed: false, error: "Pipeline config no longer exists." };

    const steps = tunnel.pipeline.steps;
    const expectedStep = steps[run.current_step];

    if (!expectedStep) {
        run.status = 'completed';
        run.completed_at = new Date().toISOString();
        savePipelineState();
        return { allowed: false, error: "All pipeline steps already completed." };
    }

    // Strict sequence check
    if (command.trim() !== expectedStep.command.trim()) {
        return {
            allowed: false,
            error: `Wrong step. Expected step ${run.current_step + 1}: '${expectedStep.command}'. Cannot skip or reorder.`,
            expected: expectedStep.command,
            received: command
        };
    }

    return { allowed: true, step: expectedStep, stepIndex: run.current_step };
}

function confirmPipelineStep(runId) {
    const run = pipelineStateCache[runId];
    if (!run) return;

    const tunnel = tunnelsCache[run.pipeline];
    const steps = tunnel.pipeline.steps;
    const completedStep = steps[run.current_step];

    run.steps_completed.push({
        step: run.current_step + 1,
        command: completedStep.command,
        confirmed_at: new Date().toISOString()
    });

    run.current_step++;

    if (run.current_step >= steps.length) {
        run.status = 'completed';
        run.completed_at = new Date().toISOString();
        console.log(`🏁 [Pipeline] Run ${runId} COMPLETED all ${steps.length} steps.`);
    } else {
        console.log(`⏩ [Pipeline] Run ${runId} advanced to step ${run.current_step + 1}/${steps.length}: '${steps[run.current_step].command}'`);
    }

    savePipelineState();
}

// ─── Standard Tunnel Validation (Non-Pipeline) ───────────────────────────────

async function validateTunnel(req, tunnelName) {
    if (!tunnelsCache) loadTunnels();
    const tunnel = tunnelsCache[tunnelName];
    if (!tunnel) return { allowed: false, error: "Invalid Tunnel Config" };

    if (!tunnel.allowed_methods.includes("*") && !tunnel.allowed_methods.includes(req.method)) {
        return { allowed: false, error: `Method ${req.method} not allowed` };
    }

    if (tunnel.allowed_paths && tunnel.allowed_paths.length > 0) {
        const cleanUrl = req.url.split('?')[0];
        const isPathAllowed = tunnel.allowed_paths.some(p => cleanUrl.startsWith(p));
        if (!isPathAllowed) return { allowed: false, error: `Path ${cleanUrl} not allowed` };
    }

    if (req.method === 'POST' || req.method === 'PUT') {
        return new Promise((resolve) => {
            let body = [];
            req.on('data', chunk => body.push(chunk));
            req.on('end', () => {
                const bodyBuffer = Buffer.concat(body);
                req.rawBody = bodyBuffer;

                let payload;
                try { payload = JSON.parse(bodyBuffer.toString()); }
                catch (e) { resolve({ allowed: false, error: "Invalid JSON payload" }); return; }

                const command = payload.command || payload.url || '';

                // ── PIPELINE MODE: enforce sequence ──────────────────────────
                if (tunnel.pipeline && payload.run_id) {
                    const result = validatePipelineStep(payload.run_id, command);
                    if (result.allowed) {
                        req._pipelineRunId = payload.run_id;
                        req._pipelineValidated = true;
                    }
                    resolve(result);
                    return;
                }

                // ── STANDARD STRICT MODE: whitelist only ─────────────────────
                if (tunnel.command_whitelist_mode === 'strict') {
                    if (!tunnel.allowed_commands || tunnel.allowed_commands.length === 0) {
                        resolve({ allowed: false, error: "No commands allowed in strict mode" }); return;
                    }
                    const isAllowed = tunnel.allowed_commands.some(allowed => {
                        const cmd = command.trim();
                        return cmd === allowed.trim() || cmd.startsWith(allowed.trim() + ' ');
                    });
                    if (!isAllowed) {
                        resolve({ allowed: false, error: `Command '${command}' not in whitelist` }); return;
                    }
                }

                if (tunnel.forbidden_keywords && tunnel.forbidden_keywords.length > 0) {
                    for (const keyword of tunnel.forbidden_keywords) {
                        if (command.toLowerCase().includes(keyword.toLowerCase())) {
                            resolve({ allowed: false, error: `Forbidden keyword '${keyword}' detected` }); return;
                        }
                    }
                }

                resolve({ allowed: true });
            });
            req.on('error', () => resolve({ allowed: false, error: "Body read error" }));
        });
    }

    return { allowed: true };
}

// ─── Orchestrator API (OpenClaw Only) ─────────────────────────────────────────

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(body).toString())); }
            catch (e) { reject(e); }
        });
    });
}

function handleOrchestratorAPI(req, res) {
    const url = req.url;

    // ── Tunnel CRUD ───────────────────────────────────────────────────────────

    if (req.method === 'GET' && url === '/orchestrator/tunnels') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tunnels: tunnelsCache })); return;
    }

    if (req.method === 'GET' && url === '/orchestrator/agents') {
        const workers = Object.entries(apiKeysCache)
            .filter(([_, v]) => v.tier === 'worker')
            .map(([key, v]) => ({ key: key.substring(0, 8) + '...', ...v }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agents: workers })); return;
    }

    if (req.method === 'POST' && url === '/orchestrator/tunnels/create') {
        parseBody(req).then(payload => {
            const { name, allowed_methods, allowed_commands, forbidden_keywords, pipeline } = payload;
            if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Tunnel name required" })); return; }

            tunnelsCache[name] = {
                description: payload.description || `Worker tunnel: ${name}`,
                allowed_methods: allowed_methods || ["GET", "POST"],
                allowed_paths: payload.allowed_paths || [],
                forbidden_keywords: forbidden_keywords || [],
                allowed_commands: allowed_commands || [],
                command_whitelist_mode: "strict",
                ...(pipeline ? { pipeline } : {}),  // ← Pipeline definition (optional)
                created_by: "orchestrator",
                created_at: new Date().toISOString()
            };
            saveTunnels();
            console.log(`✅ [Orchestrator] Created tunnel: ${name}`);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tunnel: name, config: tunnelsCache[name] }));
        }).catch(() => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    if (req.method === 'POST' && url === '/orchestrator/tunnels/update') {
        parseBody(req).then(payload => {
            const { name, ...updates } = payload;
            if (!name || !tunnelsCache[name]) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Tunnel not found" })); return; }
            tunnelsCache[name] = { ...tunnelsCache[name], ...updates, updated_at: new Date().toISOString() };
            saveTunnels();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, tunnel: name, config: tunnelsCache[name] }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    if (req.method === 'POST' && url === '/orchestrator/tunnels/delete') {
        parseBody(req).then(({ name }) => {
            if (!name || !tunnelsCache[name]) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Tunnel not found" })); return; }
            delete tunnelsCache[name];
            saveTunnels();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Tunnel ${name} deleted` }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    // ── Agent CRUD ────────────────────────────────────────────────────────────

    if (req.method === 'POST' && url === '/orchestrator/agents/create') {
        parseBody(req).then(payload => {
            const { name, tunnel } = payload;
            if (!name || !tunnel) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Agent name and tunnel required" })); return; }
            if (!tunnelsCache[tunnel]) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: `Tunnel '${tunnel}' not found` })); return; }

            const apiKey = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            apiKeysCache[apiKey] = { name, tier: "worker", tunnel, dailyLimit: payload.dailyLimit || 1000, createdAt: new Date().toISOString(), createdBy: "orchestrator" };
            saveApiKeys();
            console.log(`✅ [Orchestrator] Created worker agent: ${name} -> ${tunnel}`);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, apiKey, name, tunnel }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    if (req.method === 'POST' && url === '/orchestrator/agents/delete') {
        parseBody(req).then(({ apiKey }) => {
            if (!apiKey || !apiKeysCache[apiKey]) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Agent not found" })); return; }
            const agentName = apiKeysCache[apiKey].name;
            delete apiKeysCache[apiKey];
            saveApiKeys();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Agent ${agentName} deleted` }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    // ── Pipeline API (NEW IN TEST6) ───────────────────────────────────────────

    // POST /orchestrator/pipeline/start - Start a new pipeline run
    if (req.method === 'POST' && url === '/orchestrator/pipeline/start') {
        parseBody(req).then(({ pipeline, agent }) => {
            if (!pipeline || !tunnelsCache[pipeline]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Pipeline tunnel '${pipeline}' not found` })); return;
            }
            if (!tunnelsCache[pipeline].pipeline) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Tunnel '${pipeline}' has no pipeline definition. Use 'pipeline' key in tunnel config.` })); return;
            }
            const runId = startPipelineRun(pipeline, agent || 'orchestrator');
            const steps = tunnelsCache[pipeline].pipeline.steps;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true, run_id: runId,
                message: `Pipeline started. First step: '${steps[0].command}'`,
                total_steps: steps.length,
                next_command: steps[0].command
            }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    // GET /orchestrator/pipeline/status?run_id=XXX - Query pipeline run state
    if (req.method === 'GET' && url.startsWith('/orchestrator/pipeline/status')) {
        const runId = new URL(`http://x${url}`).searchParams.get('run_id');
        const run = pipelineStateCache[runId];
        if (!run) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: "Run not found" })); return; }

        const tunnel = tunnelsCache[run.pipeline];
        const steps = tunnel?.pipeline?.steps || [];
        const nextStep = steps[run.current_step];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            run_id: runId, ...run,
            next_command: nextStep?.command || null,
            steps_remaining: steps.length - run.current_step,
            total_steps: steps.length
        })); return;
    }

    // GET /orchestrator/pipeline/runs - List all pipeline runs
    if (req.method === 'GET' && url === '/orchestrator/pipeline/runs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ runs: pipelineStateCache })); return;
    }

    // DELETE /orchestrator/pipeline/reset - Reset/abort a run
    if (req.method === 'POST' && url === '/orchestrator/pipeline/reset') {
        parseBody(req).then(({ run_id }) => {
            if (!pipelineStateCache[run_id]) { res.writeHead(404); res.end(JSON.stringify({ error: "Run not found" })); return; }
            pipelineStateCache[run_id].status = 'aborted';
            pipelineStateCache[run_id].aborted_at = new Date().toISOString();
            savePipelineState();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Run ${run_id} aborted` }));
        }).catch(() => { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON" })); });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "Unknown orchestrator endpoint" }));
}

// ─── Main Server ──────────────────────────────────────────────────────────────

function startGateway() {
    loadTunnels();
    loadApiKeys();
    loadPipelineState();

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        // Public endpoints
        if (req.url === '/status') {
            const totalRuns = Object.keys(pipelineStateCache).length;
            const completedRuns = Object.values(pipelineStateCache).filter(r => r.status === 'completed').length;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok', version: 'test6',
                mode: 'two-tier + pipeline-enforcement',
                tiers: { orchestrator: 'uncaged', workers: 'caged' },
                tunnels: Object.keys(tunnelsCache || {}),
                workers: Object.values(apiKeysCache || {}).filter(k => k.tier === 'worker').length,
                pipeline_runs: { total: totalRuns, completed: completedRuns }
            }));
            return;
        }

        authenticate(req, res, async () => {
            const isOrchestrator = req.client.tier === 'orchestrator';

            if (isOrchestrator && req.url.startsWith('/orchestrator/')) {
                console.log(`👑 [Orchestrator] ${req.client.name} -> ${req.method} ${req.url}`);
                handleOrchestratorAPI(req, res);
                return;
            }

            const tunnelName = req.client.tunnel || 'PublicViewer';
            const validation = await validateTunnel(req, tunnelName);

            if (!validation.allowed) {
                console.warn(`🛑 [Worker] BLOCKED: ${req.client.name} (${tunnelName}) - ${validation.error}`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: "Access Denied by Tunnel Policy",
                    reason: validation.error,
                    tunnel: tunnelName,
                    agent: req.client.name,
                    ...(validation.expected ? { expected_command: validation.expected } : {})
                }));
                return;
            }

            // If this was a pipeline step, confirm it externally
            if (req._pipelineRunId) {
                confirmPipelineStep(req._pipelineRunId);
                const run = pipelineStateCache[req._pipelineRunId];
                const tunnel = tunnelsCache[tunnelName];
                const nextStep = tunnel?.pipeline?.steps[run?.current_step];

                console.log(`✅ [Pipeline] Step confirmed: ${validation.step?.command}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Pipeline step confirmed: '${validation.step?.command}'`,
                    run_status: run?.status,
                    next_command: nextStep?.command || null,
                    steps_remaining: (tunnel?.pipeline?.steps?.length || 0) - (run?.current_step || 0)
                }));
                return;
            }

            console.log(`✅ [Worker] ALLOWED: ${req.client.name} (${tunnelName}) -> ${req.method} ${req.url}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: "Request allowed by tunnel policy",
                tunnel: tunnelName,
                agent: req.client.name
            }));
        });
    });

    server.listen(GATEWAY_PORT, () => {
        console.log(`\n🌍 AgentTunnel (test6 - Pipeline Enforcement) at http://localhost:${GATEWAY_PORT}`);
        console.log(`   👑 Orchestrator API: /orchestrator/*`);
        console.log(`   🔗 Pipeline API:     /orchestrator/pipeline/*  ← NEW`);
        console.log(`   🔒 Worker Validate:  POST / (with x-api-key)`);
        console.log(`   📊 Status:           /status\n`);
    });
}

startGateway();
