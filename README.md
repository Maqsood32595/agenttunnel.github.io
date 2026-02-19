# AgentTunnel Test5 Branch

Self-contained tunnel server built with OpenClaw for deterministic AI agent execution.

## Overview

This tunnel server provides a secure, policy-enforced environment for AI agents to execute commands with deterministic behavior. It converts the probabilistic nature of LLMs into reliable, production-ready execution through strict command whitelisting and validation.

## Features

- **Port 4000**: Runs on dedicated port (not 3000, not 18789)
- **Policy-based security**: Command whitelisting and validation
- **Agent management**: Create/delete tunnels and agents via API
- **Deterministic execution**: Converts LLM probabilistic behavior into reliable outcomes
- **Self-contained**: No dependencies on existing AgentTunnel installations

## Architecture

### Server Components
- `server.js`: Main HTTP server with REST API endpoints
- `auth/policies.json`: Configuration file for tunnels and agents

### API Endpoints

#### Admin Endpoints (x-admin-key: openclaw-master)
- `POST /admin/tunnel/create` - Create new tunnels with command whitelists
- `POST /admin/agent/create` - Create agents assigned to tunnels

#### Agent Endpoints (x-agent-key: <generated>)
- `POST /validate` - Check if commands are allowed for agents

#### Public Endpoints
- `GET /status` - List all tunnels and agents
- `GET /health` - Server status and health information

## Security Model

### Command Whitelisting
Each tunnel defines a specific set of allowed commands. Agents can only execute commands from their tunnel's whitelist.

### Authentication
- **Admin**: Static key `openclaw-master`
- **Agents**: Generated API keys with tunnel assignment

### Policy Enforcement
Commands are validated against tunnel-specific whitelists before execution, ensuring deterministic behavior regardless of LLM suggestions.

## Usage Example

```bash
# Create a tunnel for deploying an app
curl -X POST http://localhost:4000/admin/tunnel/create \
  -H "x-admin-key: openclaw-master" \
  -H "Content-Type: application/json" \
  -d '{"name": "deploy-tunnel", "allowed_commands": ["git pull", "npm install", "pm2 restart app"]}'

# Create an agent for that tunnel
curl -X POST http://localhost:4000/admin/agent/create \
  -H "x-admin-key: openclaw-master" \
  -H "Content-Type: application/json" \
  -d '{"name": "deploy-agent", "tunnel": "deploy-tunnel"}'
```

## Deterministic Execution Benefits

This tunnel server addresses the core challenge of using LLMs in production environments:

- **Eliminates the '90% Flake' problem**: No more occasional hallucinations or skipped steps
- **Converts probabilistic to deterministic**: LLM suggestions are constrained to safe, predefined paths
- **Enterprise-ready**: Hard constraints instead of soft prompts
- **Bowling bumper effect**: Agents can make decisions within safe boundaries but cannot deviate into dangerous territory

## File Structure

```
~/my-tunnel/
├── server.js           # The enforcement engine
├── auth/
│   └── policies.json   # The source of truth
└── README.md           # This documentation
```

## Development

This tunnel server was built using OpenClaw and represents a fundamental shift from **Prompt Engineering** to **Policy Engineering**. It demonstrates how to make AI agents reliable in production through strict policy enforcement rather than trust-based prompts.

## License

This project is part of the OpenClaw ecosystem and follows its licensing terms.
