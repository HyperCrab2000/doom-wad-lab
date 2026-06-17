# GZSTATE

Canonical renderer-facing state format (v1 draft: `docs/gzrender-v2/gzstate-v1.md`).

Planned: binary reader/writer, section schema, diff support, version header.

Requirements: deterministic, versioned, little-endian, index-based (no pointers), diffable, replayable, backend-neutral.
