# Cursor API / Model Budget Policy

## Goal

Make meaningful progress without exhausting Cursor model/API limits.

## Strong Model Usage

Use strongest models for:

- architecture decisions
- GZDoom renderer dependency analysis
- hard C++ compile/debug loops
- WASM/OpenGL/WebGL backend design
- hard parity mismatches
- binary ABI decisions
- final review before major changes

## Cheaper/Faster Model Usage

Use cheaper/faster models for:

- file indexing
- docs
- boilerplate scripts
- test harness scaffolding
- TypeScript wrappers
- markdown reports
- repetitive diff summaries

## Prefer Tools

Use deterministic tools instead of model calls when possible:

```bash
rg "sector_t|line_t|side_t|subsector_t|seg_t|node_t" .
rg "RenderView|RenderFrame|FLevelLocals|FTexture" .
rg "P_CrossSpecialLine|EV_DoDoor|EV_DoFloor|EV_DoCeiling|EV_BuildStairs|EV_DoDonut" .
```

## Subagent Limits

- Recon with shell tools first.
- Spawn at most 3 expensive subagents at once.
- Use cheap/mechanical agents for docs/scaffolding.
- Summarize findings into docs so later agents do not reread the entire repo.
- Run full corpus only after smoke tests pass.
