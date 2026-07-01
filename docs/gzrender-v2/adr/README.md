# Architecture Decision Records (ADR)

GZRender-V2 uses ADRs to capture durable architectural decisions. Chat history is temporary; ADRs persist in the repo.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-0001](./ADR-0001-project-memory.md) | Repository documentation is the project memory | Accepted |

## When to create an ADR

Create or update an ADR when a decision affects:

- GZSTATE format or versioning
- Renderer extraction boundaries
- Backend abstraction (OpenGL / WebGL2 / WebGPU / raytracing)
- Module federation (renderer vs gameplay-ai vs quest-logic)
- Parity tolerance policy
- WASM ABI shape
- Build/toolchain choices that are hard to reverse

## Template

Copy [ADR-TEMPLATE.md](./ADR-TEMPLATE.md) for new records. Number sequentially: `ADR-0002-…`, `ADR-0003-…`, etc.

## Status values

- **Proposed** — under discussion
- **Accepted** — current decision
- **Superseded** — replaced by a later ADR (link to successor)
- **Rejected** — considered and declined
