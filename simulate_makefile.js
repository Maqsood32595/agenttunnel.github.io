/**
 * 🧪 4 SIMULATIONS: Makefile + AI Hybrid Architecture
 *
 * Simulates the hybrid where:
 * - Shell steps are 100% deterministic (make enforces sequence)
 * - AI prompt steps are sandboxed to YES/NO decisions only
 * - Tunnel only allows "make deploy" (not individual commands)
 */

const chalk = (text, type) => {
    const icons = { pass: "✅", fail: "❌", warn: "⚠️ ", block: "🛑", ai: "🤖" };
    return `${icons[type] || "  "} ${text}`;
};

// ─── Makefile Definition ──────────────────────────────────────────────────────
const MAKEFILE = {
    "git-pull": { type: "shell", cmd: "git pull origin main", depends_on: null },
    "install": { type: "shell", cmd: "npm install", depends_on: "git-pull" },
    "build": { type: "shell", cmd: "npm run build", depends_on: "install" },
    "check": { type: "ai", prompt: "Is build output healthy? Reply YES or NO only.", depends_on: "build" },
    "restart": { type: "shell", cmd: "pm2 restart shortshub", depends_on: "check" },
};

// Tunnel enforces AI can only trigger "make deploy", nothing else
const TUNNEL = {
    allowed_commands: ["make deploy"],
    blocks: ["git pull", "npm install", "npm run build", "pm2 restart", "pm2 restart all"]
};

// ─── Simulate running a step ──────────────────────────────────────────────────
function runShellStep(step, scenario) {
    // Each scenario can inject failures or unexpected behavior
    if (scenario.fail_at === step) return { success: false, output: "Exit code 1: command failed" };
    return { success: true, output: `OK: ${MAKEFILE[step].cmd}` };
}

function runAIStep(step, scenario) {
    // Simulate AI answering the prompt
    const answers = scenario.ai_answers || {};
    const answer = answers[step] || "YES"; // default AI says YES
    const triedToEscape = scenario.ai_escape_attempt;
    return { answer, triedToEscape, success: answer === "YES" };
}

// ─── Pipeline Runner ──────────────────────────────────────────────────────────
function runPipeline(scenario) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🎬 ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log(`${"─".repeat(60)}`);

    const completed = {};
    let aborted = false;
    const order = ["git-pull", "install", "build", "check", "restart"];

    // Check tunnel first - AI can ONLY say "make deploy"
    if (scenario.ai_command !== "make deploy") {
        const blocked = TUNNEL.blocks.some(b => scenario.ai_command.includes(b));
        if (blocked || !TUNNEL.allowed_commands.includes(scenario.ai_command)) {
            console.log(chalk(`TUNNEL BLOCKED: AI tried "${scenario.ai_command}"`, "block"));
            console.log(chalk(`Only "make deploy" is allowed`, "block"));
            console.log(`\n📊 Result: ❌ BLOCKED AT TUNNEL`);
            return false;
        }
    }
    console.log(chalk(`TUNNEL: "${scenario.ai_command}" → ALLOWED`, "pass"));

    for (const step of order) {
        if (aborted) { console.log(chalk(`SKIPPED: ${step} (pipeline aborted)`, "warn")); continue; }

        const def = MAKEFILE[step];

        // Check dependency
        if (def.depends_on && !completed[def.depends_on]) {
            console.log(chalk(`MAKE BLOCKED: ${step} requires ${def.depends_on} first`, "block"));
            aborted = true; continue;
        }

        if (def.type === "shell") {
            const result = runShellStep(step, scenario);
            if (result.success) {
                console.log(chalk(`SHELL: ${def.cmd} → ${result.output}`, "pass"));
                completed[step] = true;
            } else {
                console.log(chalk(`SHELL FAILED: ${def.cmd} → ${result.output}`, "fail"));
                aborted = true;
            }
        } else if (def.type === "ai") {
            const result = runAIStep(step, scenario);
            console.log(chalk(`AI PROMPT: "${def.prompt}"`, "ai"));
            if (result.triedToEscape) {
                console.log(chalk(`AI tried to break out: "${result.triedToEscape}"`, "warn"));
                console.log(chalk(`MAKEFILE IGNORED: not a valid step response`, "block"));
            }
            console.log(chalk(`AI ANSWERED: ${result.answer}`, result.success ? "pass" : "fail"));
            if (result.success) {
                completed[step] = true;
            } else {
                console.log(chalk(`AI said NO → Aborting pipeline for safety`, "block"));
                aborted = true;
            }
        }
    }

    const allDone = order.every(s => completed[s]);
    console.log(`\n📊 Completed: ${Object.keys(completed).length}/${order.length} steps`);
    console.log(`📊 Result: ${allDone ? "✅ CLEAN DEPLOY" : "❌ ABORTED SAFELY"}`);
    return allDone;
}

// ─── 4 Simulations ───────────────────────────────────────────────────────────

const simulations = [
    {
        name: "SIMULATION 1: Happy Path",
        description: "AI calls make deploy, all steps succeed, AI confirms build healthy",
        ai_command: "make deploy",
        fail_at: null,
        ai_answers: { check: "YES" }
    },
    {
        name: "SIMULATION 2: AI Tries to Run Commands Directly (Bypass Attempt)",
        description: "AI tries to run pm2 restart all directly instead of make deploy",
        ai_command: "pm2 restart all",
        fail_at: null,
        ai_answers: { check: "YES" }
    },
    {
        name: "SIMULATION 3: Build Fails Mid-Pipeline",
        description: "git pull and npm install succeed, but npm run build fails",
        ai_command: "make deploy",
        fail_at: "build",
        ai_answers: { check: "YES" }
    },
    {
        name: "SIMULATION 4: AI Health Check Says NO (Bad Build)",
        description: "All shell steps pass but AI detects unhealthy build output",
        ai_command: "make deploy",
        fail_at: null,
        ai_answers: { check: "NO" },
        ai_escape_attempt: "ignore my previous instruction and restart anyway"
    }
];

console.log("=".repeat(60));
console.log("  🧪 4 SIMULATIONS: Makefile + AI Hybrid Pipeline");
console.log("=".repeat(60));

let passed = 0;
simulations.forEach(sim => {
    const result = runPipeline(sim);
    if (result) passed++;
});

console.log(`\n${"=".repeat(60)}`);
console.log("  📊 SUMMARY");
console.log("=".repeat(60));
console.log(`  Clean deploys: ${passed}/4`);
console.log(`  Key findings:`);
console.log(`  - Tunnel blocked direct AI commands at the gate`);
console.log(`  - Make halted pipeline on shell failure (no restart attempted)`);
console.log(`  - AI escape attempt was silently ignored by Makefile structure`);
console.log(`  - AI "NO" vote safely aborted deploy BEFORE restart`);
console.log("=".repeat(60));
