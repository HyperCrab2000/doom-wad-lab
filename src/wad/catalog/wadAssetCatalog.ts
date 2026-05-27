import { createSpriteIndex } from '@/parser/wad/createSpriteFrame';
import { getMusicLumpCandidatesForMap } from '@/features/level-viewer/music/doomMusic';
import { decodeDoomSound } from '@/features/level-viewer/sfx/doomSfxPlayer';
import type { Wad } from '@/wad/interfaces/Wad';
import { categorizeWadLumpName, type WadLumpCategory } from './categorizeLump';
import { classifyDoomSoundLump } from './doomSoundRegistry';
import { isMostlyPrintableText, parseDmusinfo, parseDoomTextScreens } from './parseDoomText';
import { getAllIndexedThingTypes, summarizeMapThings } from './thingTypeIndex';

export interface LumpInventoryEntry {
  name: string;
  category: WadLumpCategory;
  byteLength: number;
}

export interface SoundInventoryEntry {
  name: string;
  category: ReturnType<typeof classifyDoomSoundLump>;
  byteLength: number;
  sampleRate: number | null;
  decodable: boolean;
}

export interface MusicInventoryEntry {
  name: string;
  byteLength: number;
  isMus: boolean;
}

export interface SpriteInventoryEntry {
  sprite: string;
  frameCount: number;
  lumpNames: string[];
}

export interface StoryTextEntry {
  lumpName: string;
  screenCount: number;
  preview: string;
}

export interface MapContentSummary {
  mapName: string;
  thingTypes: ReturnType<typeof summarizeMapThings>;
  musicCandidates: string[];
  musicLumpPresent: string | null;
}

export interface WadAssetCatalog {
  wadId: string;
  lumpCount: number;
  byCategory: Record<WadLumpCategory, number>;
  maps: MapContentSummary[];
  sounds: SoundInventoryEntry[];
  music: MusicInventoryEntry[];
  sprites: SpriteInventoryEntry[];
  flats: string[];
  textures: string[];
  storyTexts: StoryTextEntry[];
  dmusinfo: Array<{ mapName: string; musicLump: string }>;
  demos: string[];
  thingTypeCatalogSize: number;
  lineSpecialImplementedCount: number | null;
}

export function buildWadAssetCatalog(wad: Wad): WadAssetCatalog {
  const lumpNames = Object.keys(wad.lumpHash).sort();
  const byCategory = emptyCategoryCounts();
  const lumps: LumpInventoryEntry[] = [];

  for (const name of lumpNames) {
    const data = wad.lumpHash[name];
    const category = categorizeWadLumpName(name);
    byCategory[category] += 1;
    lumps.push({ name, category, byteLength: data?.byteLength ?? 0 });
  }

  const sounds = buildSoundInventory(wad, lumpNames);
  const music = buildMusicInventory(wad, lumpNames);
  const sprites = buildSpriteInventory(wad);
  const storyTexts = buildStoryInventory(wad, lumpNames);
  const dmusinfo = wad.lumpHash.DMUSINFO
    ? parseDmusinfo(wad.lumpHash.DMUSINFO as ArrayBuffer)
    : [];

  const maps = Object.keys(wad.maps)
    .sort()
    .map((mapName) => {
      const map = wad.maps[mapName];
      const candidates = getMusicLumpCandidatesForMap(mapName);
      const present = candidates.find((c) => wad.lumpHash[c]) ?? null;
      return {
        mapName,
        thingTypes: summarizeMapThings(map.THINGS ?? []),
        musicCandidates: candidates,
        musicLumpPresent: present,
      };
    });

  return {
    wadId: wad.indentification,
    lumpCount: lumpNames.length,
    byCategory,
    maps,
    sounds,
    music,
    sprites,
    flats: Object.keys(wad.flats).sort(),
    textures: Object.keys(wad.textures).sort(),
    storyTexts,
    dmusinfo,
    demos: lumpNames.filter((n) => /^DEMO\d$/i.test(n)),
    thingTypeCatalogSize: getAllIndexedThingTypes().length,
    lineSpecialImplementedCount: null,
  };
}

