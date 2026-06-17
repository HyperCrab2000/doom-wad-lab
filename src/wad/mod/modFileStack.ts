import fs from 'node:fs';
import path from 'node:path';

import {
  assertFullParity,
  exportToGzstate,
  loadWadStackFromArrayBuffers,
  readGzstateFile,
} from '@hypercrab2000/doom-wad-core';

/** GZDoom `-file` load order: IWAD first, then each patch in array order. */
export interface ModFileStack {
  /** Stable id for corpus folders and tests. */
  id: string;
  /** Absolute or repo-relative IWAD path. */
  iwad: string;
  /** PWAD/WAD patches applied after IWAD (PK3 → WAD conversion not yet supported here). */
  files: string[];
  /** Maps to parity-check in this stack. */
  maps: string[];
  /** Extra GZDoom CLI tokens after `-file` args (cvars, mod toggles). */
  gzdoomArgs?: string[];
  /** Human-readable note for docs / skip reasons. */
  description?: string;
}

export function resolveModPath(cwd: string, p: string): string {
  return path.isAbsolute(p) ? p : path.join(cwd, p);
}

export function loadWadFromModStack(cwd: string, stack: ModFileStack) {
  const iwadPath = resolveModPath(cwd, stack.iwad);
  if (!fs.existsSync(iwadPath)) {
    throw new Error(`IWAD missing: ${iwadPath}`);
  }
  const buffers: ArrayBuffer[] = [readArrayBuffer(iwadPath)];
  for (const file of stack.files) {
    const patchPath = resolveModPath(cwd, file);
    if (!fs.existsSync(patchPath)) {
      throw new Error(`Patch file missing: ${patchPath}`);
    }
    buffers.push(readArrayBuffer(patchPath));
  }
  return loadWadStackFromArrayBuffers(buffers);
}

export function modStackFilesPresent(cwd: string, stack: ModFileStack): boolean {
  if (!fs.existsSync(resolveModPath(cwd, stack.iwad))) return false;
  for (const file of stack.files) {
    if (!fs.existsSync(resolveModPath(cwd, file))) return false;
  }
  return true;
}

export function compareModStackMapToGzdoom(
  cwd: string,
  stack: ModFileStack,
  map: string,
  gzdoomGzstatePath: string,
): void {
  const wad = loadWadFromModStack(cwd, stack);
  const nodeDoc = exportToGzstate(wad, map);
  const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomGzstatePath)));
  assertFullParity(nodeDoc, gzdoomDoc);
}

function readArrayBuffer(filePath: string): ArrayBuffer {
  const raw = fs.readFileSync(filePath);
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}
