/** Vanilla Doom SFX lump names (subset) — used to label scanned DS* lumps. */
export const DOOM_SOUND_CATEGORIES = {
  weapon: [
    'DSPISTOL',
    'DSSHTGN',
    'DSCLIP',
    'DSCLIPIN',
    'DSBAREXP',
    'DSPLASMA',
    'DSBFG',
    'DSRLAUNC',
    'DSRLAUNC',
    'DSCHGUN',
    'DSCHGNUP',
    'DSSAWUP',
    'DSSAWFUL',
    'DSSAWHIT',
    'DSSAWIDL',
  ],
  player: ['DSOOF', 'DSPUNCH', 'DSFALL', 'DSPLFALL', 'DSPLPAIN', 'DSPLDETH', 'DSSLAP', 'DSWTCHK'],
  monster: [
    'DSPOSACT',
    'DSPOSPAIN',
    'DSPOSDIE',
    'DSSLOP',
    'DSTINK',
    'DSBOSS',
    'DSBOSPIT',
    'DSBOSCUB',
    'DSBOSPN',
    'DSBOSDTH',
  ],
  door: ['DSDOROPN', 'DSDORCLS', 'DSBDOPN', 'DSBDCLS', 'DSSWTCHN', 'DSSWTCHX'],
  world: [
    'DSTRANS',
    'DSTELEPT',
    'DSGETPOW',
    'DSITEMUP',
    'DSWPNUP',
    'DSPSTART',
    'DSPSTOP',
    'DSSTNMOV',
    'DSSECRET',
    'DSBELL',
    'DSBOUNCE',
  ],
} as const;

export type DoomSoundCategory = keyof typeof DOOM_SOUND_CATEGORIES;

const lumpToCategory = new Map<string, DoomSoundCategory>();
for (const [category, names] of Object.entries(DOOM_SOUND_CATEGORIES)) {
  for (const name of names) {
    lumpToCategory.set(name.toUpperCase(), category as DoomSoundCategory);
  }
}

export function classifyDoomSoundLump(lumpName: string): DoomSoundCategory | 'other' {
  return lumpToCategory.get(lumpName.toUpperCase()) ?? 'other';
}
