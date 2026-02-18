const http = require('http');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth/middleware');

/**
 * 🛡️ AgentTunnel - Two-Tier Agent Architecture
 * 
 * Tier 1: Orchestrator (OpenClaw) - UNCAGED
 *   - Full access to create/modify/delete tunnels
 *   - Full access to manage worker agent API keys
 *   - Full access to view all logs
 * 
 * Tier 2: Worker Agents - CAGED
 *   - Each has its own tunnel policy
 *   - Can ONLY do what their tunnel allows
 *   - Cannot modify their own tunnel
 *   - Cannot spawn other agents
 */

const GATEWAY_PORT = 3000;
const TUNNELS_PATH = path.join(__dirname, 'auth', 'tunnels.json');
const API_KEYS_PATH = path.join(__dirname, 'auth', 'api_keys.json');
let tunnelsCache = null;
let apiKeysCache = null;

// ─── Config Loaders ───────────────────────────────────────────────────────────

function loadTunnels() {
    try {
        const data = fs.readFileSync(TUNNELS_PATH, 'utf8');
        tunnelsCache = JSON.parse(data);
        console.log("✅ [Gateway] Loaded tunnels.json");
    } catch (e) {
        console.error("❌ [Gateway] Failed to load tunnels.json:", e.message);
        process.exit(1);
    }
}

function loadApiKeys() {
    try {
        const data = fs.readFileSync(API_KEYS_PATH, 'utf8');
        apiKeysCache = JSON.parse(data);
        console.log("✅ [Gateway] Loaded api_keys.json");
    } catch (e) {
        console.error("❌ [Gateway] Failed to load api_keys.json:", e.message);
        process.exit(1);
    }
}

function saveTunnels() {
    fs.writeFileSync(TUNNELS_PATH, JSON.stringify(tunnelsCache, null, 2));
}

function saveApiKeys() {
    fs.writeFileSync(API_KEYS_PATH, JSON.stringify(apiKeysCache, null, 2));
}

// Watch for file changes
fs.watchFile(TUNNELS_PATH, () => { console.log("🔄 [Gateway] tunnels.json changed, reloading..."); loadTunnels(); });
fs.watchFile(API_KEYS_PATH, () => { console.log("🔄 [Gateway] api_keys.json changed, reloading..."); loadApiKeys(); });

// ─── Validation ───────────────────────────────────────────────────────────────

