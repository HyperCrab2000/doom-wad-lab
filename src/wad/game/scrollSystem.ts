import type { WadMap } from '@/wad/interfaces/WadMap';
import { isScrollWallSpecial } from './scrollSpecials';

/** Doom special 48 — continuous left-scrolling wall texture. */
const SCROLL_SPEED = 35;

export class ScrollSystem {
  private readonly scrollingSideIndices: number[] = [];
  private dirty = false;
  private readonly dirtySideIndices = new Set<number>();

  constructor(private readonly map: WadMap) {
    for (let lineIndex = 0; lineIndex < map.LINEDEFS.length; lineIndex++) {
      const line = map.LINEDEFS[lineIndex];
      if (!isScrollWallSpecial(line.special)) continue;
      for (const sideIndex of line.sidenum) {
        if (sideIndex >= 0) {
          this.scrollingSideIndices.push(sideIndex);
        }
      }
    }
  }

  getScrollingSideCount(): number {
    return this.scrollingSideIndices.length;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
    this.dirtySideIndices.clear();
  }

  getDirtySides(): ReadonlySet<number> {
    return this.dirtySideIndices;
  }

  tick(dt: number): void {
    if (this.scrollingSideIndices.length === 0) return;
    const delta = SCROLL_SPEED * dt;
    for (const sideIndex of this.scrollingSideIndices) {
      const side = this.map.SIDEDEFS[sideIndex];
      if (!side) continue;
      side.xOffset = (side.xOffset + delta) % 256;
      this.dirty = true;
      this.dirtySideIndices.add(sideIndex);
    }
  }
}
