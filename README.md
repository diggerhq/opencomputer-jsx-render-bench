# OpenComputer JSX Render Benchmark

How fast can [OpenComputer](https://opencomputer.dev) render JSX in a sandbox?

## Results

### SSR Render (esbuild + renderToString)

Cold start — fresh sandbox, install deps from scratch:

| Size | Boot | Install | Write | Bundle | Render | **Total** |
|------|------|---------|-------|--------|--------|-----------|
| 1 CPU / 4 GB | 869ms | 4.76s | 389ms | 7ms | 22ms | **6.17s** |
| 4 CPU / 16 GB | 465ms | 4.67s | 414ms | 9ms | 23ms | **5.69s** |
| 16 CPU / 64 GB | 465ms | 4.81s | 518ms | 11ms | 22ms | **5.98s** |

Warm start — deps pre-installed, render cycle only:

| Size | Write | Bundle | Render | **Total** |
|------|-------|--------|--------|-----------|
| 1 CPU / 4 GB | 200ms | 6ms | 22ms | **344ms** |
| 4 CPU / 16 GB | 385ms | 10ms | 22ms | **532ms** |
| 16 CPU / 64 GB | 472ms | 8ms | 22ms | **696ms** |

### Next.js App (fork from checkpoint)

Full Next.js calculator app — pre-built checkpoint with `npm install` + `next build` already done. Measures fork + `next start` to HTTP 200:

| Size | Fork | Start | **Total** |
|------|------|-------|-----------|
| 1 CPU / 4 GB | 234ms | 2.23s | **2.46s** |
| 4 CPU / 16 GB | 145ms | 2.19s | **2.33s** |
| 16 CPU / 64 GB | 126ms | 2.31s | **2.43s** |

### Key takeaways

- **SSR render in ~350ms** with a warm sandbox (deps already installed)
- **Full Next.js app serving in ~2.4s** from a pre-built checkpoint
- Sandbox boot is ~500ms, forking from checkpoint is ~150ms
- Bundle + render time is negligible (~30ms) — the bottleneck is npm install and network I/O

## Setup

```bash
cp .env.example .env
# Edit .env with your OpenComputer API key

npm install
```

## Run

```bash
source .env

# SSR render benchmark (cold + warm start, 3 sizes)
npm run bench

# Next.js app benchmark (fork from checkpoint, 3 sizes)
npm run bench:nextjs

# Create a fresh checkpoint for the Next.js bench
npm run setup
```

## Project structure

```
src/
├── bench.ts                  # SSR render benchmark
├── bench-nextjs.ts           # Next.js app benchmark (from checkpoint)
├── setup-checkpoint.ts       # Creates the pre-built checkpoint
└── fixtures/
    ├── Dashboard.jsx         # React dashboard for SSR bench
    ├── render.cjs            # esbuild + renderToString harness (runs inside sandbox)
    └── nextjs-calculator/    # Full Next.js calculator app
        ├── package.json
        ├── next.config.js
        ├── tsconfig.json
        └── app/
            ├── layout.tsx
            ├── page.tsx
            ├── Calculator.tsx
            └── History.tsx
```

## How it works

**SSR bench** creates a sandbox, installs react + esbuild, uploads a JSX dashboard component, bundles it with esbuild, and renders to HTML via `renderToString()`. Bundle and render times are measured inside the sandbox for accuracy.

**Next.js bench** forks a sandbox from a pre-built checkpoint that already has deps installed and a production build done. It starts the Next.js server and polls until HTTP 200. Run `npm run setup` to create the checkpoint.

**Setup** boots a sandbox, uploads the calculator app, runs `npm install` + `next build`, and creates a checkpoint. Prints the checkpoint ID to plug into `bench-nextjs.ts`.
