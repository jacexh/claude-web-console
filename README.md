# @jacexh/claude-web-console

Web-based console for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) -- manage multiple sessions, switch models, preview artifacts, and more, all from the browser.

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Multi-session management** -- create, resume, close, rename, and fork sessions
- **Model switching** -- change Claude model mid-session or at creation time
- **Permission control** -- choose permission mode per session (auto, acceptEdits, plan, bypassPermissions, dontAsk)
- **Environment variables** -- pass custom env vars when creating sessions
- **Artifact preview** -- HTML (sandboxed iframe), Markdown, code highlighting (Prism), Mermaid diagrams
- **SubAgent visualization** -- nested agent rendering with collapsible cards
- **Elicitation handling** -- inline form/URL prompts from MCP servers
- **Command menu** -- `/` slash commands with autocomplete
- **File mention** -- `@` file autocomplete in chat input
- **Settings dashboard** -- view permission mode, MCP server status, account info
- **Resizable three-panel layout** -- session list, chat, and artifact preview

## Quick Start

### npx (no install)

```bash
npx @jacexh/claude-web-console
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Global install

```bash
npm install -g @jacexh/claude-web-console
claude-web-console --port 8080
```

### Docker

```bash
docker run -p 3000:3000 \
  -v ~/.claude:/root/.claude \
  ghcr.io/jacexh/claude-web-console
```

> Mount `~/.claude` so the container can reuse your existing Claude Code authentication.

### systemd (Linux)

```bash
# Copy the service file
cp claude-web-console.service ~/.config/systemd/user/

# Edit environment variables as needed
systemctl --user edit claude-web-console.service

# Enable and start
systemctl --user enable --now claude-web-console.service

# Check status / logs
systemctl --user status claude-web-console.service
journalctl --user -u claude-web-console.service -f
```

## CLI Options

```
claude-web-console [options]

Options:
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --host <address>  Host to bind to (default: 0.0.0.0)
  --help, -h        Show this help message
  --version, -v     Show version
```

## Prerequisites

- **Node.js >= 18**
- **Claude Code CLI** installed and authenticated (`claude` must be available in PATH, or set `CLAUDE_PATH` env var)

## Development

```bash
git clone https://github.com/jacexh/claude-web-console.git
cd claude-web-console
npm install
npm run dev
```

This starts both the Fastify server and Vite dev server concurrently.

## Tech Stack

- **Server:** Fastify v5, WebSocket, `@anthropic-ai/claude-agent-sdk`
- **Client:** React 19, Vite 6, Tailwind CSS v4
- **Runtime:** tsx (no build step for server in dev)

## License

MIT
