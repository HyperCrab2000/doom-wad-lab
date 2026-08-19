import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { skyFlats } from '@/wad/constants/WadInfo';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';

export interface MapAssetNames {
  wallTextures: Set<string>;
  flats: Set<string>;
  spriteLumps: Set<string>;
  patchLumps: Set<string>;
}

const LOADING_UI_PATCHES = [
  'TITLEPIC',
  'M_LOADG',
  'M_DOOM',
  'M_PAUSE',
  'M_OPTTTL',
  'M_NGAME',
  'M_NEWG',
  'M_OPTION',
  'M_SAVEG',
  'M_QUITG',
  'M_ENDGAM',
  'M_SKULL1',
  'M_SKULL2',
  ...Array.from({ length: 95 - 33 + 1 }, (_, i) => `STCFN0${(33 + i).toString().padStart(2, '0')}`),
];

const PLAYER_WEAPON_SPRITES = ['PISGA0'];

function addAnimated(names: Set<string>, animated: Record<string, string[]>): void {
  for (const group of Object.values(animated)) {
    for (const name of group) {
      names.add(name);
    }
  }
}

function patchesForTexture(wad: Wad, texName: string, patchLumps: Set<string>): void {
  const texture = wad.textures[texName];
  if (!texture) return;
  for (const patch of texture.patches) {
    const patchName = wad.pnames[patch.patchIndex];
    if (patchName) {
      patchLumps.add(patchName);
    }
  }
}

function addWallTexture(names: Set<string>, patchLumps: Set<string>, wad: Wad, texName: string | undefined): void {
  if (!texName || texName === '-') return;
  names.add(texName);
  patchesForTexture(wad, texName, patchLumps);
}

/** SW1/SW2 and DB1/DB2 pairs — switches flip at runtime; both variants must be uploaded. */
function addSwitchTexturePairs(
  wallTextures: Set<string>,
  patchLumps: Set<string>,
  wad: Wad
): void {
  const seed = [...wallTextures];
  for (const name of seed) {
    const upper = name.toUpperCase();
    let pair: string | null = null;
    if (upper.startsWith('SW1')) pair = `SW2${name.slice(3)}`;
    else if (upper.startsWith('SW2')) pair = `SW1${name.slice(3)}`;
    else if (upper.startsWith('DB1')) pair = `DB2${name.slice(3)}`;
    else if (upper.startsWith('DB2')) pair = `DB1${name.slice(3)}`;
    if (!pair) continue;
    if (wad.textures[pair] || wad.textures[pair.toUpperCase()]) {
      addWallTexture(wallTextures, patchLumps, wad, pair);
    }
  }
}

export function collectMapAssetNames(wad: Wad, map: WadMap, mapName: string): MapAssetNames {
  const wallTextures = new Set<string>();
  const flats = new Set<string>();
  const spriteLumps = new Set<string>();
  const patchLumps = new Set<string>(LOADING_UI_PATCHES);

  for (const sector of map.SECTORS) {
    if (sector.floorpic) flats.add(sector.floorpic);
    if (sector.ceilingpic) flats.add(sector.ceilingpic);
  }

  for (const side of map.SIDEDEFS) {
    addWallTexture(wallTextures, patchLumps, wad, side.topTexture);
    addWallTexture(wallTextures, patchLumps, wad, side.bottomTexture);
    addWallTexture(wallTextures, patchLumps, wad, side.midTexture);
  }

  addSwitchTexturePairs(wallTextures, patchLumps, wad);

  for (const thing of map.THINGS) {
    const thingType = DOOM_THING_MAP_BY_ID[thing.type];
    if (!thingType?.sprite) continue;
    const prefix = thingType.sprite;
    for (const lumpName of Object.keys(wad.sprites)) {
      if (lumpName.startsWith(prefix)) {
        spriteLumps.add(lumpName);
      }
    }
  }

  for (const spriteName of PLAYER_WEAPON_SPRITES) {
    if (wad.sprites[spriteName]) spriteLumps.add(spriteName);
  }

  addAnimated(wallTextures, wad.animatedTextures);
  addAnimated(flats, wad.animatedFlats);

  ['SKY1', 'SKY2', 'SKY3', 'SKY4'].forEach((sky) => {
    if (wad.textures[sky]) {
      wallTextures.add(sky);
      patchesForTexture(wad, sky, patchLumps);
    }
  });

  if (mapName.startsWith('E') || mapName.startsWith('MAP')) {
    const skyName = mapName.startsWith('E') ? 'SKY1' : 'SKY2';
    wallTextures.add(skyName);
    patchesForTexture(wad, skyName, patchLumps);
  }

  if (!wallTextures.size && 'BLAKWAL1' in wad.textures) {
    wallTextures.add('BLAKWAL1');
    patchesForTexture(wad, 'BLAKWAL1', patchLumps);
  } else if (!wallTextures.size) {
    const first = Object.keys(wad.textures)[0];
    if (first) {
      wallTextures.add(first);
      patchesForTexture(wad, first, patchLumps);
    }
  }

  for (const texName of wallTextures) {
    patchesForTexture(wad, texName, patchLumps);
  }

  for (const flatName of flats) {
    if (!wad.flats[flatName] && !skyFlats.includes(flatName)) {
      const fallback = Object.keys(wad.flats)[0];
      if (fallback) flats.add(fallback);
    }
  }

  for (const patchName of LOADING_UI_PATCHES) {
    if (wad.lumpHash[patchName] && !wad.pnames.includes(patchName)) {
      patchLumps.add(patchName);
    }
  }

  return { wallTextures, flats, spriteLumps, patchLumps };
}

export function collectMapWallAndFlatNames(wad: Wad, map: WadMap, mapName: string): {
  wallNames: string[];
  flatNames: string[];
} {
  const assets = collectMapAssetNames(wad, map, mapName);
  return {
    wallNames: [...assets.wallTextures],
    flatNames: [...assets.flats].filter((name) => !skyFlats.includes(name)),
  };
}
