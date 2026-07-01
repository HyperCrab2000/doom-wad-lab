# 2025-03-16 — Fork Andrew Lowndes doom WebGL

## Decision

Chose Vite + React 19 + TypeScript over webpack alpha. Reason: HMR, modern tooling, path to production deploy.

## Context

This entry is part of the **Project Chronicle** — a diary of architectural choices in doom-wad-lab, doom-wad-core, and gzdoom-project integration.

## Related docs

- [Project history](../../project-history.md)
- [Master bible hub](../README.md)
- [GZDoom gold overview](../gzdoom/00-gold-standard-overview.md)

## Tests that guard this decision

| Test | Layer |
|------|-------|
| `npm run test:unit` | Unit |
| `npm run test:corpus` | GZSTATE static |
| `npm run test:diamond` | E2E acceptance |

---

[← Chronicle index](./README.md)
