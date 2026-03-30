# OpenComputer JSX Render Benchmark

How fast can [OpenComputer](https://opencomputer.dev) render JSX in a sandbox?

This benchmark answers a common question for developers evaluating sandbox platforms: **"If I need to compile and render JSX inside an isolated sandbox (for embedding in an iframe), how long does it take end-to-end?"**

## Two benchmarks

### 1. SSR Render (`npm run bench`)

Renders a React dashboard component using esbuild + `renderToString()`. Fast, lightweight.

| Phase | What happens |
|-------|-------------|
| **VM Boot** | Sandbox spins up |
| **npm install** | `react`, `react-dom`, `esbuild` installed (cold start only) |
| **Write** | JSX + render harness uploaded to `/workspace/` |
| **Bundle** | esbuild compiles JSX to a CJS bundle |
| **Render** | `react-dom/server` `renderToString()` produces HTML |

Runs in cold start (full pipeline) and warm start (render cycle only) modes.

### 2. Next.js App (`npm run bench:nextjs`)

Builds and serves a full Next.js calculator app — client components, state management, history panel. Measures time to first HTTP 200.

| Phase | What happens |
|-------|-------------|
| **VM Boot** | Sandbox spins up |
| **Upload** | Next.js app files written to `/workspace/` |
| **npm install** | `next`, `react`, `react-dom` installed |
| **next build** | Production build |
| **Start** | `next start` + poll until HTTP 200 on port 3000 |

### Sandbox sizes

| Size | CPU | Memory |
|------|-----|--------|
| Small | 1 | 4 GB |
| Medium | 4 | 16 GB |
| Large | 16 | 64 GB |

## Setup

```bash
cp .env.example .env
# Edit .env with your OpenComputer API key

npm install
```

## Run

```bash
source .env

# SSR render benchmark
npm run bench

# Next.js app benchmark
npm run bench:nextjs
```

## Try the calculator locally

```bash
cd src/fixtures/nextjs-calculator
npm install
npm run dev
# Open http://localhost:3000
```

## Project structure

```
src/
├── bench.ts                          # SSR render benchmark
├── bench-nextjs.ts                   # Next.js app benchmark
└── fixtures/
    ├── Dashboard.jsx                 # React component for SSR bench
    ├── render.cjs                    # esbuild + renderToString harness
    └── nextjs-calculator/            # Full Next.js app for app bench
        ├── package.json
        ├── next.config.js
        └── app/
            ├── layout.tsx
            ├── page.tsx
            ├── Calculator.tsx        # Client component with state
            └── History.tsx           # Calculation history panel
```

## How it works

**SSR bench:** Creates a sandbox, uploads a JSX component and a render harness. The harness runs inside the VM: esbuild bundles the JSX, then `renderToString()` produces HTML. Bundle/render times are measured inside the VM for accuracy.

**Next.js bench:** Creates a sandbox, uploads the full Next.js app, runs `npm install` + `next build` + `next start`, then polls `localhost:3000` until it gets an HTTP 200. This measures the realistic end-to-end time to have an interactive app running in a sandbox.
