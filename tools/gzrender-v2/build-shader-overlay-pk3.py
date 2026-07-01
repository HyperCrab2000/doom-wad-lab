#!/usr/bin/env python3
"""Build gzdoom-wasm-shaders.pk3 — deflate copies of bzip2 shader lumps for browser WASM.

Shader lumps under shaders/ and shaders_gles/ are bzip2-compressed in gzdoom.pk3.
This overlay replaces them with deflate copies. ZScript lumps must stay in the base
pk3 (GZDoom rejects non-core zscript overrides); those rely on DecompressorBZ2 fix.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

PREFIXES = ("shaders/", "shaders_gles/")
BZIP2 = 12


def build_overlay(src_pk3: Path, out_pk3: Path) -> int:
    count = 0
    with zipfile.ZipFile(src_pk3, "r") as zin, zipfile.ZipFile(
        out_pk3, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            if info.compress_type != BZIP2:
                continue
            if not info.filename.startswith(PREFIXES):
                continue
            data = zin.read(info.filename)
            zi = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            zi.external_attr = info.external_attr
            zout.writestr(zi, data, compress_type=zipfile.ZIP_DEFLATED)
            count += 1
    return count


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {Path(argv[0]).name} <source.pk3> <overlay.pk3>", file=sys.stderr)
        return 2
    src = Path(argv[1]).resolve()
    out = Path(argv[2]).resolve()
    if not src.is_file():
        print(f"missing source pk3: {src}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    n = build_overlay(src, out)
    print(f"{out.name}: {n} shader bzip2→deflate lumps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
