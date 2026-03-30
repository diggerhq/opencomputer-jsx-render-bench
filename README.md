# OpenComputer JSX Render Benchmark

How fast can you go from zero to rendered JSX inside an [OpenComputer](https://opencomputer.dev) sandbox?

We ran two benchmarks to find out — one lightweight (SSR with esbuild), one realistic (full Next.js app). Both test across three sandbox sizes.

**[Watch the walkthrough (Loom)](https://www.loom.com/share/b0a772d77d474115825012453aae4549)**

---

## TL;DR

| What | Time |
|------|------|
| SSR render (warm sandbox) | **~350ms** |
| Next.js app from checkpoint | **~2.4s** |
| Sandbox boot | ~500ms |
| Fork from checkpoint | ~150ms |

The bottleneck is `npm install` and network I/O. The actual bundle + render is ~30ms.

---

## Benchmark 1: SSR Render

Renders a React dashboard (sidebar, stat cards, 20-row data table, activity feed) using esbuild + `renderToString()`.

**Cold start** — fresh sandbox, deps installed from scratch:

| Size | Boot | Install | Bundle + Render | **Total** |
|------|------|---------|-----------------|-----------|
| 1 CPU / 4 GB | 869ms | 4.76s | 29ms | **6.17s** |
| 4 CPU / 16 GB | 465ms | 4.67s | 32ms | **5.69s** |
| 16 CPU / 64 GB | 465ms | 4.81s | 33ms | **5.98s** |

**Warm start** — deps already installed, just write + bundle + render:

| Size | **Total** |
|------|-----------|
| 1 CPU / 4 GB | **344ms** |
| 4 CPU / 16 GB | **532ms** |
| 16 CPU / 64 GB | **696ms** |

## Benchmark 2: Next.js App

A full Next.js calculator app with client components, `useState`, and a history panel. The checkpoint has `npm install` and `next build` already done — we only measure fork + `next start` + first HTTP 200.

| Size | Fork | Server start | **Total** |
|------|------|-------------|-----------|
| 1 CPU / 4 GB | 234ms | 2.23s | **2.46s** |
| 4 CPU / 16 GB | 145ms | 2.19s | **2.33s** |
| 16 CPU / 64 GB | 126ms | 2.31s | **2.43s** |

---

## Run it yourself

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your OpenComputer API key
npm install

# 2. Source credentials
source .env

# 3. Run benchmarks
npm run bench          # SSR render (cold + warm, 3 sizes)
npm run bench:nextjs   # Next.js app (from checkpoint, 3 sizes)

# Optional: create a fresh checkpoint for the Next.js bench
npm run setup
```

## Try the calculator locally

```bash
cd src/fixtures/nextjs-calculator
npm install
npm run dev
# http://localhost:3000
```

## Project structure

```
src/
├── bench.ts                  # SSR render benchmark
├── bench-nextjs.ts           # Next.js app benchmark (from checkpoint)
├── setup-checkpoint.ts       # Creates the pre-built checkpoint
└── fixtures/
    ├── Dashboard.jsx         # React dashboard component
    ├── render.cjs            # esbuild + renderToString harness
    └── nextjs-calculator/    # Full Next.js calculator app
```

## How it works

**SSR bench** boots a sandbox, installs react + esbuild, uploads a JSX component, bundles it, and runs `renderToString()`. Bundle and render are timed inside the sandbox for accuracy.

**Next.js bench** forks from a pre-built checkpoint (deps + production build already done) and measures time to `next start` + first HTTP 200.

**Setup** (`npm run setup`) boots a sandbox, uploads the calculator app, runs `npm install` + `next build`, checkpoints it, and prints the ID.
