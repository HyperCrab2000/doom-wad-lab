import { encodeClassicThingFlags } from '@hypercrab2000/doom-wad-core';
import type { GztickDocument } from '@hypercrab2000/doom-gzengine-core';
import type { WadMap } from '@/wad/interfaces/WadMap';

function toUint16(value: number): number {
  return value & 0xffff;
}

/** Build a t=N GZTICK snapshot from the TS map sim state (oracle for doom-gzengine-core). */
export function exportGztickFromMap(
  map: WadMap,
  mapName: string,
  tickNumber = 0,
): GztickDocument {
  return {
    header: {
      magic: 0x4b545a47,
      version: 0,
      tickNumber,
      mapName,
      engineTag: 'GZENGINE',
      flags: 0,
    },
    strings: [mapName, ''],
    sectorDynamics: map.SECTORS.map((sector, sectorIndex) => ({
      sectorIndex,
      floorHeight: sector.floorheight,
      ceilingHeight: sector.ceilingheight,
      lightLevel: sector.lightlevel,
      special: toUint16(sector.type),
      tag: sector.tag,
    })),
    things: map.THINGS.map((thing, thingId) => ({
      thingId,
      thingType: thing.type,
      x: thing.x,
      y: thing.y,
      z: 0,
      angle: thing.angle,
      health: 0,
      stateName: '',
      frame: 0,
      flags: encodeClassicThingFlags(thing.flags),
    })),
    eventLog: [],
  };
}
