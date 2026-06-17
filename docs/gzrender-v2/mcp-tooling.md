# Optional MCP / External Tooling Acceleration

## Purpose

MCP integrations are allowed and encouraged if they reduce manual work, improve test reliability, or lower model/API usage.

MCP must not become required for the core project to build or run. The project should still work from local scripts and normal CLI commands.

## Useful MCP Candidates

- filesystem MCP for repo/file navigation and artifact inspection
- git/GitHub MCP for branch status and PR summaries
- terminal/shell MCP for build/test/corpus execution
- Playwright/browser MCP for WASM/WebGL smoke tests and screenshots
- sqlite/postgres MCP for optional parity result database
- artifact/storage MCP for large frame diffs, heatmaps, GZSTATE files, corpus reports

## Use MCP For

- running repeatable tests
- collecting build logs
- collecting parity artifacts
- inspecting generated files
- browser smoke testing
- visual regression screenshots
- summarizing large corpus results

## Do Not Use MCP For

- replacing deterministic local scripts
- hiding project logic outside the repo
- requiring proprietary external services for basic development
- making changes that cannot be reproduced locally

## API Budget Benefit

Prefer MCP/tool execution over model reasoning when facts can be obtained mechanically.
