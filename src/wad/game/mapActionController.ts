import { LineDef } from '@/wad/interfaces/LineDef';
import { WadMap } from '@/wad/interfaces/WadMap';
import { CrusherSystem } from './crusherSystem';
import { DonutSystem } from './donutSystem';
import { DoorSystem } from './doorSystem';
import type { PlayerKeyState } from './doorKeys';
import { ExitSystem } from './exitSystem';
import { FloorMoverSystem } from './floorMoverSystem';
import { LightSystem } from './lightSystem';
import { MovingFloorSystem } from './movingFloorSystem';
import { ScrollSystem } from './scrollSystem';
import { SectorLightingThinkerSystem } from './sectorLightingThinkers';
import { SectorSpecialSystem } from './sectorSpecialSystem';
import { flipSwitchLineTextures, lineHasSwitchTexture } from './switchTextures';
import { isUseKeyWalkSpecial } from './lineSpecialActivation';
import { getCrusherSpecial } from './crusherSpecials';
import { getDonutSpecial } from './donutSpecials';
import { getDoorSpecial } from './lineSpecials';
import { getExitSpecial } from './exitSpecials';
import { getFloorMoverSpecial } from './floorMoverSpecials';
import { getLightSpecial } from './lightSpecials';
import { getMovingFloorSpecial } from './movingFloorSpecials';
import { getStairSpecial } from './stairSpecials';
import { getTeleportSpecial } from './teleportSpecials';
import { StairSystem } from './stairSystem';
import { TeleportSystem } from './teleportSystem';
import { EMPTY_MAP_ACTION, MapActionResult } from './mapActionTypes';

export type { MapActionResult } from './mapActionTypes';

export interface MapActionControllerOptions {
  getKeys?: () => PlayerKeyState | null;
}

export class MapActionController {
  readonly doors: DoorSystem;
  readonly floors: FloorMoverSystem;
  readonly teleports: TeleportSystem;
  readonly crushers: CrusherSystem;
  readonly exits: ExitSystem;
  readonly lights: LightSystem;
  readonly stairs: StairSystem;
  readonly donuts: DonutSystem;
  readonly movingFloors: MovingFloorSystem;
  readonly scrolls: ScrollSystem;
  readonly sectorSpecials: SectorSpecialSystem;
  readonly sectorLightingThinkers: SectorLightingThinkerSystem;
  private readonly switchedLines = new Set<number>();

  constructor(
    private readonly map: WadMap,
    options: MapActionControllerOptions = {}
  ) {
    this.crushers = new CrusherSystem(map);
    this.floors = new FloorMoverSystem(map, this.crushers);
    this.doors = new DoorSystem(map, options.getKeys ?? (() => null));
    this.teleports = new TeleportSystem(map);
    this.exits = new ExitSystem();
    this.lights = new LightSystem(map);
    this.stairs = new StairSystem(map, this.floors, this.crushers);
    this.donuts = new DonutSystem(map, this.floors);
    this.movingFloors = new MovingFloorSystem(map);
    this.scrolls = new ScrollSystem(map);
    this.sectorSpecials = new SectorSpecialSystem(map);
    this.sectorLightingThinkers = new SectorLightingThinkerSystem(map);
  }

  isDirty(): boolean {
    return (
      this.doors.isDirty() ||
      this.floors.isDirty() ||
      this.crushers.isDirty() ||
      this.lights.isDirty() ||
      this.movingFloors.isDirty() ||
      this.scrolls.isDirty() ||
      this.sectorSpecials.isDirty() ||
      this.sectorLightingThinkers.isDirty()
    );
  }

  clearDirty(): void {
    this.doors.clearDirty();
    this.floors.clearDirty();
    this.crushers.clearDirty();
    this.lights.clearDirty();
    this.movingFloors.clearDirty();
    this.scrolls.clearDirty();
    this.sectorSpecials.clearDirty();
    this.sectorLightingThinkers.clearDirty();
  }

  getDirtySectors(): ReadonlySet<number> {
    const merged = new Set<number>();
    for (const i of this.doors.getDirtySectors()) merged.add(i);
    for (const i of this.floors.getDirtySectors()) merged.add(i);
    for (const i of this.crushers.getDirtySectors()) merged.add(i);
    for (const i of this.lights.getDirtySectors()) merged.add(i);
    for (const i of this.movingFloors.getDirtySectors()) merged.add(i);
    for (const i of this.sectorSpecials.getDirtySectors()) merged.add(i);
    for (const i of this.sectorLightingThinkers.getDirtySectors()) merged.add(i);
    return merged;
  }

  getActiveMoverCount(): number {
    return (
      this.doors.getActiveDoorCount() +
      this.floors.getActiveMoverCount() +
      this.crushers.getActiveCrusherCount() +
      this.movingFloors.getActiveCount()
    );
  }

