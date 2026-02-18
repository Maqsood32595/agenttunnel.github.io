const http = require('http');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth/middleware');

/**
 * 🛡️ AgentTunnel - Local-Only AI Agent Policy Enforcer
 * Strict whitelist enforcement - NO external dependencies
 */

const GATEWAY_PORT = 3000;
const TUNNELS_PATH = path.join(__dirname, 'auth', 'tunnels.json');
let tunnelsCache = null;

function loadTunnels() {
    if (fs.existsSync(TUNNELS_PATH)) {
        try {
            const data = fs.readFileSync(TUNNELS_PATH, 'utf8');
            tunnelsCache = JSON.parse(data);
            console.log("✅ [Gateway] Loaded tunnels.json");
        } catch (e) {
            console.error("❌ [Gateway] Failed to load tunnels.json:", e.message);
            process.exit(1);
        }
    } else {
        console.error("❌ [Gateway] tunnels.json not found!");
        process.exit(1);
    }
}

// Watch for file changes and reload
fs.watchFile(TUNNELS_PATH, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log("🔄 [Gateway] tunnels.json changed, reloading...");
        loadTunnels();
    }
});

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

                // STRICT MODE ENFORCEMENT (Primary Check)
                if (tunnel.command_whitelist_mode === 'strict') {
                    if (!tunnel.allowed_commands || tunnel.allowed_commands.length === 0) {
                        resolve({ allowed: false, error: "No commands allowed in strict mode" });
                        return;
                    }

                    // Check if command matches ANY allowed command
                    const isAllowed = tunnel.allowed_commands.some(allowed => {
                        const cmd = command.trim();
                        const allowedCmd = allowed.trim();
                        // Exact match OR starts with allowed command + space
                        return cmd === allowedCmd || cmd.startsWith(allowedCmd + ' ');
                    });

                    if (!isAllowed) {
                        resolve({ allowed: false, error: `Command '${command}' not in whitelist` });
                        return;
                    }
                }

                // Forbidden keywords check (secondary)
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
            req.on('error', (err) => resolve({ allowed: false, error: "Body read error" }));
        });
    }

    return { allowed: true };
}

function startGateway() {
    loadTunnels();

    const server = http.createServer(async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'x-api-key, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // Status Endpoint (Public)
        if (req.url === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                secured: true,
                gitops: false,
                mode: 'local-only',
                tunnels: Object.keys(tunnelsCache || {})
            }));
            return;
        }

        // All other routes require authentication
        authenticate(req, res, async () => {
            const tunnelName = req.client.tunnel || 'PublicViewer';
            const validation = await validateTunnel(req, tunnelName);

            if (!validation.allowed) {
                console.warn(`🛑 [Gateway] BLOCKED: ${req.client.name} tried ${req.method} ${req.url}`);
                console.warn(`   Reason: ${validation.error}`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: "Access Denied by Tunnel Policy",
                    reason: validation.error
                }));
                return;
            }

            // Allow through
            console.log(`✅ [Gateway] ALLOWED: ${req.client.name} (${tunnelName}) -> ${req.method} ${req.url}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: "Request allowed by tunnel policy",
                tunnel: tunnelName
            }));
        });
    });

    server.listen(GATEWAY_PORT, () => {
        console.log(`\n🌍 AgentTunnel (Local-Only) Active at http://localhost:${GATEWAY_PORT}`);
        console.log(`   - Status: http://localhost:${GATEWAY_PORT}/status`);
        console.log(`   🔒 Security: ENABLED (API Key Required)`);
        console.log(`   📁 Config: ${TUNNELS_PATH}`);
        console.log(`   🔄 Auto-reload: ENABLED (watches file changes)`);
    });
}

startGateway();
