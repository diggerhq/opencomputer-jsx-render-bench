/**
 * Setup: Create a pre-built checkpoint for the Next.js calculator app.
 *
 * Boots a sandbox, uploads the app, runs npm install + next build,
 * then creates a checkpoint. Print the checkpoint ID to use in bench-nextjs.ts.
 *
 * Usage:
 *   npm run setup
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  bold("\n━━━ Setup: Create Next.js checkpoint ━━━\n");

  let sandbox: Sandbox | null = null;

  try {
    // Boot sandbox
    const { result: sb, ms: createMs } = await timed(() =>
      Sandbox.create({ template: "base", timeout: 600, cpuCount: 2, memoryMB: 8192 }),
    );
    sandbox = sb;
    dim(`sandbox ${sandbox.sandboxId} booted in ${formatMs(createMs)}`);

    // Upload files
    const { ms: uploadMs } = await timed(async () => {
      const dirs = new Set(FIXTURE_FILES.map(f => f.remotePath.replace(/\/[^/]+$/, "")));
      await sandbox!.exec.run(`mkdir -p ${[...dirs].join(" ")}`, { timeout: 10 });

      for (const file of FIXTURE_FILES) {
        const b64 = Buffer.from(file.content).toString("base64");
        const r = await sandbox!.exec.run(`printf '%s' "${b64}" | base64 -d > ${file.remotePath}`, { timeout: 10 });
        if (r.exitCode !== 0) throw new Error(`Failed to write ${file.remotePath}: ${r.stderr}`);
      }
    });
    dim(`uploaded ${FIXTURE_FILES.length} files in ${formatMs(uploadMs)}`);

    // npm install
    dim("npm install...");
    const { ms: installMs } = await timed(async () => {
      const dot = setInterval(() => process.stdout.write("."), 2000);
      try {
        const r = await sandbox!.exec.run("cd /workspace && npm install 2>&1", { timeout: 180 });
        console.log();
        if (r.exitCode !== 0) throw new Error(`npm install failed:\n${r.stdout}\n${r.stderr}`);
      } finally {
        clearInterval(dot);
      }
    });
    dim(`npm install: ${formatMs(installMs)}`);

    // next build
    const { ms: buildMs } = await timed(async () => {
      let exitCode = -1;
      const session = await sandbox!.exec.start("sh", {
        args: ["-c", "cd /workspace && npx next build 2>&1"],
        timeout: 300,
        onStdout: (data) => {
          const text = new TextDecoder().decode(data).trim();
          if (text) dim(`[build] ${text}`);
        },
        onExit: (code) => { exitCode = code; },
      });
      await session.done;
      if (exitCode !== 0) throw new Error(`next build failed with exit code ${exitCode}`);
    });
    dim(`next build: ${formatMs(buildMs)}`);

    // Create checkpoint
    bold("\nCreating checkpoint...\n");

    const { result: checkpoint, ms: cpMs } = await timed(() =>
      sandbox!.createCheckpoint("nextjs-calculator-built"),
    );
    dim(`checkpoint created in ${formatMs(cpMs)} (status: ${checkpoint.status})`);

    // Wait for ready
    dim("waiting for checkpoint to be ready...");
    const start = Date.now();
    while (Date.now() - start < 120_000) {
      const list = await sandbox.listCheckpoints();
      const cp = list.find((c) => c.id === checkpoint.id);
      if (cp && cp.status === "ready") break;
      if (cp && cp.status !== "processing") throw new Error(`Checkpoint status: ${cp.status}`);
      await sleep(1000);
    }
    dim(`checkpoint ready in ${formatMs(Date.now() - start)}`);

    console.log();
    bold("━━━ Done ━━━\n");
    green(`  Checkpoint ID: ${checkpoint.id}`);
    green(`  Update CHECKPOINT_ID in src/bench-nextjs.ts to use it.`);
    console.log();

  } catch (err: any) {
    red(`\nFatal: ${err.message}`);
    if (err.stack) dim(err.stack);
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {});
      dim(`Killed ${sandbox.sandboxId}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
