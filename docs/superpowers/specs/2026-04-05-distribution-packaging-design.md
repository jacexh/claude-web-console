# claude-web-console Distribution Packaging

## Goal

Package cc-web-console for distribution via npm and Docker, with automated publishing via GitHub Actions.

## npm Package

**Name:** `claude-web-console`

**Usage:**
```bash
npx claude-web-console          # start on default port 3000
npx claude-web-console --port 8080
```

**Entry point:** `bin/cli.js` — a Node.js script that:
1. Parses `--port` (default 3000) and `--host` (default 0.0.0.0) arguments
2. Runs the Fastify server from `server/src/index.ts` via tsx

**package.json changes (root):**
- `name`: `claude-web-console`
- `version`: `0.1.0`
- `private`: remove (must be false to publish)
- `bin`: `{ "claude-web-console": "bin/cli.js" }`
- `files`: `["bin/", "server/", "client/dist/", "package.json"]`
- `engines`: `{ "node": ">=18" }`
- `dependencies`: merge server dependencies + tsx into root
- Client is pre-built; `client/src/` excluded from package via `files` field

**Prepublish:** `npm run build` builds the client. The `prepublishOnly` script ensures `client/dist/` is fresh before publish.

**Prerequisites for users:** Node.js 18+, Claude Code CLI installed and authenticated.

## Docker Image

**Base:** `node:22-slim`

**Multi-stage build:**
1. **Stage: build** — `npm ci`, `npm run build` (produces `client/dist/`)
2. **Stage: runtime** — copy built artifacts, install production deps only, install `@anthropic-ai/claude-code` globally

**Usage:**
```bash
docker run -p 3000:3000 \
  -v ~/.claude:/root/.claude \
  ghcr.io/jacexh/claude-web-console
```

**Environment variables:** `PORT` (default 3000)

**Mounted volumes:** `~/.claude` for authentication and plugin config.

## GitHub Actions

**File:** `.github/workflows/publish-cc-web-console.yml`

**Trigger:** Push tag matching `cc-web-console/v*`

**Jobs (parallel):**

### Job 1: npm-publish
1. Checkout code
2. Setup Node.js 22 with npm registry
3. `npm ci` in `cc-web-console/`
4. `npm run build` in `cc-web-console/`
5. `npm publish` with `NPM_TOKEN` secret

### Job 2: docker-publish
1. Checkout code
2. Setup Docker Buildx
3. Login to ghcr.io with `GITHUB_TOKEN`
4. Extract version from tag (e.g., `cc-web-console/v0.1.0` -> `0.1.0`)
5. Build and push to `ghcr.io/jacexh/claude-web-console:{version}` and `:latest`

**Required secrets:** `NPM_TOKEN` (for npm publish). `GITHUB_TOKEN` is auto-provided.

## Files to Create/Modify

| File | Action |
|---|---|
| `cc-web-console/package.json` | Modify: rename, add bin/files/engines, merge deps |
| `cc-web-console/bin/cli.js` | Create: CLI entry point |
| `cc-web-console/Dockerfile` | Create: multi-stage build |
| `cc-web-console/.dockerignore` | Create: exclude node_modules, .git, etc. |
| `.github/workflows/publish-cc-web-console.yml` | Create: CI/CD pipeline |
| `cc-web-console/server/package.json` | Modify: remove private, adjust for flat install |
| `cc-web-console/client/package.json` | No change (client is build-time only) |
