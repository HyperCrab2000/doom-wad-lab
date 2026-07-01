# 2026-06 — Strip gl_lightmode / gl_light_sprites from WASM

## Decision

Unknown CVARs crashed exec path. Use gl_fogmode + gl_bandedswlight for lighting layer parity instead.

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
