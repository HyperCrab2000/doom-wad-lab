import { difficulty } from '@/wad/constants/WadInfo';
import { Thing } from '@/wad/interfaces/Thing';

const isSinglePlayer = true; // toggle depending on your current mode
const currentDifficulty: difficulty = difficulty.intermediate; // e.g., set your active difficulty here

export const hasValidFlags = (thing: Thing) => {
  const flags = thing.flags;

  if (!flags) return true;

  if (isSinglePlayer) {
    if (flags.hideInSingleplayer) return false;
  } else {
    if (flags.hideInDeathmatch) return false;
  }

  // Filter by difficulty
  return flags.difficulty <= currentDifficulty;
};