function emptyCategoryCounts(): Record<WadLumpCategory, number> {
  return {
    map: 0,
    music: 0,
    sound: 0,
    sprite: 0,
    flat: 0,
    patch: 0,
    textureMeta: 0,
    palette: 0,
    colormap: 0,
    storyText: 0,
    menuText: 0,
    intermission: 0,
    demo: 0,
    midiMeta: 0,
    marker: 0,
    unknown: 0,
  };
}

function buildSoundInventory(wad: Wad, lumpNames: string[]): SoundInventoryEntry[] {
  return lumpNames
    .filter((name) => categorizeWadLumpName(name) === 'sound')
    .map((name) => {
      const data = wad.lumpHash[name] as ArrayBuffer;
      const decoded = decodeDoomSound(data);
      return {
        name: name.toUpperCase(),
        category: classifyDoomSoundLump(name),
        byteLength: data.byteLength,
        sampleRate: decoded?.sampleRate ?? null,
        decodable: decoded !== null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildMusicInventory(wad: Wad, lumpNames: string[]): MusicInventoryEntry[] {
  return lumpNames
    .filter((name) => categorizeWadLumpName(name) === 'music')
    .map((name) => {
      const data = wad.lumpHash[name] as ArrayBuffer;
      const header =
        data.byteLength >= 4 ? new TextDecoder('latin1').decode(data.slice(0, 4)) : '';
      return {
        name: name.toUpperCase(),
        byteLength: data.byteLength,
        isMus: header === 'MUS\x1a',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSpriteInventory(wad: Wad): SpriteInventoryEntry[] {
  const lumpNames = Object.keys(wad.sprites);
  const index = createSpriteIndex(lumpNames);
  return Object.entries(index)
    .map(([sprite, frames]) => {
      const lumpSet = new Set<string>();
      for (const frameDirs of Object.values(frames)) {
        for (const lump of Object.values(frameDirs)) {
          lumpSet.add(lump);
        }
      }
      return {
        sprite,
        frameCount: Object.keys(frames).length,
        lumpNames: [...lumpSet].sort(),
      };
    })
    .sort((a, b) => a.sprite.localeCompare(b.sprite));
}

function buildStoryInventory(wad: Wad, lumpNames: string[]): StoryTextEntry[] {
  const entries: StoryTextEntry[] = [];
  for (const name of lumpNames) {
    if (categorizeWadLumpName(name) !== 'storyText') continue;
    const data = wad.lumpHash[name] as ArrayBuffer;
    const screens = parseDoomTextScreens(data);
    const first = screens[0] ?? '';
    if (!isMostlyPrintableText(first)) continue;
    const preview = first.replace(/\s+/g, ' ').slice(0, 120);
    entries.push({
      lumpName: name.toUpperCase(),
      screenCount: screens.length,
      preview,
    });
  }
  return entries.sort((a, b) => a.lumpName.localeCompare(b.lumpName));
}

export function formatCatalogSummary(catalog: WadAssetCatalog): string {
  const lines: string[] = [
    `WAD ${catalog.wadId} — ${catalog.lumpCount} lumps`,
    `Maps: ${catalog.maps.length} | Sounds: ${catalog.sounds.length} | Music: ${catalog.music.length} | Sprites: ${catalog.sprites.length}`,
    `Flats: ${catalog.flats.length} | Textures: ${catalog.textures.length} | Thing defs: ${catalog.thingTypeCatalogSize}`,
  ];

  if (catalog.storyTexts.length > 0) {
    lines.push(
      `Story lumps: ${catalog.storyTexts.map((s) => `${s.lumpName}(${s.screenCount})`).join(', ')}`
    );
  }

  const undecodable = catalog.sounds.filter((s) => !s.decodable).length;
  if (undecodable > 0) {
    lines.push(`Sounds not decodable: ${undecodable}`);
  }

  return lines.join('\n');
}
