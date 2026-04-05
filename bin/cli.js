#!/usr/bin/env node

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  const eq = args.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  return fallback;
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
claude-web-console - Web-based console for Claude Code

Usage:
  claude-web-console [options]

Options:
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --host <address>  Host to bind to (default: 0.0.0.0)
  --help, -h        Show this help message
  --version, -v     Show version
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(pkg.version);
  process.exit(0);
}

const port = getArg('--port', process.env.PORT || '3000');
const host = getArg('--host', '0.0.0.0');

process.env.PORT = port;
process.env.HOST = host;

// Launch the server via tsx
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, '..', 'server', 'src', 'index.ts');
const tsxBin = join(__dirname, '..', 'node_modules', '.bin', 'tsx');

const child = spawn(tsxBin, [serverEntry], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOST: host },
});

child.on('exit', (code) => process.exit(code ?? 0));

// Forward signals
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
