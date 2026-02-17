const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth/middleware');

/**
 * 🛡️ AgentTunnel - GitOps AI Agent Policy Enforcer
 * Zero Trust Security Layer for AI Agents
 */

const GATEWAY_PORT = 3000;
const TUNNELS_PATH = path.join(__dirname, 'auth', 'tunnels.json');
const GITHUB_CONFIG_URL = 'https://raw.githubusercontent.com/Maqsood32595/agenttunnel.github.io/main/auth/tunnels.json';
let tunnelsCache = null;

function loadTunnels() {
    // 1. Load local first (fallback)
    if (fs.existsSync(TUNNELS_PATH)) {
        try {
            tunnelsCache = JSON.parse(fs.readFileSync(TUNNELS_PATH, 'utf8'));
            console.log("✅ [Gateway] Loaded local tunnels.json");
        } catch (e) {
            console.error("❌ [Gateway] Failed to load local tunnels.json", e.message);
        }
    }

    // 2. Start Polling GitHub (Dynamic Config)
    pollGitHubConfig();
}

function pollGitHubConfig() {
    console.log("🔄 [Gateway] Polling GitHub for tunnel updates...");

    https.get(GITHUB_CONFIG_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                try {
                    const newConfig = JSON.parse(data);
                    tunnelsCache = newConfig;
                    // Also save to disk for persistence
                    fs.writeFileSync(TUNNELS_PATH, JSON.stringify(newConfig, null, 2));
                    console.log("✅ [Gateway] Synced rules from GitHub!");
                } catch (e) {
                    console.error("❌ [Gateway] Invalid JSON from GitHub");
                }
            }
        });
    }).on('error', (err) => {
        console.error("❌ [Gateway] GitHub Network Error:", err.message);
    });

    // Poll every 60 seconds
    setTimeout(pollGitHubConfig, 60000);
}

async function validateTunnel(req, tunnelName) {
    if (!tunnelsCache) loadTunnels();
    const tunnel = tunnelsCache[tunnelName];
    if (!tunnel) return { allowed: false, error: "Invalid Tunnel Config" };

    // 1. Check Method
    if (!tunnel.allowed_methods.includes("*") && !tunnel.allowed_methods.includes(req.method)) {
        return { allowed: false, error: `Method ${req.method} not allowed in tunnel ${tunnelName}` };
    }

    // 2. Check Path (if specified)
    if (tunnel.allowed_paths && tunnel.allowed_paths.length > 0) {
        const cleanUrl = req.url.split('?')[0];
        const isPathAllowed = tunnel.allowed_paths.some(p => cleanUrl.startsWith(p));
        if (!isPathAllowed) {
            return { allowed: false, error: `Path ${cleanUrl} not allowed in tunnel ${tunnelName}` };
        }
    }

    // 3. Check Keywords (Deep Inspection for POST/PUT)
    if (tunnel.forbidden_keywords.length > 0 && (req.method === 'POST' || req.method === 'PUT')) {
        return new Promise((resolve) => {
            let body = [];
            req.on('data', (chunk) => body.push(chunk));
            req.on('end', () => {
                const bodyBuffer = Buffer.concat(body);
                const bodyStr = bodyBuffer.toString().toLowerCase();
                req.rawBody = bodyBuffer; // Save ORIGINAL

                for (const keyword of tunnel.forbidden_keywords) {
                    if (bodyStr.includes(keyword.toLowerCase())) {
                        resolve({ allowed: false, error: `Keyword '${keyword}' forbidden in tunnel ${tunnelName}` });
                        return;
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
                gitops: true,
                tunnels: Object.keys(tunnelsCache || {})
            }));
            return;
        }

        // All other routes require authentication
        authenticate(req, res, async () => {
            const tunnelName = req.client.tunnel || 'PublicViewer';
            const validation = await validateTunnel(req, tunnelName);

            if (!validation.allowed) {
                console.warn(`🛑 [Gateway] Tunnel Blocked: ${req.client.name} tried ${req.method} ${req.url}`);
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: "Access Denied by Tunnel Policy",
                    reason: validation.error
                }));
                return;
            }

            // Allow through
            console.log(`✅ [Gateway] ${req.client.name} (${tunnelName}) -> ${req.method} ${req.url}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: "Request allowed by tunnel policy",
                tunnel: tunnelName
            }));
        });
    });

    server.listen(GATEWAY_PORT, () => {
        console.log(`\n🌍 AgentTunnel Active at http://localhost:${GATEWAY_PORT}`);
        console.log(`   - Status: http://localhost:${GATEWAY_PORT}/status`);
        console.log(`   🔒 Security: ENABLED (API Key Required)`);
        console.log(`   🔄 GitOps: ENABLED (Polling GitHub every 60s)`);
    });
}

startGateway();
