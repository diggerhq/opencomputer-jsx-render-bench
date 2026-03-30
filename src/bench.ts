/**
 * SSR Render Benchmark — OpenComputer
 *
 * Renders a React dashboard via esbuild + renderToString inside
 * OpenComputer sandboxes, across three sizes.
 *
 * Cold start: boot -> npm install -> write JSX -> bundle -> render
 * Warm start: boot -> install (untimed) -> write JSX -> bundle -> render
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

const bold  = (s: string) => console.log(`\x1b[1m${s}\x1b[0m`);
const dim   = (s: string) => console.log(`\x1b[2m  ${s}\x1b[0m`);
const green = (s: string) => console.log(`\x1b[32m${s}\x1b[0m`);
const red   = (s: string) => console.log(`\x1b[31m${s}\x1b[0m`);

const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t };
}

// ── Sandbox Sizes ────────────────────────────────────────────────────────────

const SIZES = [
  { label: "1 CPU / 4 GB",   cpuCount: 1,  memoryMB: 4096 },
  { label: "4 CPU / 16 GB",  cpuCount: 4,  memoryMB: 16384 },
  { label: "16 CPU / 64 GB", cpuCount: 16, memoryMB: 65536 },
];

// ── Phases ───────────────────────────────────────────────────────────────────

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

async function renderJsx(sandbox: Sandbox): Promise<{ writeMs: number; bundleMs: number; renderMs: number }> {
  const { ms: writeMs } = await timed(async () => {
    await sandbox.files.write("/workspace/Component.jsx", FIXTURE_JSX);
    await sandbox.files.write("/workspace/render.cjs", RENDER_SCRIPT);
  });

  const { result } = await timed(async () => {
    const r = await sandbox.exec.run("node /workspace/render.cjs", { cwd: "/workspace", timeout: 30 });
    if (r.exitCode !== 0) throw new Error(`Render failed:\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(r.stdout.trim());
  });

  return { writeMs, bundleMs: result.bundleMs, renderMs: result.renderMs };
}

// ── Table ────────────────────────────────────────────────────────────────────

interface Row { label: string; cols: (string | null)[] }

function printTable(title: string, headers: string[], rows: Row[]) {
  const W = 12;
  const labelW = Math.max(16, ...rows.map(r => r.label.length)) + 2;

  console.log();
  bold(`  ${title}`);
  const hdr = "  " + "".padEnd(labelW) + headers.map(h => h.padStart(W)).join("");
  const sep = "  " + "─".repeat(labelW + headers.length * W);
  bold(sep);
  bold(hdr);
  bold(sep);
  for (const r of rows) {
    const line = "  " + r.label.padEnd(labelW) + r.cols.map(c => (c ?? "—").padStart(W)).join("");
    console.log(line);
  }
  bold(sep);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  bold("\n┌─────────────────────────────────────────────────────────┐");
  bold("│          SSR Render Benchmark — OpenComputer            │");
  bold("└─────────────────────────────────────────────────────────┘\n");

  dim("Fixture:   Dashboard (sidebar, stat cards, 20-row table, activity feed)");
  dim("Pipeline:  boot -> npm install -> esbuild bundle -> renderToString");
  console.log();

  const sandboxes: Sandbox[] = [];

  try {
    // ── Cold Start ──────────────────────────────────────────────────
    bold("── Cold Start (fresh sandbox) ──\n");

    const coldRows: Row[] = [];

    for (const size of SIZES) {
      dim(`${size.label}...`);
      const t0 = Date.now();

      const { result: sb, ms: bootMs } = await timed(() =>
        Sandbox.create({ template: "base", timeout: 300, cpuCount: size.cpuCount, memoryMB: size.memoryMB }),
      );
      sandboxes.push(sb);
      dim(`  ${sb.sandboxId} booted in ${fmt(bootMs)}`);

      const installMs = await installDeps(sb);
      const { writeMs, bundleMs, renderMs } = await renderJsx(sb);
      const total = Date.now() - t0;

      dim(`  done: ${fmt(total)}`);
      coldRows.push({
        label: size.label,
        cols: [fmt(bootMs), fmt(installMs), fmt(writeMs), fmt(bundleMs), fmt(renderMs), fmt(total)],
      });

      await sb.kill().catch(() => {});
    }

    printTable("Cold Start", ["Boot", "Install", "Write", "Bundle", "Render", "TOTAL"], coldRows);

    // ── Warm Start ──────────────────────────────────────────────────
    bold("\n── Warm Start (deps pre-installed, render only) ──\n");

    const warmRows: Row[] = [];

    for (const size of SIZES) {
      dim(`${size.label}...`);

      const { result: sb, ms: bootMs } = await timed(() =>
        Sandbox.create({ template: "base", timeout: 300, cpuCount: size.cpuCount, memoryMB: size.memoryMB }),
      );
      sandboxes.push(sb);
      dim(`  installing deps (setup, not timed)...`);
      await installDeps(sb);

      const t0 = Date.now();
      const { writeMs, bundleMs, renderMs } = await renderJsx(sb);
      const total = Date.now() - t0;

      dim(`  done: ${fmt(total)}`);
      warmRows.push({
        label: size.label,
        cols: [fmt(bootMs), null, fmt(writeMs), fmt(bundleMs), fmt(renderMs), fmt(total)],
      });

      await sb.kill().catch(() => {});
    }

    printTable("Warm Start (render only)", ["Boot", "Install", "Write", "Bundle", "Render", "TOTAL"], warmRows);

    // ── Summary ─────────────────────────────────────────────────────
    console.log();
    bold("── Summary ──\n");
    const coldTotals = coldRows.map(r => parseInt(r.cols[5]!));
    const warmTotals = warmRows.map(r => parseInt(r.cols[5]!));
    green(`  Cold:  ${coldRows.map(r => r.cols[5]).join("  /  ")}`);
    green(`  Warm:  ${warmRows.map(r => r.cols[5]).join("  /  ")}`);
    console.log();

  } catch (err: any) {
    red(`\nFatal: ${err.message}`);
    if (err.stack) dim(err.stack);
  } finally {
    bold("── Cleanup ──\n");
    for (const sb of sandboxes) {
      try { await sb.kill(); dim(`Killed ${sb.sandboxId}`); } catch {}
    }
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
