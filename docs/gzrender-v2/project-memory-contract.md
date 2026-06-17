# Project Memory Contract

This project must assume all chat history can disappear.

Any information that would be expensive to rediscover must be written to the repository.

The repository documentation is the authoritative memory. Chat is temporary.

## Mandatory Knowledge Capture

Whenever any of the following are discovered, write them down:

- GZDoom renderer dependency
- renderer extraction dependency
- parity blocker
- state format rule
- serialization requirement
- BSP behavior
- sector behavior
- line special behavior
- event timing behavior
- voxel integration rule
- WASM limitation
- browser limitation
- performance bottleneck
- architectural decision

## Session Completion Rule

Before ending any session, update:

```txt
docs/gzrender-v2/status.md
docs/gzrender-v2/task-board.md
docs/gzrender-v2/HANDOFF.md
```

If important discoveries occurred, update:

```txt
docs/gzrender-v2/knowledge-base.md
```

If architecture changed, create or update an ADR.

## Restart Rule

A new agent with no memory should be able to reconstruct project status from docs alone.

If that is not possible, documentation is incomplete.
