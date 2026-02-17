const fs = require('fs');
const path = require('path');

/**
 * 🔒 Mujahid Authentication Middleware
 * Zero Trust Network Access (ZTNA) for API Gateway
 */

const API_KEYS_PATH = path.join(__dirname, 'api_keys.json');
const USAGE_LOG_PATH = path.join(__dirname, 'usage_log.json');

// In-memory cache to avoid constant file reads
let apiKeysCache = null;
let usageCache = {};

function loadApiKeys() {
    if (!apiKeysCache) {
        const data = fs.readFileSync(API_KEYS_PATH, 'utf8');
        apiKeysCache = JSON.parse(data);
    }
    return apiKeysCache;
}

function loadUsage() {
    if (!fs.existsSync(USAGE_LOG_PATH)) {
        return {};
    }
    const data = fs.readFileSync(USAGE_LOG_PATH, 'utf8');
    return JSON.parse(data);
}

function saveUsage() {
    fs.writeFileSync(USAGE_LOG_PATH, JSON.stringify(usageCache, null, 2));
}

function getTodayKey() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function validateApiKey(apiKey) {
    const keys = loadApiKeys();
    const keyData = keys.keys[apiKey];

    if (!keyData) {
        return { valid: false, error: 'Invalid API key' };
    }

    if (!keyData.active) {
        return { valid: false, error: 'API key has been revoked' };
    }

    return { valid: true, keyData };
}

function checkRateLimit(apiKey, keyData) {
    const today = getTodayKey();

    // Initialize usage tracking
    if (!usageCache[apiKey]) {
        usageCache[apiKey] = {};
    }
    if (!usageCache[apiKey][today]) {
        usageCache[apiKey][today] = 0;
    }

    const currentUsage = usageCache[apiKey][today];
    const limit = keyData.dailyLimit;

    if (currentUsage >= limit) {
        return {
            allowed: false,
            error: 'Daily rate limit exceeded',
            usage: currentUsage,
            limit: limit,
            resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
        };
    }

    return { allowed: true, usage: currentUsage, limit: limit };
}

function incrementUsage(apiKey) {
    const today = getTodayKey();
    if (!usageCache[apiKey]) {
        usageCache[apiKey] = {};
    }
    if (!usageCache[apiKey][today]) {
        usageCache[apiKey][today] = 0;
    }
    usageCache[apiKey][today]++;

    // Persist every 100 requests (or implement async batch writes)
    if (usageCache[apiKey][today] % 100 === 0) {
        saveUsage();
    }
}

/**
 * Express-compatible middleware
 * Usage: app.use(authenticate)
 */
function authenticate(req, res, next) {
    // Extract API key from header
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        console.error(`[Auth] Missing API key header from ${req.socket.remoteAddress}`);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(401);
        return res.end(JSON.stringify({
            error: 'Authentication required',
            message: 'Missing x-api-key header'
        }));
    }

    // Validate key
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
        console.error(`[Auth] Validation failed for key: ${apiKey.substring(0, 8)}... - Error: ${validation.error}`);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(401);
        return res.end(JSON.stringify({
            error: 'Authentication failed',
            message: validation.error
        }));
    }

    // Check rate limit
    const rateLimitCheck = checkRateLimit(apiKey, validation.keyData);
    if (!rateLimitCheck.allowed) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-RateLimit-Limit', rateLimitCheck.limit);
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', rateLimitCheck.resetAt);
        res.writeHead(429);
        return res.end(JSON.stringify({
            error: 'Rate limit exceeded',
            message: rateLimitCheck.error,
            usage: rateLimitCheck.usage,
            limit: rateLimitCheck.limit,
            resetAt: rateLimitCheck.resetAt
        }));
    }

    // Increment usage counter
    incrementUsage(apiKey);

    // Attach client info to request for logging
    req.client = {
        apiKey: apiKey,
        name: validation.keyData.name,
        tier: validation.keyData.tier,
        tunnel: validation.keyData.tunnel,
        usage: rateLimitCheck.usage,
        limit: rateLimitCheck.limit
    };

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', rateLimitCheck.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitCheck.limit - rateLimitCheck.usage - 1);

    next();
}

module.exports = { authenticate, validateApiKey, checkRateLimit };
