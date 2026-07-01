# 2025-06 — doom-wad-core as canonical parser

## Decision

Split WAD truth into separate package so GZSTATE export and lab renderer share one parse implementation.

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