async function validateTunnel(req, tunnelName) {
    if (!tunnelsCache) loadTunnels();
    const tunnel = tunnelsCache[tunnelName];
    if (!tunnel) return { allowed: false, error: "Invalid Tunnel Config" };

    // 1. Check Method
    if (!tunnel.allowed_methods.includes("*") && !tunnel.allowed_methods.includes(req.method)) {
        return { allowed: false, error: `Method ${req.method} not allowed` };
    }

    // 2. Check Path (if specified)
    if (tunnel.allowed_paths && tunnel.allowed_paths.length > 0) {
        const cleanUrl = req.url.split('?')[0];
        const isPathAllowed = tunnel.allowed_paths.some(p => cleanUrl.startsWith(p));
        if (!isPathAllowed) {
            return { allowed: false, error: `Path ${cleanUrl} not allowed` };
        }
    }

    // 3. Command Validation (for POST/PUT with body)
    if (req.method === 'POST' || req.method === 'PUT') {
        return new Promise((resolve) => {
            let body = [];
            req.on('data', (chunk) => body.push(chunk));
            req.on('end', () => {
                const bodyBuffer = Buffer.concat(body);
                const bodyStr = bodyBuffer.toString();
                req.rawBody = bodyBuffer;

                let payload;
                try {
                    payload = JSON.parse(bodyStr);
                } catch (e) {
                    resolve({ allowed: false, error: "Invalid JSON payload" });
                    return;
                }

                const command = payload.command || payload.url || '';

                // STRICT MODE: Command MUST be in whitelist
                if (tunnel.command_whitelist_mode === 'strict') {
                    if (!tunnel.allowed_commands || tunnel.allowed_commands.length === 0) {
                        resolve({ allowed: false, error: "No commands allowed in strict mode" });
                        return;
                    }
                    const isAllowed = tunnel.allowed_commands.some(allowed => {
                        const cmd = command.trim();
                        const allowedCmd = allowed.trim();
                        return cmd === allowedCmd || cmd.startsWith(allowedCmd + ' ');
                    });
                    if (!isAllowed) {
                        resolve({ allowed: false, error: `Command '${command}' not in whitelist` });
                        return;
                    }
                }

                // Forbidden keywords check
                if (tunnel.forbidden_keywords && tunnel.forbidden_keywords.length > 0) {
                    for (const keyword of tunnel.forbidden_keywords) {
                        if (command.toLowerCase().includes(keyword.toLowerCase())) {
                            resolve({ allowed: false, error: `Forbidden keyword '${keyword}' detected` });
                            return;
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

function handleOrchestratorAPI(req, res) {
    const url = req.url;

    // GET /orchestrator/tunnels - List all tunnels
    if (req.method === 'GET' && url === '/orchestrator/tunnels') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tunnels: tunnelsCache }));
        return;
    }

    // GET /orchestrator/agents - List all worker agents
    if (req.method === 'GET' && url === '/orchestrator/agents') {
        const workers = Object.entries(apiKeysCache)
            .filter(([_, v]) => v.tier === 'worker')
            .map(([key, v]) => ({ key: key.substring(0, 8) + '...', ...v }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ agents: workers }));
        return;
    }

    // POST /orchestrator/tunnels/create - Create a new tunnel for a worker agent
    if (req.method === 'POST' && url === '/orchestrator/tunnels/create') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const payload = JSON.parse(Buffer.concat(body).toString());
                const { name, allowed_methods, allowed_commands, forbidden_keywords } = payload;

                if (!name) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Tunnel name required" }));
                    return;
                }

                tunnelsCache[name] = {
                    description: payload.description || `Worker tunnel: ${name}`,
                    allowed_methods: allowed_methods || ["GET", "POST"],
                    allowed_paths: payload.allowed_paths || [],
                    forbidden_keywords: forbidden_keywords || [],
                    allowed_commands: allowed_commands || [],
                    command_whitelist_mode: "strict",
                    created_by: "orchestrator",
                    created_at: new Date().toISOString()
                };
                saveTunnels();

                console.log(`✅ [Orchestrator] Created tunnel: ${name}`);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, tunnel: name, config: tunnelsCache[name] }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    // POST /orchestrator/tunnels/update - Update an existing tunnel
    if (req.method === 'POST' && url === '/orchestrator/tunnels/update') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const payload = JSON.parse(Buffer.concat(body).toString());
                const { name, ...updates } = payload;

                if (!name || !tunnelsCache[name]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Tunnel not found" }));
                    return;
                }

                tunnelsCache[name] = { ...tunnelsCache[name], ...updates, updated_at: new Date().toISOString() };
                saveTunnels();

                console.log(`✅ [Orchestrator] Updated tunnel: ${name}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, tunnel: name, config: tunnelsCache[name] }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    // POST /orchestrator/tunnels/delete - Delete a tunnel
    if (req.method === 'POST' && url === '/orchestrator/tunnels/delete') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const { name } = JSON.parse(Buffer.concat(body).toString());
                if (!name || !tunnelsCache[name]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Tunnel not found" }));
                    return;
                }
                delete tunnelsCache[name];
                saveTunnels();
                console.log(`🗑️ [Orchestrator] Deleted tunnel: ${name}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `Tunnel ${name} deleted` }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    // POST /orchestrator/agents/create - Create a new worker agent API key
    if (req.method === 'POST' && url === '/orchestrator/agents/create') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const payload = JSON.parse(Buffer.concat(body).toString());
                const { name, tunnel } = payload;

                if (!name || !tunnel) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Agent name and tunnel required" }));
                    return;
                }

                if (!tunnelsCache[tunnel]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Tunnel '${tunnel}' not found. Create it first.` }));
                    return;
                }

                // Generate API key
                const apiKey = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                apiKeysCache[apiKey] = {
                    name,
                    tier: "worker",
                    tunnel,
                    dailyLimit: payload.dailyLimit || 1000,
                    createdAt: new Date().toISOString(),
                    createdBy: "orchestrator"
                };
                saveApiKeys();

                console.log(`✅ [Orchestrator] Created worker agent: ${name} -> ${tunnel}`);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, apiKey, name, tunnel }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    // POST /orchestrator/agents/delete - Delete a worker agent
    if (req.method === 'POST' && url === '/orchestrator/agents/delete') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const { apiKey } = JSON.parse(Buffer.concat(body).toString());
                if (!apiKey || !apiKeysCache[apiKey]) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Agent not found" }));
                    return;
                }
                const agentName = apiKeysCache[apiKey].name;
                delete apiKeysCache[apiKey];
                saveApiKeys();
                console.log(`🗑️ [Orchestrator] Deleted agent: ${agentName}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `Agent ${agentName} deleted` }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    // Unknown orchestrator endpoint
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "Unknown orchestrator endpoint" }));
}

// ─── Main Server ──────────────────────────────────────────────────────────────

function startGateway() {
    loadTunnels();
    loadApiKeys();

    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        // Public status endpoint
        if (req.url === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                mode: 'two-tier',
                tiers: { orchestrator: 'uncaged', workers: 'caged' },
                tunnels: Object.keys(tunnelsCache || {}),
                workers: Object.values(apiKeysCache || {}).filter(k => k.tier === 'worker').length
            }));
            return;
        }

        // All other routes require authentication
        authenticate(req, res, async () => {
            const isOrchestrator = req.client.tier === 'orchestrator';

            // Orchestrator API - Full access, no restrictions
            if (isOrchestrator && req.url.startsWith('/orchestrator/')) {
                console.log(`👑 [Orchestrator] ${req.client.name} -> ${req.method} ${req.url}`);
                handleOrchestratorAPI(req, res);
                return;
            }

            // Worker agents - Validate against their tunnel
            const tunnelName = req.client.tunnel || 'PublicViewer';
            const validation = await validateTunnel(req, tunnelName);

            if (!validation.allowed) {
                console.warn(`🛑 [Worker] BLOCKED: ${req.client.name} (${tunnelName}) tried ${req.method} ${req.url}`);
                console.warn(`   Reason: ${validation.error}`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: "Access Denied by Tunnel Policy",
                    reason: validation.error,
                    tunnel: tunnelName,
                    agent: req.client.name
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
        console.log(`\n🌍 AgentTunnel (Two-Tier) Active at http://localhost:${GATEWAY_PORT}`);
        console.log(`   👑 Orchestrator API: http://localhost:${GATEWAY_PORT}/orchestrator/*`);
        console.log(`   🔒 Worker Validation: http://localhost:${GATEWAY_PORT}/validate`);
        console.log(`   📊 Status: http://localhost:${GATEWAY_PORT}/status`);
    });
}

startGateway();
