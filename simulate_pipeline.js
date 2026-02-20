/**
 * 🧪 SIMULATION: Bare LLM vs Tunnel-Enforced Pipeline
 *
 * Simulates what happens when an AI tries to run a deploy pipeline
 * - Scenario A: No tunnel (LLM free to do anything)
 * - Scenario B: Tunnel with strict pipeline enforcement
 */

const HAPPY_PATH = [
    "git pull origin main",
    "npm install",
    "npm run build",
    "pm2 restart shortshub"
];

// ─── Tunnel Policy ────────────────────────────────────────────────────────────
const TUNNEL_POLICY = {
    allowed_commands: [...HAPPY_PATH],
    enforce_sequence: true,  // must run in ORDER, cannot skip
    all_required: true       // ALL steps must complete
};

// ─── Simulated AI Behavior - What LLMs Actually Do ───────────────────────────
// This simulates 10 realistic "AI runs" with probabilistic behavior
const SIMULATED_AI_RUNS = [
    // Run 1: Perfect
    ["git pull origin main", "npm install", "npm run build", "pm2 restart shortshub"],
    // Run 2: AI skips npm install ("it was just installed")
    ["git pull origin main", "npm run build", "pm2 restart shortshub"],
    // Run 3: AI adds unexpected commands
    ["git pull origin main", "npm install", "npm audit fix", "npm run build", "pm2 restart shortshub"],
    // Run 4: Perfect
    ["git pull origin main", "npm install", "npm run build", "pm2 restart shortshub"],
    // Run 5: AI restarts all apps not just shortshub
    ["git pull origin main", "npm install", "npm run build", "pm2 restart all"],
    // Run 6: AI adds git clean before pull (destructive!)
    ["git clean -fd", "git pull origin main", "npm install", "npm run build", "pm2 restart shortshub"],
    // Run 7: Perfect
    ["git pull origin main", "npm install", "npm run build", "pm2 restart shortshub"],
    // Run 8: AI forgets pm2 restart (app not updated!)
    ["git pull origin main", "npm install", "npm run build"],
    // Run 9: AI runs tests first unexpectedly
    ["git pull origin main", "npm install", "npm test", "npm run build", "pm2 restart shortshub"],
    // Run 10: Perfect
    ["git pull origin main", "npm install", "npm run build", "pm2 restart shortshub"],
];

// ─── Tunnel Validator ─────────────────────────────────────────────────────────
function validateWithTunnel(commands) {
    const results = [];
    let stepIndex = 0;  // expects next command in sequence

    for (const cmd of commands) {
        const isAllowed = TUNNEL_POLICY.allowed_commands.includes(cmd);
        const isInSequence = HAPPY_PATH[stepIndex] === cmd;

        if (!isAllowed) {
            results.push({ cmd, status: "❌ BLOCKED", reason: "Not in whitelist" });
            continue; // skip, don't advance sequence
        }

        if (TUNNEL_POLICY.enforce_sequence && !isInSequence) {
            const expected = HAPPY_PATH[stepIndex];
            results.push({ cmd, status: "❌ BLOCKED", reason: `Wrong order: expected "${expected}" at step ${stepIndex + 1}` });
            continue; // skip, don't advance sequence
        }

        results.push({ cmd, status: "✅ ALLOWED", reason: "Valid pipeline step" });
        stepIndex++;
    }

    // Check if all required steps completed
    const completedSteps = results.filter(r => r.status === "✅ ALLOWED").length;
    const allCompleted = completedSteps === HAPPY_PATH.length;

    return { results, completedSteps, allCompleted };
}

// ─── Run Simulation ───────────────────────────────────────────────────────────
console.log("=".repeat(65));
console.log("  🧪 SIMULATION: Bare LLM vs Tunnel-Enforced CI/CD Pipeline");
console.log("=".repeat(65));
console.log("\n📋 Happy Path:\n", HAPPY_PATH.map((c, i) => `  Step ${i + 1}: ${c}`).join("\n"));
console.log("\n" + "─".repeat(65));

let bareSuccess = 0;
let tunnelSuccess = 0;

SIMULATED_AI_RUNS.forEach((run, i) => {
    const runNum = i + 1;
    console.log(`\n🏃 RUN ${runNum}`);
    console.log("  AI wants to run:", run);

    // ── SCENARIO A: No Tunnel
    const bareResult = run.every(cmd => true); // no validation, runs anything
    const bareAllCompleted = HAPPY_PATH.every(step => run.includes(step));
    const bareHasDangers = run.some(cmd => !HAPPY_PATH.includes(cmd));

    console.log(`\n  📌 SCENARIO A (No Tunnel):`);
    run.forEach(cmd => {
        const isDangerous = !HAPPY_PATH.includes(cmd);
        console.log(`     ${isDangerous ? "⚠️  RAN" : "✅ RAN"}: ${cmd}${isDangerous ? " ← DANGER: not in happy path!" : ""}`);
    });
    const bareClean = bareAllCompleted && !bareHasDangers;
    console.log(`     Result: ${bareClean ? "✅ CLEAN" : "❌ FLAWED"} (all steps done: ${bareAllCompleted}, unwanted commands: ${bareHasDangers})`);
    if (bareClean) bareSuccess++;

    // ── SCENARIO B: With Tunnel
    const { results, completedSteps, allCompleted } = validateWithTunnel(run);
    console.log(`\n  🔒 SCENARIO B (Tunnel Enforced):`);
    results.forEach(r => console.log(`     ${r.status}: ${r.cmd} — ${r.reason}`));
    console.log(`     Completed ${completedSteps}/${HAPPY_PATH.length} required steps`);
    console.log(`     Result: ${allCompleted ? "✅ CLEAN" : "❌ INCOMPLETE (blocked for safety)"}`);
    if (allCompleted) tunnelSuccess++;

    console.log("─".repeat(65));
});

// ─── Final Report ─────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(65));
console.log("  📊 FINAL RESULTS (10 Simulated Runs)");
console.log("=".repeat(65));
console.log(`\n  Scenario A (No Tunnel):        ${bareSuccess}/10 clean runs`);
console.log(`  Scenario B (Tunnel Enforced):  ${tunnelSuccess}/10 clean runs`);
console.log(`\n  Bare LLM reliability:   ${bareSuccess * 10}%`);
console.log(`  Tunnel reliability:     ${tunnelSuccess * 10}%`);
console.log("\n  Key insight:");
console.log("  The tunnel blocked DANGEROUS or OUT-OF-ORDER commands.");
console.log("  The bare LLM ran ANYTHING the AI decided, including");
console.log("  'git clean -fd', 'pm2 restart all', 'npm audit fix'.");
console.log("  In production, any one of these could break your app.\n");
console.log("=".repeat(65));
