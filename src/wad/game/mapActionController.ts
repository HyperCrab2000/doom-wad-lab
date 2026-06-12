import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { DoorSystem, DoorTriggerResult } from './doorSystem';
import { FloorMoverSystem, MoverTriggerResult } from './floorMoverSystem';
import { flipSwitchLineTextures } from './switchTextures';
import { getDoorSpecial } from './lineSpecials';
import { getFloorMoverSpecial } from './floorMoverSpecials';

export type MapActionResult = DoorTriggerResult | MoverTriggerResult;

export class MapActionController {
  readonly doors: DoorSystem;
  readonly floors: FloorMoverSystem;
  private readonly switchedLines = new Set<number>();

  constructor(private readonly map: WadMap) {
    this.doors = new DoorSystem(map);
    this.floors = new FloorMoverSystem(map);
  }

  isDirty(): boolean {
    return this.doors.isDirty() || this.floors.isDirty();
  }

  clearDirty(): void {
    this.doors.clearDirty();
    this.floors.clearDirty();
  }

  getDirtySectors(): ReadonlySet<number> {
    const merged = new Set<number>();
    for (const i of this.doors.getDirtySectors()) merged.add(i);
    for (const i of this.floors.getDirtySectors()) merged.add(i);
    return merged;
  }

  getActiveMoverCount(): number {
    return this.doors.getActiveDoorCount() + this.floors.getActiveMoverCount();
  }

  tryUseLine(lineIndex: number, line: LineDef): MapActionResult {
    if (getDoorSpecial(line.special)) {
      const result = this.doors.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return result;
    }
    if (getFloorMoverSpecial(line.special)) {
      const result = this.floors.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return result;
    }
    return { triggered: false, playSwitch: false, playOpen: false, playClose: false, sound: 'door' };
  }

  tryWalkLine(lineIndex: number, line: LineDef): MapActionResult {
    if (getDoorSpecial(line.special)) {
      return this.doors.tryWalkLine(lineIndex, line);
    }
    if (getFloorMoverSpecial(line.special)) {
      return this.floors.tryWalkLine(lineIndex, line);
    }
    return { triggered: false, playSwitch: false, playOpen: false, playClose: false, sound: 'door' };
  }

  tick(dt: number): {
    playOpen: boolean;
    playClose: boolean;
    playStart: boolean;
    sound: 'door' | 'blaze' | 'lift' | 'mover';
  } {
    const doorMotion = this.doors.tick(dt);
    const floorMotion = this.floors.tick(dt);
    return {
      playOpen: doorMotion.playOpen,
      playClose: doorMotion.playClose,
      playStart: floorMotion.playStart,
      sound: doorMotion.playOpen || doorMotion.playClose ? doorMotion.sound ?? 'door' : floorMotion.sound,
    };
  }

  /** Lines whose switch textures were toggled (for wall refresh). */
  getSwitchedLineIndices(): ReadonlySet<number> {
    return this.switchedLines;
  }

  clearSwitchedLines(): void {
    this.switchedLines.clear();
  }

  private applySwitchFlip(lineIndex: number, line: LineDef): void {
    if (flipSwitchLineTextures(this.map, line)) {
      this.switchedLines.add(lineIndex);
    }
  }
}
