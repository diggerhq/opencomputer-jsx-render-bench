/**
 * Next.js App Benchmark — OpenComputer
 *
 * Measures end-to-end time to serve a Next.js calculator app
 * inside an OpenComputer sandbox.
 *
 * Two modes:
 *   - Cold start: boot -> upload -> npm install -> next build -> next start -> HTTP 200
 *   - From checkpoint: fork from pre-built checkpoint -> next start -> HTTP 200
 *
 * Usage:
 *   npm run bench:nextjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";
import { Sandbox } from "@opencomputer/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "nextjs-calculator");

// ── Collect all fixture files ────────────────────────────────────────────────

interface FileEntry { remotePath: string; content: string }

function collectFiles(dir: string, base: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      entries.push(...collectFiles(full, base));
    } else {
      entries.push({
        remotePath: `/workspace/${relative(base, full)}`,
        content: readFileSync(full, "utf-8"),
      });
    }
  }
  return entries;
}

const FIXTURE_FILES = collectFiles(FIXTURE_DIR, FIXTURE_DIR);

// ── Helpers ──────────────────────────────────────────────────────────────────

function bold(msg: string) { console.log(`\x1b[1m${msg}\x1b[0m`); }
function dim(msg: string) { console.log(`\x1b[2m  ${msg}\x1b[0m`); }
function green(msg: string) { console.log(`\x1b[32m${msg}\x1b[0m`); }
function red(msg: string) { console.log(`\x1b[31m${msg}\x1b[0m`); }

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Upload files to sandbox ──────────────────────────────────────────────────

async function uploadFiles(sandbox: Sandbox): Promise<number> {
  const { ms } = await timed(async () => {
    const dirs = new Set(FIXTURE_FILES.map(f => f.remotePath.replace(/\/[^/]+$/, "")));
    await sandbox.exec.run(`mkdir -p ${[...dirs].join(" ")}`, { timeout: 10 });

    for (const file of FIXTURE_FILES) {
      const b64 = Buffer.from(file.content).toString("base64");
      const r = await sandbox.exec.run(`printf '%s' "${b64}" | base64 -d > ${file.remotePath}`, { timeout: 10 });
      if (r.exitCode !== 0) throw new Error(`Failed to write ${file.remotePath}: ${r.stderr}`);
      dim(`    wrote ${file.remotePath}`);
    }
  });
  dim(`    uploaded ${FIXTURE_FILES.length} files in ${formatMs(ms)}`);
  return ms;
}

// ── npm install ──────────────────────────────────────────────────────────────

async function npmInstall(sandbox: Sandbox): Promise<number> {
  dim("    npm install...");
  const { ms } = await timed(async () => {
    const dot = setInterval(() => process.stdout.write("."), 2000);
    try {
      const r = await sandbox.exec.run("cd /workspace && npm install 2>&1", { timeout: 180 });
      console.log();
      if (r.exitCode !== 0) throw new Error(`npm install failed:\n${r.stdout}\n${r.stderr}`);
      const lastLine = r.stdout.trim().split("\n").pop();
      if (lastLine) dim(`    [npm] ${lastLine}`);
    } finally {
      clearInterval(dot);
    }
  });
  dim(`    npm install: ${formatMs(ms)}`);
  return ms;
}

// ── next build ───────────────────────────────────────────────────────────────

async function nextBuild(sandbox: Sandbox): Promise<number> {
  const { ms } = await timed(async () => {
    let exitCode = -1;
    const session = await sandbox.exec.start("sh", {
      args: ["-c", "cd /workspace && npx next build 2>&1"],
      timeout: 300,
      onStdout: (data) => {
        const text = new TextDecoder().decode(data).trim();
        if (text) dim(`    [build] ${text}`);
      },
      onExit: (code) => { exitCode = code; },
    });
    await session.done;
    if (exitCode !== 0) throw new Error(`next build failed with exit code ${exitCode}`);
  });
  dim(`    next build: ${formatMs(ms)}`);
  return ms;
}

// ── next start + poll HTTP 200 ───────────────────────────────────────────────

async function nextStartAndWait(sandbox: Sandbox): Promise<number> {
  const { ms } = await timed(async () => {
    await sandbox.exec.start("sh", {
      args: ["-c", "cd /workspace && npx next start -p 3000 2>&1"],
      onStdout: (data) => {
        const text = new TextDecoder().decode(data).trim();
        if (text) dim(`    [server] ${text}`);
      },
      onExit: () => {},
    });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const check = await sandbox.exec.run("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000", { timeout: 5 });
      if (check.stdout.trim() === "200") return;
      await sleep(250);
    }
    throw new Error("Next.js server did not become ready within 30s");
  });
  dim(`    next start -> HTTP 200: ${formatMs(ms)}`);
  return ms;
}

// ── Wait for checkpoint ready ────────────────────────────────────────────────

async function waitForCheckpoint(sandbox: Sandbox, checkpointId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await sandbox.listCheckpoints();
    const cp = list.find((c) => c.id === checkpointId);
    if (cp && cp.status === "ready") return;
    if (cp && cp.status !== "processing") throw new Error(`Checkpoint ${checkpointId} status: ${cp.status}`);
    await sleep(1000);
  }
  throw new Error(`Checkpoint ${checkpointId} not ready after ${timeoutMs / 1000}s`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const SIZE = { cpuCount: 2, memoryMB: 8192 };

async function main() {
  bold("\n╔═══════════════════════════════════════════════════════════╗");
  bold("║        Next.js App Benchmark — OpenComputer               ║");
  bold("╚═══════════════════════════════════════════════════════════╝\n");

  dim("Fixture: Calculator app (client components, state, history panel)");
  dim("Sandbox: 2 CPU / 8GB");
  console.log();

  const sandboxes: Sandbox[] = [];

  try {
    // ── Cold Start ─────────────────────────────────────────────────
    bold("━━━ Cold Start (full pipeline) ━━━\n");

    const coldTotalStart = Date.now();

    const { result: sandbox, ms: createMs } = await timed(() =>
      Sandbox.create({ template: "base", timeout: 600, ...SIZE }),
    );
    sandboxes.push(sandbox);
    dim(`  sandbox ${sandbox.sandboxId} booted in ${formatMs(createMs)}`);

    const uploadMs = await uploadFiles(sandbox);
    const installMs = await npmInstall(sandbox);
    const buildMs = await nextBuild(sandbox);
    const startMs = await nextStartAndWait(sandbox);

    const coldTotal = Date.now() - coldTotalStart;
    console.log();
    green(`  Cold start total: ${formatMs(coldTotal)}`);
    green(`    boot=${formatMs(createMs)}  upload=${formatMs(uploadMs)}  install=${formatMs(installMs)}  build=${formatMs(buildMs)}  start=${formatMs(startMs)}`);

    // ── Create Checkpoint ──────────────────────────────────────────
    // Kill the running server, checkpoint the built state
    bold("\n━━━ Creating checkpoint (post-build snapshot) ━━━\n");

    // Stop next server so checkpoint captures clean state
    await sandbox.exec.run("pkill -f 'next start' || true", { timeout: 5 });
    await sleep(500);

    const { result: checkpoint, ms: cpCreateMs } = await timed(() =>
      sandbox.createCheckpoint("nextjs-built"),
    );
    dim(`  checkpoint ${checkpoint.id} created in ${formatMs(cpCreateMs)} (status: ${checkpoint.status})`);

    dim("  waiting for checkpoint to be ready...");
    const { ms: cpReadyMs } = await timed(() =>
      waitForCheckpoint(sandbox, checkpoint.id),
    );
    dim(`  checkpoint ready in ${formatMs(cpReadyMs)}`);

    await sandbox.kill().catch(() => {});

    // ── From Checkpoint ────────────────────────────────────────────
    bold("\n━━━ From Checkpoint (skip install + build) ━━━\n");

    const warmTotalStart = Date.now();

    const { result: warmSandbox, ms: forkMs } = await timed(() =>
      Sandbox.createFromCheckpoint(checkpoint.id, { timeout: 600 }),
    );
    sandboxes.push(warmSandbox);
    dim(`  sandbox ${warmSandbox.sandboxId} forked in ${formatMs(forkMs)}`);

    const warmStartMs = await nextStartAndWait(warmSandbox);
    const warmTotal = Date.now() - warmTotalStart;

    console.log();
    green(`  From checkpoint total: ${formatMs(warmTotal)}`);
    green(`    fork=${formatMs(forkMs)}  start=${formatMs(warmStartMs)}`);

    // ── Cleanup checkpoint ─────────────────────────────────────────
    // Re-connect to original sandbox to delete checkpoint (need any sandbox that created it)
    // Actually createFromCheckpoint sandbox can't delete it — use the API directly
    // Just note: checkpoint will auto-expire

    // ── Summary ────────────────────────────────────────────────────
    console.log();
    bold("━━━ Summary ━━━\n");
    green(`  Cold start (boot + upload + install + build + start):  ${formatMs(coldTotal)}`);
    green(`  From checkpoint (fork + start):                        ${formatMs(warmTotal)}`);
    green(`  Speedup:                                               ${(coldTotal / warmTotal).toFixed(1)}x`);
    console.log();

  } catch (err: any) {
    red(`\nFatal: ${err.message}`);
    if (err.stack) dim(err.stack);
  } finally {
    bold("━━━ Cleanup ━━━\n");
    for (const sb of sandboxes) {
      try {
        await sb.kill();
        dim(`Killed ${sb.sandboxId}`);
      } catch { /* best effort */ }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
