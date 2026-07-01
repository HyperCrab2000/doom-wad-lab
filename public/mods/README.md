# Optional mod fixtures for mod-corpus parity

Place PWAD or PK3 files here for GZDoom `-file` testing:

- `VoxelDoom.pk3` — Voxel Doom mod
- `Lights.pk3` — GZDoom RT / lights mod

GZDoom loads PK3 directly. Node/browser GZSTATE export currently merges **`.wad` patches only**; convert PK3 to PWAD or wait for PK3 loader in doom-wad-core.

Run:

```bash
npm run mod:parity
MOD_CORPUS_REQUIRED=1 npm run mod:parity -- doom-voxel-mod
```

Browser:

```
?mods=/mods/my_patch.wad
```

See `docs/gzrender-v2/mod-parity.md`.
