const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEYS_PATH = path.join(__dirname, 'api_keys.json');

module.exports.authenticate = function (req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Missing x-api-key header" }));
        return;
    }

    let apiKeys;
    try {
        apiKeys = JSON.parse(fs.readFileSync(API_KEYS_PATH, 'utf8'));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Auth system error" }));
        return;
    }

    const client = apiKeys[apiKey];
    if (!client) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid API key" }));
        return;
    }

    req.client = client;
    next();
};
