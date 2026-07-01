# Parity Artifacts and Reports

Per-map parity outputs live under [artifacts/gzrender-v2/](../../../artifacts/gzrender-v2/) at the repo root. This folder holds human-readable parity summaries and investigation notes.

## Required artifacts per map (see [parity-rules.md](../parity-rules.md))

```txt
gzdoom.gzstate
node.gzstate
state-diff
reference-frame.png
imported-frame.png
frame-diff
```

## Corpus reports

- `summary.json` — machine-readable corpus run
- `summary.md` — human-readable corpus run

Track unsupported features and open gaps in [parity-gap-tracker.md](../parity-gap-tracker.md).
