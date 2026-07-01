# Risk Register

| Risk | Impact | Likelihood | Mitigation | Status |
|---|---:|---:|---|---|
| GZDoom renderer depends on more engine globals than expected | High | High | Start with full native link; strip only after import render parity | Open |
| GZSTATE becomes too tied to one backend | High | Medium | Keep GZSTATE backend-neutral; document ADRs | Open |
| Node parser is raw-lump-correct but not post-load-correct | High | High | Diff against GZDoom post-load state | Open |
| Texture/flat resolution mismatches | High | High | State diff texture tables and resolved IDs | Open |
| BSP/subsector/seg ownership mismatch | High | Medium | Dump/diff resolved links | Open |
| Transparent/masked walls handled too late | Medium | Medium | Include fixtures and explicit parity class | Open |
| Event timing differs by tick | High | Medium | Scripted input event parity tests | Open |
| WASM/WebGL2 constraints require renderer changes | High | Medium | Native first; backend boundary early | Open |
| API/model limits interrupt progress | Medium | Medium | Use tools, docs, subagent limits | Open |
