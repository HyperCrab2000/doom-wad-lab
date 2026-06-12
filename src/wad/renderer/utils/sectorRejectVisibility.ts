import { playerEyeHeight } from '@/wad/constants/GameInfo';
import type { WadMap } from '@/wad/interfaces/WadMap';

/** Minimum vertical opening (map units) to treat a two-sided line as a sight portal. */
export const SIGHT_LINE_OPENING_MIN = playerEyeHeight;

export function getRejectTable(map: WadMap): Uint8Array | null {
  const raw = map.REJECT as ArrayBuffer | Uint8Array | undefined;
  if (!raw) return null;

  const bytes =
    raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : null;
  if (!bytes?.length) return null;

  const numSectors = map.SECTORS.length;
  const rowLen = (numSectors + 7) >> 3;
  if (bytes.length < numSectors * rowLen) return null;

  return bytes;
}

/** REJECT bit set means the sectors cannot see each other. */
export function sectorsPotentiallyVisible(
  reject: Uint8Array,
  numSectors: number,
  fromSector: number,
  toSector: number
): boolean {
  if (fromSector === toSector) return true;
  if (fromSector < 0 || toSector < 0 || fromSector >= numSectors || toSector >= numSectors) {
    return false;
  }

  const rowLen = (numSectors + 7) >> 3;
  const byteIndex = fromSector * rowLen + (toSector >> 3);
  const bit = 1 << (toSector & 7);
  return (reject[byteIndex]! & bit) === 0;
}

/** Vanilla potential visibility from the REJECT lump (when present). */
export function buildRejectVisibleSectors(
  map: WadMap,
  cameraSectorIndex: number
): Set<number> | null {
  const reject = getRejectTable(map);
  if (!reject) return null;

  const numSectors = map.SECTORS.length;
  if (cameraSectorIndex < 0) return new Set();

  const visible = new Set<number>();
  for (let sectorIndex = 0; sectorIndex < numSectors; sectorIndex++) {
    if (sectorsPotentiallyVisible(reject, numSectors, cameraSectorIndex, sectorIndex)) {
      visible.add(sectorIndex);
    }
  }
  return visible;
}

/** Portal flood-fill intersected with REJECT when both are available. */
export function intersectVisibleSectorSets(
  primary: Set<number> | null,
  reject: Set<number> | null,
  cameraSectorIndex: number
): Set<number> | null {
  if (reject && primary && primary.size > 0) {
    const combined = new Set<number>();
    for (const sectorIndex of primary) {
      if (reject.has(sectorIndex)) combined.add(sectorIndex);
    }
    if (combined.size === 0 && cameraSectorIndex >= 0) {
      combined.add(cameraSectorIndex);
    }
    return combined;
  }
  if (reject) return reject;
  if (primary && primary.size > 0) return primary;
  if (cameraSectorIndex >= 0) return new Set([cameraSectorIndex]);
  return null;
}
