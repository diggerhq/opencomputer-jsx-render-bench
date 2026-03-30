/**
 * Render harness — runs inside the sandbox.
 * esbuild bundles the JSX, then react-dom/server renders it to HTML.
 * Outputs JSON with timing for each phase.
 */
const { execSync } = require("child_process");

// Phase: bundle
const bundleStart = Date.now();
execSync(
  "./node_modules/.bin/esbuild /workspace/Component.jsx " +
  "--bundle --outfile=/workspace/bundle.js --format=cjs " +
  "--jsx=automatic --loader:.jsx=jsx " +
  "--external:react --external:react-dom",
  { cwd: "/workspace" },
);
const bundleMs = Date.now() - bundleStart;

// Phase: render to HTML
const renderStart = Date.now();
const React = require("react");
const { renderToString } = require("react-dom/server");
const Component = require("/workspace/bundle.js").default;
const html = renderToString(React.createElement(Component));
const renderMs = Date.now() - renderStart;

const htmlBytes = Buffer.byteLength(html, "utf-8");
console.log(JSON.stringify({ bundleMs, renderMs, htmlBytes }));
