export interface WadOption {
  id: string;
  label: string;
  path: string;
}

export const WAD_OPTIONS: WadOption[] = [
  { id: 'doom', label: 'Doom', path: '/wads/DOOM.WAD' },
  { id: 'doom2', label: 'Doom II', path: '/wads/DOOM2.WAD' },
  { id: 'test', label: 'Bundled test WAD', path: '/wads/test.wad' },
];

export const VOXEL_ASSET_ROOT = '/voxels';
export const VOXEL_HEIGHT_ROOT = '/materials/heightTex';

/** GM SoundFont (TimGM6mb) — place file at public/soundfonts/TimGM6mb.sf2 */
export const SOUNDFONT_URL = '/soundfonts/TimGM6mb.sf2';
