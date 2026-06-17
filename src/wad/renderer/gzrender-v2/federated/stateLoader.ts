import {
  exportToGzstate,
  writeGzstate,
  type GzstateDocument,
} from '@hypercrab2000/doom-wad-core';
import type { Wad } from '@/wad/interfaces/Wad';

export interface LoadedGzstate {
  doc: GzstateDocument;
  bytes: Uint8Array;
}

/** Federated state module — builds GZSTATE from parsed WAD (Node parity export). */
export function loadGzstateFromWad(wad: Wad, mapName: string): LoadedGzstate {
  const doc = exportToGzstate(wad as Parameters<typeof exportToGzstate>[0], mapName);
  const bytes = new Uint8Array(writeGzstate(doc));
  return { doc, bytes };
}
