// `npm run share` — serve the built game from this PC and expose it with a free Cloudflare quick tunnel.
// No account needed. The link works while this window stays open and changes every run.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 8787;

function findCloudflared(): string {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  return candidates.find((p) => existsSync(p)) ?? 'cloudflared'; // fall back to PATH
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server/relay.ts'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const tunnel = spawn(findCloudflared(), ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let announced = false;
const scan = (buf: Buffer) => {
  const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !announced) {
    announced = true;
    const line = '='.repeat(64);
    console.log(`\n${line}\n  🚐 Roadtrip Roulette is live:\n\n     ${m[0]}\n\n  Send this link to your crew. Host a game, share the room code.\n  Keep this window open — closing it takes the game offline.\n${line}\n`);
  }
};
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', scan);
tunnel.on('error', (e) => { console.error('Could not start cloudflared:', e.message, '\nInstall it with: winget install Cloudflare.cloudflared'); shutdown(1); });
tunnel.on('exit', (code) => { if (!stopping) { console.error(`cloudflared exited (${code})`); shutdown(1); } });
server.on('exit', (code) => { if (!stopping) { console.error(`server exited (${code})`); shutdown(1); } });

let stopping = false;
function shutdown(code = 0) {
  stopping = true;
  tunnel.kill(); server.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
