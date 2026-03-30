/**
 * Next.js App Benchmark — OpenComputer
 *
 * Forks sandboxes from a pre-built checkpoint (Next.js calculator app
 * with deps installed and production build done), across three sizes.
 *
 * Measures: fork from checkpoint -> next start -> HTTP 200
 *
 * Run `npm run setup` first to create the checkpoint.
 *
 * Usage:
 *   npm run bench:nextjs
 */

import { Sandbox } from "@opencomputer/sdk";

const CHECKPOINT_ID = "a8d9b156-4cc7-4d38-b0f7-9ba5266f58d4";

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Sandbox Sizes ────────────────────────────────────────────────────────────

const SIZES = [
  { label: "1 CPU / 4 GB",   cpuCount: 1,  memoryMB: 4096 },
  { label: "4 CPU / 16 GB",  cpuCount: 4,  memoryMB: 16384 },
  { label: "16 CPU / 64 GB", cpuCount: 16, memoryMB: 65536 },
];

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
  return ms;
}

// ── Table ────────────────────────────────────────────────────────────────────

interface Row { label: string; cols: string[] }

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
    const line = "  " + r.label.padEnd(labelW) + r.cols.map(c => c.padStart(W)).join("");
    console.log(line);
  }
  bold(sep);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  bold("\n┌─────────────────────────────────────────────────────────┐");
  bold("│        Next.js App Benchmark — OpenComputer             │");
  bold("└─────────────────────────────────────────────────────────┘\n");

  dim("Fixture:     Calculator app (client components, state, history panel)");
  dim("Checkpoint:  Pre-built (npm install + next build done)");
  dim("Pipeline:    fork from checkpoint -> next start -> HTTP 200");
  console.log();

  const sandboxes: Sandbox[] = [];
  const rows: Row[] = [];

  try {
    bold("── Fork from checkpoint ──\n");

    for (const size of SIZES) {
      dim(`${size.label}...`);
      const t0 = Date.now();

      const { result: sb, ms: forkMs } = await timed(() =>
        Sandbox.createFromCheckpoint(CHECKPOINT_ID, { timeout: 600 }),
      );
      sandboxes.push(sb);
      dim(`  ${sb.sandboxId} forked in ${fmt(forkMs)}`);

      const startMs = await nextStartAndWait(sb);
      const total = Date.now() - t0;

      dim(`  done: ${fmt(total)}`);
      rows.push({
        label: size.label,
        cols: [fmt(forkMs), fmt(startMs), fmt(total)],
      });

      await sb.kill().catch(() => {});
    }

    printTable("From Checkpoint", ["Fork", "Start", "TOTAL"], rows);

    // ── Summary ─────────────────────────────────────────────────────
    console.log();
    bold("── Summary ──\n");
    green(`  ${rows.map(r => `${r.label}: ${r.cols[2]}`).join("  |  ")}`);
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
