/**
 * JSX Render Benchmark — OpenComputer / Firecracker
 *
 * Measures end-to-end time to render a React dashboard component inside
 * a Firecracker microVM, across three sandbox sizes (CPU/memory).
 *
 * Pipeline per run:
 *   1. Sandbox creation (Firecracker VM boot)
 *   2. npm install react, react-dom, esbuild  (cold start only)
 *   3. Upload JSX + render harness
 *   4. esbuild bundles JSX
 *   5. react-dom/server renderToString produces HTML
 *
 * Two modes:
 *   - Cold start: fresh sandbox, deps installed from scratch
 *   - Warm start: sandbox with deps already installed, only write + bundle + render
 *
 * Usage:
 *   npm run bench
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Sandbox } from "@opencomputer/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_JSX = readFileSync(join(__dirname, "fixtures", "Dashboard.jsx"), "utf-8");
const RENDER_SCRIPT = readFileSync(join(__dirname, "fixtures", "render.cjs"), "utf-8");

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

interface PhaseResult {
  sandbox_create: number;
  npm_install: number;
  write_jsx: number;
  bundle: number;
  render: number;
  total: number;
}

// ── Sandbox Sizes ────────────────────────────────────────────────────────────

const SANDBOX_SIZES = [
  { name: "Small  (1 CPU / 4GB)",    cpuCount: 1,  memoryMB: 4096 },
  { name: "Medium (4 CPU / 16GB)",   cpuCount: 4,  memoryMB: 16384 },
  { name: "Large  (16 CPU / 64GB)",  cpuCount: 16, memoryMB: 65536 },
];

// ── Benchmark Runner ─────────────────────────────────────────────────────────

async function installDeps(sandbox: Sandbox): Promise<number> {
  const { ms } = await timed(async () => {
    const r = await sandbox.exec.run(
      "cd /workspace && npm init -y && npm install --prefer-offline react react-dom esbuild 2>&1",
      { timeout: 120 },
    );
    if (r.exitCode !== 0) throw new Error(`npm install failed:\n${r.stdout}\n${r.stderr}`);
  });
  return ms;
}

async function runRender(sandbox: Sandbox): Promise<{ writeMs: number; bundleMs: number; renderMs: number }> {
  const { ms: writeMs } = await timed(async () => {
    await sandbox.files.write("/workspace/Component.jsx", FIXTURE_JSX);
    await sandbox.files.write("/workspace/render.cjs", RENDER_SCRIPT);
  });

  const { result } = await timed(async () => {
    const r = await sandbox.exec.run("node /workspace/render.cjs", {
      cwd: "/workspace",
      timeout: 30,
    });
    if (r.exitCode !== 0) throw new Error(`Render failed:\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(r.stdout.trim());
  });

  return { writeMs, bundleMs: result.bundleMs, renderMs: result.renderMs };
}

// ── Table Printer ────────────────────────────────────────────────────────────

function printResults(label: string, results: Array<{ size: string; phases: PhaseResult }>) {
  const colW = { size: 24, create: 10, install: 12, write: 8, bundle: 8, render: 8, total: 10 };

  console.log();
  bold(`  ${label}`);
  const header = [
    "Sandbox Size".padEnd(colW.size),
    "VM Boot".padStart(colW.create),
    "npm install".padStart(colW.install),
    "Write".padStart(colW.write),
    "Bundle".padStart(colW.bundle),
    "Render".padStart(colW.render),
    "TOTAL".padStart(colW.total),
  ].join("  ");
  bold(`  ${"─".repeat(header.length)}`);
  bold(`  ${header}`);
  bold(`  ${"─".repeat(header.length)}`);

  for (const r of results) {
    const row = [
      r.size.padEnd(colW.size),
      formatMs(r.phases.sandbox_create).padStart(colW.create),
      (r.phases.npm_install ? formatMs(r.phases.npm_install) : "—").padStart(colW.install),
      formatMs(r.phases.write_jsx).padStart(colW.write),
      formatMs(r.phases.bundle).padStart(colW.bundle),
      formatMs(r.phases.render).padStart(colW.render),
      formatMs(r.phases.total).padStart(colW.total),
    ].join("  ");
    console.log(`  ${row}`);
  }
  bold(`  ${"─".repeat(header.length)}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  bold("\n╔═══════════════════════════════════════════════════════════╗");
  bold("║       JSX Render Benchmark — OpenComputer / Firecracker  ║");
  bold("╚═══════════════════════════════════════════════════════════╝\n");

  dim("Fixture: Dashboard component (sidebar, stat cards, 20-row table, activity feed)");
  dim("Pipeline: sandbox boot -> npm install -> esbuild bundle -> React SSR renderToString");
  console.log();

  const sandboxes: Sandbox[] = [];

  try {
    // ── Cold Start ───────────────────────────────────────────────────
    bold("━━━ Cold Start (fresh sandbox, install deps from scratch) ━━━\n");

    const coldResults: Array<{ size: string; phases: PhaseResult }> = [];

    for (const size of SANDBOX_SIZES) {
      dim(`${size.name}...`);
      const totalStart = Date.now();

      const { result: sandbox, ms: createMs } = await timed(() =>
        Sandbox.create({
          template: "base",
          timeout: 300,
          cpuCount: size.cpuCount,
          memoryMB: size.memoryMB,
        }),
      );
      sandboxes.push(sandbox);
      dim(`  sandbox ${sandbox.sandboxId} booted in ${formatMs(createMs)}`);

      const installMs = await installDeps(sandbox);
      const { writeMs, bundleMs, renderMs } = await runRender(sandbox);
      const total = Date.now() - totalStart;

      dim(`  total: ${formatMs(total)} (boot=${formatMs(createMs)}, install=${formatMs(installMs)}, bundle=${formatMs(bundleMs)}, render=${formatMs(renderMs)})`);
      coldResults.push({
        size: size.name,
        phases: { sandbox_create: createMs, npm_install: installMs, write_jsx: writeMs, bundle: bundleMs, render: renderMs, total },
      });

      await sandbox.kill().catch(() => {});
    }

    printResults("Cold Start Results", coldResults);

    // ── Warm Start ───────────────────────────────────────────────────
    // Simulates a pre-warmed sandbox: boot, install deps once, then
    // measure only the write + bundle + render cycle.
    bold("\n━━━ Warm Start (deps pre-installed, measure render only) ━━━\n");

    const warmResults: Array<{ size: string; phases: PhaseResult }> = [];

    for (const size of SANDBOX_SIZES) {
      dim(`${size.name}...`);

      const { result: sandbox, ms: createMs } = await timed(() =>
        Sandbox.create({
          template: "base",
          timeout: 300,
          cpuCount: size.cpuCount,
          memoryMB: size.memoryMB,
        }),
      );
      sandboxes.push(sandbox);
      dim(`  sandbox ${sandbox.sandboxId} booted in ${formatMs(createMs)}`);

      // Install deps (not timed — this is the "warm" baseline)
      dim("  installing deps (one-time setup)...");
      await installDeps(sandbox);

      // Now measure only the render cycle
      const totalStart = Date.now();
      const { writeMs, bundleMs, renderMs } = await runRender(sandbox);
      const total = Date.now() - totalStart;

      dim(`  render cycle: ${formatMs(total)} (write=${formatMs(writeMs)}, bundle=${formatMs(bundleMs)}, render=${formatMs(renderMs)})`);
      warmResults.push({
        size: size.name,
        phases: { sandbox_create: createMs, npm_install: 0, write_jsx: writeMs, bundle: bundleMs, render: renderMs, total },
      });

      await sandbox.kill().catch(() => {});
    }

    printResults("Warm Start Results (render cycle only)", warmResults);

    // ── Summary ──────────────────────────────────────────────────────
    console.log();
    bold("━━━ Summary ━━━\n");

    const coldTotals = coldResults.map(r => r.phases.total);
    const warmTotals = warmResults.map(r => r.phases.total);
    green(`  Cold start (boot + install + render):  ${formatMs(Math.min(...coldTotals))} – ${formatMs(Math.max(...coldTotals))}`);
    green(`  Warm start (render cycle only):        ${formatMs(Math.min(...warmTotals))} – ${formatMs(Math.max(...warmTotals))}`);
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
