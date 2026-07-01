# Parity Rules

## Core Requirement

Node-generated state must match GZDoom-generated state. Do not estimate or approximate. Diff actual state.

Required artifacts:

```txt
gzdoom.gzstate
node.gzstate
state-diff
reference-frame.png
imported-frame.png
frame-diff
```

## Pipeline

```txt
GZDoom dump
-> GZDoom import renderer
-> frame parity
-> strip renderer
-> Node GZSTATE export
-> state parity
-> event parity
-> corpus parity
-> WASM
```

## Failure Classification

Classify failures before fixing:

- serialization bug
- parser normalization bug
- GZDoom exporter bug
- importer reconstruction bug
- renderer dependency missing
- texture resolution mismatch
- flat resolution mismatch
- geometry mismatch
- BSP/node mismatch
- lighting mismatch
- transparent wall/masked texture mismatch
- sector action mismatch
- thing/voxel mismatch
- event timing mismatch
- frame-only GPU/tolerance issue

## Exactness

Exact binary/state parity is the goal for deterministic state.

Frame parity should aim for exact pixels where possible. If exact pixel parity is impossible due to GPU/driver differences, document:

- tolerance threshold
- affected tests
- cause of difference
- whether state parity remains exact

## Unsupported Features

Do not silently skip unsupported maps/features. Classify and track them in `parity-gap-tracker.md`.
