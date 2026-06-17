# Corpus Testing

## Scope

MAP01/E1M1 is only a smoke test. The project must expand to all supported maps in configured WAD/IWAD/PWAD fixtures.

## Gates

1. Single-map smoke test.
2. All maps in first target WAD.
3. IWAD corpus if available: DOOM.WAD, DOOM2.WAD, TNT.WAD, PLUTONIA.WAD.
4. User-provided WAD/PWAD fixtures.
5. Regression suite for future changes.

## Required Corpus Runner

Create a runner capable of:

- discovering maps
- exporting GZDoom GZSTATE
- exporting Node GZSTATE
- diffing state
- rendering imported state
- diffing frames
- collecting event timelines where scripted inputs exist
- producing summary reports

## Artifacts

For each WAD/map:

- state dump
- state diff
- reference frame
- imported frame
- frame diff/heatmap
- event diff if applicable
- logs

## Reports

Generate:

- summary.json
- summary.md
- per-map result folders
- failure class counts
- most common mismatch causes
- unsupported feature list
