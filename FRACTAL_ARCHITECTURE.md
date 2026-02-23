# Fractal Architecture — A Pattern for AI-Assisted Development

> **Disclaimer:** I am not a computer scientist. This is not academically peer-reviewed. This is a practical pattern I discovered while building a production SaaS (ShortsHub) over 6 months using AI coding agents. I'm sharing it to get feedback and discussion. Your mileage may vary.

---

## The Problem This Tries to Solve

When building with AI agents (Cursor, Copilot, etc.), projects tend to hit a complexity wall around feature 8-15. The AI starts:

- Modifying files it shouldn't touch
- Forgetting earlier decisions made in other files
- Introducing duplicate logic because it can't see the original
- Breaking working features while adding new ones

The root cause is that the AI reads the entire codebase to understand context. As the codebase grows, the relevant signal-to-noise ratio drops, and mistakes increase.

This pattern attempts to solve that by enforcing hard boundaries at the filesystem level — so the AI physically cannot see code outside its current task scope.

---

## The Core Idea

Instead of organising code by *type* (controllers/, models/, routes/), organise it by *feature*. Each feature is a self-contained folder with a `feature.manifest.json` file.

A central `kernel.js` recursively scans the project for manifests and auto-mounts each feature. No manual registration. No central route file to update.

```
server/
├── kernel.js                    ← Auto-discovers and mounts all features
├── index.js                     ← Just boots the kernel
└── features/
    ├── auth/
    │   ├── feature.manifest.json
    │   ├── routes.js
    │   └── service.js
    ├── payments/
    │   ├── feature.manifest.json
    │   ├── routes.js
    │   └── service.js
    └── notifications/
        ├── feature.manifest.json
        ├── routes.js
        └── service.js
```

When an AI is asked to "add a blog feature", it creates a new folder. It does not need to touch `kernel.js`, `index.js`, or any existing feature. The scope of every task is one folder.

---

## What Is a Manifest?

A `feature.manifest.json` is a small JSON file that declares a feature exists and describes it:

```json
{
  "id": "payments",
  "name": "Payments",
  "description": "Handles Stripe subscription logic",
  "version": "1.0.0",
  "enabled": true,
  "routes": "./routes.js",
  "dependencies": []
}
```

The Kernel reads this file to decide whether to mount the feature. If `enabled` is `false`, the feature is skipped — effectively a built-in feature flag at zero cost.

---

## What the Kernel Does

`kernel.js` is a Node.js file (~100 lines) that:

1. Recursively walks the `features/` directory
2. Finds every `feature.manifest.json`
3. Checks if `enabled` is `true`
4. Loads and mounts the corresponding `routes.js` on the Express app
5. Optionally runs `cron.js` if it exists (for scheduled tasks)
6. Supports nested sub-features to arbitrary depth (a feature can have child features)

This means feature #50 is added the same way as feature #1 — create a folder, add a manifest, add routes. The Kernel does the rest.

---

## Additional Components (from the production implementation)

These are things I built on top of the core pattern. They are not required to use the pattern, but they emerged from real usage:

### Admin Control Plane
A dashboard that reads the Kernel's discovered feature list at runtime and displays it. Includes toggle switches for each feature (which update `enabled` in the manifest). No redeploy needed to disable a feature.

### Heartbeat Monitor
Polls connected AI providers (Gemini, Groq) every 30 seconds and logs latency. If a provider is slow or down, traffic is redirected to another. This emerged from free-tier rate limits — sometimes Gemini is at capacity, so Groq handles the load.

### `task.todo` Pattern
A convention where the AI agent is instructed (via `AI_RULES.md`) to maintain a `task.todo` file tracking its current work. This prevents the AI from "hallucinating" completed work and gives a resumable state if context is reset.

### User Governance
User tier management (free/pro/enterprise) is handled via the Admin dashboard without touching the database directly. The feature gate middleware checks the manifest's `requiredTier` field against the user's current tier.

---

## How AI Tools Interact With This Pattern

This is the part that surprised me most. When you open this repo in an AI coding tool:

1. The AI reads `AI_RULES.md` and understands the folder convention
2. The AI reads `features/_example/` and sees what a feature looks like
3. When asked to add a feature, it creates a new folder matching the example
4. It does not modify `kernel.js` or any existing feature
5. On next boot, the Kernel discovers the new feature automatically

The pattern is self-teaching. The example feature IS the documentation for the AI. You do not need to explain the architecture each session — the file structure explains it.

---

## Honest Limitations

- **Not tested at scale**: This was built by one developer. It has not been stress-tested with large teams or high concurrency.
- **Not academically validated**: Similar patterns exist (Vertical Slice Architecture, Plugin Systems). This is a practical implementation, not a new computer science concept.
- **Infrastructure scaling is separate**: This pattern addresses development complexity and AI context management. It does not solve database scaling, traffic handling, or deployment problems.
- **Team workflow untested**: Merge conflict behaviour with multiple developers working in different feature folders simultaneously has not been formally tested.
- **Context boundary only**: This prevents cross-feature hallucinations. It does not prevent hallucinations within a single feature if that feature's files are large or complex.

---

## Why This Might Be Useful Right Now

The vibe-coding tool market (Bolt.new, Lovable, Replit) has grown rapidly but has a documented retention problem. Traffic to both Bolt (-27%) and Lovable (-40%) started declining in 2025. User complaints consistently describe the same failure: works well for the first 5-10 features, then becomes increasingly unreliable.

The community workaround emerging organically is to manually create `project_map.md` files to give the AI external memory of the codebase. This pattern attempts to solve that structurally rather than through manual documentation.

---

## Comparison to Alternatives

| Approach | Setup Cost | AI Error Reduction | Works Free Tier |
|---|---|---|---|
| RAG (vector database) | High | Partial | No |
| MCP (Anthropic protocol) | Medium | Different scope | Yes |
| Vertical Slice (flat) | Low | Partial | Yes |
| **Fractal Kernel** | Low | Cross-feature | Yes |

RAG requires indexing infrastructure and retrieves chunks without preserving relational context between files. MCP addresses external tool connectivity, not internal codebase structure. Vertical Slice is the closest theoretical match but stops at one level — no runtime discovery, no manifests, no recursive depth.

---

## Repo Structure for the Reference Implementation

```
fractal-kernel/
├── server/
│   ├── kernel.js              ← Core engine (~100 lines)
│   ├── index.js               ← Entry point
│   └── features/
│       └── _example/          ← Working example feature
│           ├── feature.manifest.json
│           ├── routes.js
│           └── service.js
├── AI_RULES.md                ← Instructions for AI coding agents
├── README.md
└── package.json
```

---

## Status

This is a pattern extracted from a production application. The reference implementation is a work in progress. Issues and feedback welcome.

The production application using this pattern: [shortshub.app](https://shortshub.app)
