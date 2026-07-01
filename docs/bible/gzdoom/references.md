# References

External documentation, wikis, and doom-wad-lab cross-links for the GZDoom Renderer Bible.

**Back to:** [README.md](./README.md)

---

## GZDoom and ZDoom wikis

| Resource | URL | Relevance |
|----------|-----|-----------|
| GZDoom wiki (main) | https://zdoom.org/wiki | Engine overview, CVARs, MAPINFO |
| OpenGL renderer | https://zdoom.org/wiki/OpenGL_renderer | HW renderer features, legacy notes |
| CVARs: OpenGL | https://zdoom.org/wiki/CVARs:OpenGL | `gl_render_*`, `gl_lightmode`, fog |
| Sector types | https://zdoom.org/wiki/Sector_type | Special sector lighting/movement |
| Line types | https://zdoom.org/wiki/Linedef_types | Boom/Hexen specials affecting render |
| TEXTMAP / UDMF | https://zdoom.org/wiki/UDMF | Modern map format vs Doom lumps |
| GL nodes | https://zdoom.org/wiki/node | GLBSP / GLZNODES vs vanilla nodes |
| Portals (dynamic) | https://zdoom.org/wiki/Portal | Sector portal concepts |
| Skyboxes | https://zdoom.org/wiki Skybox | Enclosed sky sectors |
| DECORATE / ZScript | https://zdoom.org/wiki/ZScript | Actor/render style definitions (stripped in gold WASM) |

---

## Source repositories

| Repo | Location | Role |
|------|----------|------|
| gzdoom-project fork | `/Users/williamfarmer/IdeaProjects/doom/gzdoom-project` | GLES HW renderer C++ source |
| doom-wad-lab | `/Users/williamfarmer/IdeaProjects/doom/doom-wad-lab` | WASM host, gates, GZSTATE tools |
| doom-wad-core | npm `@hypercrab2000/doom-wad-core` | Node IWAD parse, GZSTATE export |

Upstream reference: https://github.com/ZDoom/gzdoom (fork diverges for gzrender).

---

## doom-wad-lab gzrender-v2 docs

| Document | Path |
|----------|------|
| Project README | [docs/gzrender-v2/README.md](../../gzrender-v2/README.md) |
| Gold vs modular WASM | [docs/gzrender-v2/wasm-gold-and-modular.md](../../gzrender-v2/wasm-gold-and-modular.md) |
| GZSTATE v1 spec | [docs/gzrender-v2/gzstate-v1.md](../../gzrender-v2/gzstate-v1.md) |
| Architecture rules | [docs/gzrender-v2/architecture-rules.md](../../gzrender-v2/architecture-rules.md) |
| Parity rules | [docs/gzrender-v2/parity-rules.md](../../gzrender-v2/parity-rules.md) |
| Testing reference | [docs/TESTING.md](../../TESTING.md) |
| WASM build log | [docs/gzrender-v2/wasm-webgl-renderer.md](../../gzrender-v2/wasm-webgl-renderer.md) |
| Game vs renderer split | [docs/gzrender-v2/game-engine-vs-renderer.md](../../gzrender-v2/game-engine-vs-renderer.md) |
| View probe grid | [docs/gzrender-v2/view-probe-grid.md](../../gzrender-v2/view-probe-grid.md) |
| Four-step plan | [docs/gzrender-v2/four-step-plan.md](../../gzrender-v2/four-step-plan.md) |
| gzdoom-s-wasm charter | [docs/gzrender-v2/gzdoom-s-wasm.md](../../gzrender-v2/gzdoom-s-wasm.md) |

---

## Cursor rules (invariants)

| Rule | Path |
|------|------|
| WASM renderer invariants | [`.cursor/rules/wasm-renderer-invariants.mdc`](../../../.cursor/rules/wasm-renderer-invariants.mdc) |
| coinSearch workspace scope | `.cursor/rules/workspace-scope.mdc` in coinSearch (points to doom-wad-lab for game work) |

---

## Classic Doom / id specs

| Resource | Notes |
|----------|-------|
| Doom Bible (Fabien Sanglard) | https://fabiensanglard.net/doomIphone/doom.php — classic renderer background |
| id BSP paper | Original subsector/BSP visibility algorithm |
| Unofficial Doom specs | https://www.gamers.org/dhshelp/docs/ — lump layout reference |

HW renderer replaces software column drawer but preserves BSP visibility ordering concept ([04-bsp-traversal.md](./04-bsp-traversal.md)).

---

## WebAssembly / Emscripten

| Resource | URL |
|----------|-----|
| Emscripten documentation | https://emscripten.org/docs/ |
| WebGL2 spec | https://registry.khronos.org/webgl/specs/latest/2.0/ |
| WASM core spec | https://webassembly.github.io/spec/core/ |

Gold uses Emscripten as linker only — see [12-gles-webgl2-wasm-path.md](./12-gles-webgl2-wasm-path.md).

---

## Tools and libraries

| Tool | Use in doom-wad-lab |
|------|---------------------|
| Puppeteer | Headless WASM frame capture |
| `pngjs` / custom diff | Playfield pixel comparison |
| ninja + cmake | Native and WASM builds |
| gh / git | CI and PR workflow |

---

## Bible internal cross-links

Full table of contents: [README.md](./README.md)

| Topic | Chapter |
|-------|---------|
| 68-map gate | [00](./00-gold-standard-overview.md), [15](./15-wasm-host-and-corpus-gates.md) |
| BSP | [04](./04-bsp-traversal.md) |
| GZSTATE | [14](./14-gzstate-dump-parity.md) |
| Code lookup | [appendix-code-index.md](./appendix-code-index.md) |

---

## Version note

This bible documents the **gzrender-v2 gold-standard** pipeline as of the fork state in `gzdoom-project` paired with `doom-wad-lab`. When GZSTATE version or WASM exports change, update [14-gzstate-dump-parity.md](./14-gzstate-dump-parity.md) and [gzstate-v1.md](../../gzrender-v2/gzstate-v1.md) together.
