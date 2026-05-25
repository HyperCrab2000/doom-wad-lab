import doom1VoxelDef from '../../../voxel_doom/VoxelDoom_v2.4/VOXELDEF.txt?raw';
import doom2VoxelDef from '../../../voxel_doom/VoxelDoom_v2.4/filter/doom.id.doom2/VOXELDEF.txt?raw';
import doom1Monsters from '../../../voxel_doom/VoxelDoom_v2.4/zscript/CheelloVox/CheelloMonstersDoom1.zc?raw';
import doom2Monsters from '../../../voxel_doom/VoxelDoom_v2.4/filter/doom.id.doom2/zscript/CheelloVox/CheelloMonstersDoom2.zc?raw';
import spheres from '../../../voxel_doom/VoxelDoom_v2.4/zscript/CheelloVox/CheelloSpheres.zc?raw';
import megaSphere from '../../../voxel_doom/VoxelDoom_v2.4/filter/doom.id.doom2/zscript/CheelloVox/CheelloMegasphere.zc?raw';
import rocket from '../../../voxel_doom/VoxelDoom_v2.4/zscript/CheelloVox/CheelloRocket.zc?raw';

export interface VoxelCatalogEntry {
  lumpName: string;
  fileName: string;
  sprite: string;
  frame: string;
}

export interface VoxelAnimationSource {
  sprite: string;
  state: string;
  frames: string[];
  source: 'zscript' | 'voxeldef';
}

const voxelEntries = parseVoxelDefs(`${doom1VoxelDef}\n${doom2VoxelDef}`);
const animationSources = parseZScriptAnimations(
  [doom1Monsters, doom2Monsters, spheres, megaSphere, rocket].join('\n')
);

export const VOXEL_CATALOG = voxelEntries.sort((a, b) => a.lumpName.localeCompare(b.lumpName));

export const VOXEL_FRAMES_BY_SPRITE = VOXEL_CATALOG.reduce<Record<string, VoxelCatalogEntry[]>>(
  (acc, entry) => {
    acc[entry.sprite] = acc[entry.sprite] ?? [];
    acc[entry.sprite].push(entry);
    return acc;
  },
  {}
);

for (const entries of Object.values(VOXEL_FRAMES_BY_SPRITE)) {
  entries.sort((a, b) => a.frame.localeCompare(b.frame));
}

export function getVoxelFramesForSprite(sprite: string) {
  return VOXEL_FRAMES_BY_SPRITE[sprite] ?? [];
}

export function getVoxelAnimationForSprite(sprite: string): VoxelAnimationSource {
  const sourceFrames = animationSources[sprite];
  if (sourceFrames) {
    return sourceFrames;
  }

  return {
    sprite,
    state: 'VOXELDEF',
    frames: getVoxelFramesForSprite(sprite).map((entry) => entry.frame),
    source: 'voxeldef',
  };
}

export function getVoxelAnimationEntriesForSprite(sprite: string): VoxelCatalogEntry[] {
  const entriesByFrame = new Map(getVoxelFramesForSprite(sprite).map((entry) => [entry.frame, entry]));
  const animation = getVoxelAnimationForSprite(sprite);
  const entries = animation.frames
    .map((frame) => entriesByFrame.get(frame))
    .filter((entry): entry is VoxelCatalogEntry => Boolean(entry));

  return entries.length > 0 ? entries : getVoxelFramesForSprite(sprite);
}

export function hasVoxelDefinitionForSprite(sprite: string | undefined): boolean {
  return Boolean(sprite && getVoxelFramesForSprite(sprite).length > 0);
}

export function parseVoxelDefs(source: string): VoxelCatalogEntry[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const entries = new Map<string, VoxelCatalogEntry>();
  const linePattern = /^\s*([A-Z0-9_]+)\s*=\s*"([^"]+)"/gm;

  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(withoutBlockComments))) {
    const lumpName = match[1];
    const fileName = match[2];
    const sprite = lumpName.slice(0, 4);
    const frame = lumpName.slice(4);

    if (!sprite || !frame) continue;

    entries.set(lumpName, {
      lumpName,
      fileName,
      sprite,
      frame,
    });
  }

  return [...entries.values()];
}

export function parseZScriptAnimations(source: string): Record<string, VoxelAnimationSource> {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const animations: Record<string, VoxelAnimationSource> = {};
  const candidateStates: Record<string, VoxelAnimationSource[]> = {};
  let currentState = '';

  for (const line of withoutBlockComments.split('\n')) {
    const stateMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*$/);
    if (stateMatch) {
      currentState = stateMatch[1];
      continue;
    }

    const frameMatch = line.match(/^\s*([A-Z0-9]{4})\s+([A-Z\[\]\^]+)\s+(-?\d+)/);
    if (!frameMatch || frameMatch[1] === 'TNT1') {
      continue;
    }

    const sprite = frameMatch[1];
    const frameChars = [...frameMatch[2]];
    const duration = Number(frameMatch[3]);
    if (duration === 0 || currentState === 'SpriteCache') {
      continue;
    }

    candidateStates[sprite] = candidateStates[sprite] ?? [];
    let candidate = candidateStates[sprite].find((entry) => entry.state === currentState);
    if (!candidate) {
      candidate = {
        sprite,
        state: currentState || 'Unknown',
        frames: [],
        source: 'zscript',
      };
      candidateStates[sprite].push(candidate);
    }

    candidate.frames.push(...frameChars);
  }

  for (const [sprite, candidates] of Object.entries(candidateStates)) {
    const preferred =
      candidates.find((candidate) => candidate.state === 'See') ??
      candidates.find((candidate) => candidate.state === 'Spawn') ??
      candidates[0];

    animations[sprite] = preferred;
  }

  return animations;
}
