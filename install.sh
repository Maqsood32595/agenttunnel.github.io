#!/bin/bash
# ============================================================
# AgentTunnel test4 - Installation Script
# Run: bash install.sh
# ============================================================

set -e

echo ""
echo "🛡️  AgentTunnel test4 - Two-Tier Installation"
echo "=============================================="
echo ""

INSTALL_DIR="$HOME/.openclaw/workspace/agenttunnel.github.io"

# Step 1: Clean up any old installation
echo "🧹 Step 1: Cleaning up old installation..."
pkill -f "node gateway.js" 2>/dev/null || true
rm -rf "$INSTALL_DIR"
echo "   ✅ Cleaned"

# Step 2: Clone test4
echo ""
echo "📦 Step 2: Cloning test4 branch..."
git clone -b test4 https://github.com/Maqsood32595/agenttunnel.github.io.git "$INSTALL_DIR"
echo "   ✅ Cloned to $INSTALL_DIR"

# Step 3: Copy openclaw.json to OpenClaw config directory
echo ""
echo "⚙️  Step 3: Configuring OpenClaw (main agent = internal, sub-agents = tunnel)..."
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
cp "$INSTALL_DIR/openclaw.json" "$OPENCLAW_CONFIG"
echo "   ✅ Config written to $OPENCLAW_CONFIG"

# Step 4: Start the tunnel in background
echo ""
echo "🚀 Step 4: Starting AgentTunnel on port 3000..."
cd "$INSTALL_DIR"
node gateway.js > /tmp/agenttunnel.log 2>&1 &
TUNNEL_PID=$!
sleep 2

# Step 5: Verify tunnel is running
echo ""
echo "🔍 Step 5: Verifying tunnel..."
STATUS=$(curl -s http://localhost:3000/status 2>/dev/null)
if echo "$STATUS" | grep -q '"status":"ok"'; then
    echo "   ✅ Tunnel running! Status: $STATUS"
else
    echo "   ❌ Tunnel failed to start. Check logs: cat /tmp/agenttunnel.log"
    exit 1
fi

# Step 6: Restart OpenClaw to pick up new config
echo ""
echo "🔄 Step 6: Restarting OpenClaw service..."
sudo fuser -k 3000/tcp 2>/dev/null || true
systemctl --user restart openclaw-gateway 2>/dev/null || echo "   ⚠️  Could not restart openclaw-gateway (may need manual restart)"

echo ""
echo "=============================================="
echo "✅ Installation Complete!"
echo ""
echo "  Main OpenClaw agent:  INTERNAL (no tunnel delay)"
echo "  Sub-agents:           TUNNEL enforced (port 3000)"
echo "  Orchestrator API key: orchestrator_key_openclaw"
echo ""
echo "📋 To test:"
echo "  curl http://localhost:3000/status"
echo "  curl http://localhost:3000/orchestrator/tunnels -H 'x-api-key: orchestrator_key_openclaw'"
echo ""
echo "📖 Full docs: cat $INSTALL_DIR/README.md"
echo "=============================================="
