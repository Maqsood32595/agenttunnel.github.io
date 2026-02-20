# ─────────────────────────────────────────────────────────────
# AgentTunnel test6 — Makefile
# Local sequence enforcer for deploy/CI pipelines
#
# Usage:
#   make deploy       → Full deploy (git pull → install → build → restart)
#   make ci           → CI check  (git pull → install → test → build)
#   make status       → Check tunnel status
#   make tunnel-start → Start the AgentTunnel gateway
#
# Rules:
#   - Each target DEPENDS on the previous one
#   - If any step fails (exit code ≠ 0), make HALTS immediately
#   - Nobody (including AI) can skip a step
# ─────────────────────────────────────────────────────────────

TUNNEL_URL = http://localhost:3000
AGENT_KEY  = pilot_tier2_xyz789

.PHONY: deploy ci status tunnel-start git-pull install build restart test backup

# ── Full Deploy Pipeline ──────────────────────────────────────
deploy: restart
	@echo "✅ Deploy complete."

restart: build
	@echo "▶ Step 4/4: Restarting app..."
	pm2 restart shortshub

build: install
	@echo "▶ Step 3/4: Building app..."
	npm run build

install: git-pull
	@echo "▶ Step 2/4: Installing dependencies..."
	npm install

git-pull:
	@echo "▶ Step 1/4: Pulling latest code..."
	git pull origin main

# ── CI Pipeline (no deploy) ───────────────────────────────────
ci: build-ci
	@echo "✅ CI checks passed."

build-ci: test
	@echo "▶ Step 4/4: Building..."
	npm run build

test: install-ci
	@echo "▶ Step 3/4: Running test suite..."
	npm test

install-ci: git-pull-ci
	@echo "▶ Step 2/4: Installing dependencies..."
	npm install

git-pull-ci:
	@echo "▶ Step 1/4: Pulling latest code..."
	git pull origin main

# ── Tunnel Management ─────────────────────────────────────────
tunnel-start:
	@echo "Starting AgentTunnel gateway..."
	node gateway.js &
	@sleep 1
	@echo "AgentTunnel running at $(TUNNEL_URL)"

status:
	@curl -s $(TUNNEL_URL)/status | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
