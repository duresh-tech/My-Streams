/**
 * Frees the backend's dev port before `nest start --watch` runs, so a
 * leftover `node dist/src/main` (start:prod) instance or a previous crashed
 * dev server doesn't block startup with EADDRINUSE. Wired as "predev" /
 * "prestart:dev" in package.json. Never fails the parent script — if
 * anything goes wrong here, it just logs and lets `dev`/`start:dev` proceed
 * (which will surface its own EADDRINUSE if the port is still stuck).
 */
const { execSync } = require('child_process');

const PORT = process.env.PORT || '4000';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function freeWindows(port) {
  let output;
  try {
    output = run(`netstat -ano | findstr :${port}`);
  } catch {
    return; // no matches -> port already free
  }
  const pids = new Set();
  for (const line of output.split('\n')) {
    const match = line.match(/LISTENING\s+(\d+)\s*$/);
    if (match) pids.add(match[1]);
  }
  for (const pid of pids) {
    try {
      run(`taskkill /F /PID ${pid}`);
      console.log(`[free-port] Freed port ${port} (killed PID ${pid})`);
    } catch {
      // process may have exited between netstat and taskkill; ignore
    }
  }
}

function freePosix(port) {
  let pids;
  try {
    pids = run(`lsof -ti tcp:${port}`).trim();
  } catch {
    return; // no matches -> port already free
  }
  if (!pids) return;
  for (const pid of pids.split('\n').filter(Boolean)) {
    try {
      run(`kill -9 ${pid}`);
      console.log(`[free-port] Freed port ${port} (killed PID ${pid})`);
    } catch {
      // ignore
    }
  }
}

try {
  if (process.platform === 'win32') {
    freeWindows(PORT);
  } else {
    freePosix(PORT);
  }
} catch (e) {
  console.warn(`[free-port] Skipped (${e.message})`);
}