  /** Sectors with in-flight door/lift/crusher motion — geometry must refresh even if dirty was cleared. */
  getActiveMoverSectors(): ReadonlySet<number> {
    const merged = new Set<number>();
    for (const i of this.doors.getActiveSectorIndices()) merged.add(i);
    for (const i of this.floors.getActiveSectorIndices()) merged.add(i);
    for (const i of this.crushers.getActiveSectorIndices()) merged.add(i);
    for (const i of this.movingFloors.getActiveSectorIndices()) merged.add(i);
    return merged;
  }

  isExitRequested(): boolean {
    return this.exits.isExitRequested();
  }

  tryUseLine(lineIndex: number, line: LineDef): MapActionResult {
    if (getExitSpecial(line.special)) {
      const result = this.exits.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        requestExit: result.requestExit,
      };
    }
    if (getDonutSpecial(line.special)) {
      const result = this.donuts.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'mover',
      };
    }
    if (getStairSpecial(line.special)) {
      const result = this.stairs.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'mover',
      };
    }
    if (getLightSpecial(line.special)) {
      const result = this.lights.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return { triggered: result.triggered, playSwitch: result.playSwitch };
    }
    if (getCrusherSpecial(line.special)) {
      const result = this.crushers.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'mover',
      };
    }
    if (getDoorSpecial(line.special)) {
      const result = this.doors.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return { ...result, playTeleport: false };
    }
    if (getFloorMoverSpecial(line.special)) {
      const result = this.floors.tryUseLine(lineIndex, line);
      if (result.triggered) this.applySwitchFlip(lineIndex, line);
      return { ...result, playOpen: false, playClose: false, playTeleport: false };
    }
    return { ...EMPTY_MAP_ACTION };
  }

  tryWalkLine(lineIndex: number, line: LineDef, isPlayer = true): MapActionResult {
    if (getExitSpecial(line.special)) {
      const result = this.exits.tryWalkLine(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        requestExit: result.requestExit,
      };
    }
    if (getStairSpecial(line.special)) {
      const result = this.stairs.tryWalkLine(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'mover',
      };
    }
    if (getLightSpecial(line.special)) {
      const result = this.lights.tryWalkLine(lineIndex, line);
      return { triggered: result.triggered, playSwitch: result.playSwitch };
    }
    if (getCrusherSpecial(line.special)) {
      const result = this.crushers.tryWalkLine(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'mover',
      };
    }
    if (getMovingFloorSpecial(line.special)) {
      const result = this.movingFloors.tryWalkLine(lineIndex, line);
      return {
        triggered: result.triggered,
        playSwitch: result.playSwitch,
        playStart: result.playStart,
        sound: 'lift',
      };
    }
    if (getTeleportSpecial(line.special)) {
      const teleport = this.teleports.tryWalkLine(lineIndex, line, isPlayer);
      if (teleport.triggered) {
        return {
          triggered: true,
          playTeleport: true,
          teleport: teleport.destination,
          sound: 'door',
        };
      }
      return { ...EMPTY_MAP_ACTION };
    }
    if (getDoorSpecial(line.special)) {
      const result = this.doors.tryWalkLine(lineIndex, line);
      return { ...result, playTeleport: false };
    }
    if (getFloorMoverSpecial(line.special)) {
      const result = this.floors.tryWalkLine(lineIndex, line);
      if (result.triggered && isUseKeyWalkSpecial(line.special) && lineHasSwitchTexture(this.map, line)) {
        this.applySwitchFlip(lineIndex, line);
      }
      return { ...result, playOpen: false, playClose: false, playTeleport: false };
    }
    return { ...EMPTY_MAP_ACTION };
  }

  tick(dt: number): {
    playOpen: boolean;
    playClose: boolean;
    playStart: boolean;
    sound: 'door' | 'blaze' | 'lift' | 'mover';
  } {
    this.scrolls.tick(dt);
    this.sectorLightingThinkers.tick(dt);
    this.sectorSpecials.tick(dt);
    const movingFloorMotion = this.movingFloors.tick(dt);
    const doorMotion = this.doors.tick(dt);
    const floorMotion = this.floors.tick(dt);
    const crusherMotion = this.crushers.tick(dt);
    const playStart = floorMotion.playStart || crusherMotion.playStart || movingFloorMotion.playStart;
    return {
      playOpen: doorMotion.playOpen,
      playClose: doorMotion.playClose,
      playStart,
      sound:
        doorMotion.playOpen || doorMotion.playClose
          ? doorMotion.sound ?? 'door'
          : playStart
            ? 'mover'
            : floorMotion.sound,
    };
  }

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
