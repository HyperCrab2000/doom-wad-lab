import {
  exportToGzstate,
  readGzstate,
  writeGzstate,
  type GzstateDocument,
} from '@hypercrab2000/doom-wad-core';
import type { Wad } from '@/wad/interfaces/Wad';

export interface LoadedGzstate {
  doc: GzstateDocument;
  bytes: Uint8Array;
}

/** Federated state module — builds GZSTATE from parsed WAD or raw wire bytes. */
export function loadGzstateFromWad(wad: Wad, mapName: string): LoadedGzstate {
  const doc = exportToGzstate(wad as Parameters<typeof exportToGzstate>[0], mapName);
  return loadGzstateFromDocument(doc);
}

export function loadGzstateFromDocument(doc: GzstateDocument): LoadedGzstate {
  const bytes = new Uint8Array(writeGzstate(doc));
  return { doc, bytes };
}

export function loadGzstateFromBytes(bytes: Uint8Array): LoadedGzstate {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const doc = readGzstate(buffer as ArrayBuffer);
  return { doc, bytes: new Uint8Array(buffer) };
}
