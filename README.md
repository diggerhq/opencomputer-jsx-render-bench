# OpenComputer JSX Render Benchmark

How fast can [OpenComputer](https://opencomputer.dev) render JSX in a Firecracker microVM?

This benchmark answers a common question for developers evaluating sandbox platforms: **"If I need to compile and render JSX inside an isolated sandbox (for embedding in an iframe), how long does it take end-to-end?"**

## What it measures

A realistic React dashboard component (sidebar, stat cards, 20-row data table, activity feed) goes through this pipeline inside the sandbox:

| Phase | What happens |
|-------|-------------|
| **VM Boot** | Firecracker microVM spins up |
| **npm install** | `react`, `react-dom`, `esbuild` installed (cold start only) |
| **Write** | JSX + render harness uploaded to `/workspace/` |
| **Bundle** | esbuild compiles JSX to a CJS bundle |
| **Render** | `react-dom/server` `renderToString()` produces HTML |

Each phase is timed separately. Bundle and render are timed inside the VM for accuracy.

### Sandbox sizes

| Size | CPU | Memory |
|------|-----|--------|
| Small | 1 | 4 GB |
| Medium | 4 | 16 GB |
| Large | 16 | 64 GB |

### Two modes

- **Cold start** — fresh sandbox per size, installs deps from scratch (worst case)
- **Warm start** — sandbox with deps already installed, measures only the write + bundle + render cycle (production path)

## Setup

```bash
cp .env.example .env
# Edit .env with your OpenComputer API key

npm install
```

## Run

```bash
source .env
npm run bench
```

## Example output

```
╔═══════════════════════════════════════════════════════════╗
║       JSX Render Benchmark — OpenComputer / Firecracker  ║
╚═══════════════════════════════════════════════════════════╝

━━━ Cold Start Results ━━━
──────────────────────────────────────────────────────────────────────────────────
Sandbox Size              VM Boot  npm install    Write    Bundle    Render     TOTAL
──────────────────────────────────────────────────────────────────────────────────
Small  (2 CPU / 4GB)       1.23s       8.45s     120ms      85ms      12ms     9.90s
Medium (4 CPU / 8GB)       1.19s       6.32s     115ms      62ms       9ms     7.70s
Large  (8 CPU / 16GB)      1.21s       5.18s     118ms      48ms       7ms     6.58s
──────────────────────────────────────────────────────────────────────────────────

━━━ Warm Start Results (deps pre-installed) ━━━
──────────────────────────────────────────────────────────────────────────────────
Sandbox Size              VM Boot  npm install    Write    Bundle    Render     TOTAL
──────────────────────────────────────────────────────────────────────────────────
Small  (2 CPU / 4GB)       0.95s            —     118ms      83ms      11ms     1.16s
Medium (4 CPU / 8GB)       0.91s            —     112ms      59ms       8ms     1.09s
Large  (8 CPU / 16GB)      0.93s            —     115ms      46ms       6ms     1.10s
──────────────────────────────────────────────────────────────────────────────────

━━━ Summary ━━━
  Cold start range:   6.58s – 9.90s
  Warm start range:   1.09s – 1.16s
```

*(Numbers are illustrative — actual results depend on server load and region.)*

## Project structure

```
├── src/
│   ├── bench.ts              # Main benchmark script
│   └── fixtures/
│       ├── Dashboard.jsx     # React component rendered in the sandbox
│       └── render.cjs        # Harness that runs inside the VM (esbuild + renderToString)
├── .env.example              # API config template
├── package.json
└── README.md
```

## How it works

1. The script creates a Firecracker microVM via the OpenComputer SDK
2. It uploads `Dashboard.jsx` and `render.cjs` into the VM's filesystem
3. `render.cjs` runs inside the VM: esbuild bundles the JSX, then `renderToString()` produces HTML
4. Timing for each phase is reported back — bundle/render times are measured inside the VM for accuracy
5. The sandbox is killed after each run

For warm starts, the sandbox boots and installs deps once (not timed), then measures only the write + bundle + render cycle — simulating a pre-warmed environment where you're iterating on JSX.
