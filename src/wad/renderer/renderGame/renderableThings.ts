import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { Sector } from '@/wad/interfaces/Sector';
import { Thing } from '@/wad/interfaces/Thing';
import { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';

export interface RenderableThing {
  thingObj: Thing;
  thingIndex: number;
  thingType: NonNullable<(typeof DOOM_THING_MAP_BY_ID)[number]>;
  thingSector: Sector;
  sectorIndex: number;
}

export function buildRenderableThings(
  map: WadMap,
  sectorsByThing: Map<Thing, Sector>
): RenderableThing[] {
  const renderable: RenderableThing[] = [];

  map.THINGS.forEach((thingObj, thingIndex) => {
    const thingType = DOOM_THING_MAP_BY_ID[Number(thingObj.type)];
    if (!thingType || !hasValidFlags(thingObj)) return;
    if (!thingType.sprite || !isRenderableThing(thingType)) return;
    const thingSector = sectorsByThing.get(thingObj);
    if (!thingSector) return;

    renderable.push({
      thingObj,
      thingIndex,
      thingType,
      thingSector,
      sectorIndex: map.SECTORS.indexOf(thingSector),
    });
  });

  return renderable;
}

function isRenderableThing(thingType: { kind?: ThingKind; sprite?: string }): boolean {
  if (thingType.kind === ThingKind.Decoration && thingType.sprite === 'PLAY') {
    return false;
  }

  return isRenderableThingKind(thingType.kind);
}

function isRenderableThingKind(kind: ThingKind | undefined): boolean {
  return (
    kind === ThingKind.Artifact ||
    kind === ThingKind.Monster ||
    kind === ThingKind.Boss ||
    kind === ThingKind.Key ||
    kind === ThingKind.Barrel ||
    kind === ThingKind.Decoration ||
    kind === ThingKind.Hazard ||
    kind === ThingKind.Pickup ||
    kind === ThingKind.Weapon ||
    kind === ThingKind.Powerup
  );
}
