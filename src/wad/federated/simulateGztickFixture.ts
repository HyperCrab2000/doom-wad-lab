import type { WadMap } from '@/wad/interfaces/WadMap';
import { MapActionController } from '@/wad/game/mapActionController';
import { exportGztickFromMap } from '@/wad/federated/exportGztickFromMap';
import type { GztickDocument } from '@hypercrab2000/doom-gzengine-core';
import type { GztickScriptFixture } from '@/wad/federated/gztickScript';

const TIC_SECONDS = 1 / 35;

/** Replay a scripted fixture against the TS MapActionController oracle. */
export function simulateGztickFixture(
  map: WadMap,
  mapName: string,
  fixture: GztickScriptFixture,
): GztickDocument {
  const controller = new MapActionController(map);

  for (let tick = 1; tick <= fixture.targetTick; tick++) {
    controller.tick(TIC_SECONDS);
    for (const event of fixture.events) {
      if (event.tick !== tick || event.op !== 'useLine') continue;
      const line = map.LINEDEFS[event.line];
      if (!line) {
        throw new Error(`Fixture references missing line ${event.line}`);
      }
      controller.tryUseLine(event.line, line);
    }
  }

  return exportGztickFromMap(map, mapName, fixture.targetTick);
}
