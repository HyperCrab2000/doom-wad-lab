import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  buildPotentiallyVisibleSectors,
  type SectorVisibilityIndex,
} from '@/wad/renderer/utils/sectorVisibility';

/** Rebuild portal visibility when the camera moves farther than this (map units). */
const MOVE_REBUILD_DISTANCE = 96;

/**
 * Reuses portal flood-fill results across frames when the camera stays in the same sector
 * and has not moved much — large win on outdoor maps.
 */
export class VisibleSectorCache {
  private cached: Set<number> | null = null;
  private lastSectorIndex = -1;
  private lastX = 0;
  private lastY = 0;

  invalidate(): void {
    this.cached = null;
    this.lastSectorIndex = -1;
  }

  getVisibleSectors(
    index: SectorVisibilityIndex,
    map: WadMap,
    cameraX: number,
    cameraY: number,
    cameraSectorIndex: number
  ): Set<number> {
    if (cameraSectorIndex < 0) {
      this.cached = new Set<number>();
      return this.cached;
    }

    if (this.cached && cameraSectorIndex === this.lastSectorIndex) {
      const dx = cameraX - this.lastX;
      const dy = cameraY - this.lastY;
      if (dx * dx + dy * dy <= MOVE_REBUILD_DISTANCE * MOVE_REBUILD_DISTANCE) {
        return this.cached;
      }
    }

    this.cached = buildPotentiallyVisibleSectors(
      index,
      map,
      cameraX,
      cameraY,
      cameraSectorIndex
    );
    this.lastSectorIndex = cameraSectorIndex;
    this.lastX = cameraX;
    this.lastY = cameraY;
    return this.cached;
  }
}
