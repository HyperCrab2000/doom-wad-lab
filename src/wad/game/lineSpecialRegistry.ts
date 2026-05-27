import { getCrusherSpecial } from './crusherSpecials';
import { getDonutSpecial } from './donutSpecials';
import { getDoorSpecial } from './lineSpecials';
import { getExitSpecial } from './exitSpecials';
import { getFloorMoverSpecial } from './floorMoverSpecials';
import { getLightSpecial } from './lightSpecials';
import { getMovingFloorSpecial } from './movingFloorSpecials';
import { isScrollWallSpecial } from './scrollSpecials';
import { getStairSpecial } from './stairSpecials';
import { getTeleportSpecial } from './teleportSpecials';

export type LineSpecialCategory =
  | 'scroll'
  | 'manualDoor'
  | 'remoteDoor'
  | 'ceiling'
  | 'lift'
  | 'floor'
  | 'stair'
  | 'movingFloor'
  | 'crusher'
  | 'exit'
  | 'teleport'
  | 'light'
  | 'keyedDoor'
  | 'unknown';

export type LineSpecialImplementationStatus = 'implemented' | 'missing' | 'partial';

export interface LineSpecialCatalogEntry {
  special: number;
  category: LineSpecialCategory;
  name: string;
  /** Vanilla Boom-style activation mnemonic from the IWAD spec. */
  activation: string;
  doom2Only?: boolean;
  status: LineSpecialImplementationStatus;
  handler:
    | 'door'
    | 'floor'
    | 'teleport'
    | 'crusher'
    | 'exit'
    | 'stair'
    | 'donut'
    | 'light'
    | 'scroll'
    | 'movingFloor'
    | null;
}

/** Stock Doom / Doom II line specials (see `LineDefSpecials.ts` comments). */
const CATALOG_ROWS: Array<Omit<LineSpecialCatalogEntry, 'status' | 'handler'>> = [
  { special: 48, category: 'scroll', name: 'Scrolling wall', activation: 'continuous' },
  { special: 1, category: 'manualDoor', name: 'Manual door open/close', activation: 'SR' },
  { special: 26, category: 'keyedDoor', name: 'Manual door (blue key)', activation: 'SR' },
  { special: 27, category: 'keyedDoor', name: 'Manual door (yellow key)', activation: 'SR' },
  { special: 28, category: 'keyedDoor', name: 'Manual door (red key)', activation: 'SR' },
  { special: 31, category: 'manualDoor', name: 'Manual door open', activation: 'S1' },
  { special: 32, category: 'keyedDoor', name: 'Manual door open (blue)', activation: 'S1' },
  { special: 33, category: 'keyedDoor', name: 'Manual door open (red)', activation: 'S1' },
  { special: 34, category: 'keyedDoor', name: 'Manual door open (yellow)', activation: 'S1' },
  { special: 46, category: 'manualDoor', name: 'Manual door open (gun)', activation: 'G1' },
  { special: 117, category: 'manualDoor', name: 'Manual blaze door O/C', activation: 'SR', doom2Only: true },
  { special: 118, category: 'manualDoor', name: 'Manual blaze door open', activation: 'S1', doom2Only: true },
  { special: 4, category: 'remoteDoor', name: 'Remote door open/close', activation: 'W1' },
  { special: 2, category: 'remoteDoor', name: 'Remote door open', activation: 'W1' },
  { special: 3, category: 'remoteDoor', name: 'Remote door close', activation: 'W1' },
  { special: 16, category: 'remoteDoor', name: 'Remote door close-wait-open', activation: 'W1' },
  { special: 29, category: 'remoteDoor', name: 'Remote door O/C (switch)', activation: 'S1' },
  { special: 42, category: 'remoteDoor', name: 'Remote door close (repeat)', activation: 'SR' },
  { special: 50, category: 'remoteDoor', name: 'Remote door close (switch)', activation: 'S1' },
  { special: 61, category: 'remoteDoor', name: 'Remote door open (repeat)', activation: 'SR' },
  { special: 63, category: 'remoteDoor', name: 'Remote door O/C (repeat)', activation: 'SR' },
  { special: 75, category: 'remoteDoor', name: 'Remote door close (walk)', activation: 'WR' },
  { special: 76, category: 'remoteDoor', name: 'Remote close-wait-open (walk)', activation: 'WR' },
  { special: 86, category: 'remoteDoor', name: 'Remote door open (walk)', activation: 'WR' },
  { special: 90, category: 'remoteDoor', name: 'Remote door O/C (walk repeat)', activation: 'WR' },
  { special: 103, category: 'remoteDoor', name: 'Remote door open (switch)', activation: 'S1' },
  { special: 105, category: 'remoteDoor', name: 'Remote blaze O/C', activation: 'S1', doom2Only: true },
  { special: 106, category: 'remoteDoor', name: 'Remote blaze open', activation: 'W1', doom2Only: true },
  { special: 107, category: 'remoteDoor', name: 'Remote blaze close', activation: 'W1', doom2Only: true },
  { special: 108, category: 'remoteDoor', name: 'Remote blaze O/C', activation: 'W1', doom2Only: true },
  { special: 109, category: 'remoteDoor', name: 'Remote blaze open', activation: 'WR', doom2Only: true },
  { special: 110, category: 'remoteDoor', name: 'Remote blaze close', activation: 'WR', doom2Only: true },
  { special: 111, category: 'remoteDoor', name: 'Remote blaze O/C repeat', activation: 'WR', doom2Only: true },
  { special: 112, category: 'remoteDoor', name: 'Remote blaze open', activation: 'S1', doom2Only: true },
  { special: 113, category: 'remoteDoor', name: 'Remote blaze close', activation: 'S1', doom2Only: true },
  { special: 114, category: 'remoteDoor', name: 'Remote blaze O/C', activation: 'SR', doom2Only: true },
  { special: 115, category: 'remoteDoor', name: 'Remote blaze open', activation: 'SR', doom2Only: true },
  { special: 116, category: 'remoteDoor', name: 'Remote blaze close', activation: 'SR', doom2Only: true },
  { special: 133, category: 'keyedDoor', name: 'Remote blaze open (blue)', activation: 'S1', doom2Only: true },
  { special: 134, category: 'keyedDoor', name: 'Remote blaze open (red)', activation: 'SR', doom2Only: true },
  { special: 135, category: 'keyedDoor', name: 'Remote blaze open (red)', activation: 'S1', doom2Only: true },
  { special: 136, category: 'keyedDoor', name: 'Remote blaze open (yellow)', activation: 'SR', doom2Only: true },
  { special: 137, category: 'keyedDoor', name: 'Remote blaze open (yellow)', activation: 'S1', doom2Only: true },
  { special: 99, category: 'keyedDoor', name: 'Remote blaze open (blue)', activation: 'SR', doom2Only: true },
  { special: 40, category: 'ceiling', name: 'Ceiling raise to HEC', activation: 'W1' },
  { special: 41, category: 'ceiling', name: 'Ceiling lower to floor', activation: 'S1' },
  { special: 43, category: 'ceiling', name: 'Ceiling lower to floor', activation: 'SR' },
  { special: 44, category: 'ceiling', name: 'Ceiling lower to floor +8', activation: 'W1' },
  { special: 49, category: 'ceiling', name: 'Ceiling lower to floor +8', activation: 'S1' },
  { special: 72, category: 'ceiling', name: 'Ceiling lower to floor +8', activation: 'WR' },
  { special: 10, category: 'lift', name: 'Lift down-wait-up', activation: 'W1' },
  { special: 21, category: 'lift', name: 'Lift down-wait-up', activation: 'S1' },
  { special: 88, category: 'lift', name: 'Lift down-wait-up', activation: 'WR' },
  { special: 62, category: 'lift', name: 'Lift down-wait-up', activation: 'SR' },
  { special: 121, category: 'lift', name: 'Turbo lift', activation: 'W1', doom2Only: true },
  { special: 122, category: 'lift', name: 'Turbo lift', activation: 'S1', doom2Only: true },
  { special: 120, category: 'lift', name: 'Turbo lift', activation: 'WR', doom2Only: true },
  { special: 123, category: 'lift', name: 'Turbo lift', activation: 'SR', doom2Only: true },
  { special: 5, category: 'floor', name: 'Floor raise to LIC', activation: 'W1' },
  { special: 91, category: 'floor', name: 'Floor raise to LIC', activation: 'WR' },
  { special: 101, category: 'floor', name: 'Floor raise to LIC', activation: 'S1' },
  { special: 64, category: 'floor', name: 'Floor raise to LIC', activation: 'SR' },
  { special: 24, category: 'floor', name: 'Floor raise to LIC (gun)', activation: 'G1' },
  { special: 38, category: 'floor', name: 'Floor lower to LEF', activation: 'W1' },
  { special: 23, category: 'floor', name: 'Floor lower to LEF', activation: 'S1' },
  { special: 82, category: 'floor', name: 'Floor lower to LEF', activation: 'WR' },
  { special: 60, category: 'floor', name: 'Floor lower to LEF', activation: 'SR' },
  { special: 19, category: 'floor', name: 'Floor lower to HEF', activation: 'W1' },
  { special: 102, category: 'floor', name: 'Floor lower to HEF', activation: 'S1' },
  { special: 83, category: 'floor', name: 'Floor lower to HEF', activation: 'WR' },
  { special: 45, category: 'floor', name: 'Floor lower to HEF', activation: 'SR' },
  { special: 58, category: 'floor', name: 'Floor raise 24', activation: 'W1' },
  { special: 92, category: 'floor', name: 'Floor raise 24', activation: 'WR' },
  { special: 119, category: 'floor', name: 'Floor raise to nhEF', activation: 'W1', doom2Only: true },
  { special: 128, category: 'floor', name: 'Floor raise to nhEF', activation: 'WR', doom2Only: true },
  { special: 18, category: 'floor', name: 'Floor raise to nhEF', activation: 'S1', doom2Only: true },
  { special: 69, category: 'floor', name: 'Floor raise to nhEF', activation: 'SR', doom2Only: true },
  { special: 130, category: 'floor', name: 'Turbo floor raise nhEF', activation: 'W1', doom2Only: true },
  { special: 131, category: 'floor', name: 'Turbo floor raise nhEF', activation: 'S1', doom2Only: true },
  { special: 129, category: 'floor', name: 'Turbo floor raise nhEF', activation: 'WR', doom2Only: true },
  { special: 132, category: 'floor', name: 'Turbo floor raise nhEF', activation: 'SR', doom2Only: true },
  { special: 8, category: 'stair', name: 'Build stairs', activation: 'W1' },
  { special: 7, category: 'stair', name: 'Build stairs', activation: 'S1' },
  { special: 100, category: 'stair', name: 'Turbo stairs + crush', activation: 'W1', doom2Only: true },
  { special: 127, category: 'stair', name: 'Turbo stairs + crush', activation: 'S1', doom2Only: true },
  { special: 39, category: 'teleport', name: 'Teleport', activation: 'W1' },
  { special: 97, category: 'teleport', name: 'Teleport', activation: 'WR' },
  { special: 125, category: 'teleport', name: 'Teleport (monsters)', activation: 'W1', doom2Only: true },
  { special: 126, category: 'teleport', name: 'Teleport (monsters)', activation: 'WR', doom2Only: true },
  { special: 11, category: 'exit', name: 'Exit level', activation: 'S1' },
  { special: 51, category: 'exit', name: 'Exit to secret', activation: 'S1' },
  { special: 52, category: 'exit', name: 'Exit level', activation: 'W1' },
  { special: 124, category: 'exit', name: 'Exit to secret', activation: 'W1', doom2Only: true },
  { special: 6, category: 'crusher', name: 'Start crusher (fast hurt)', activation: 'W1' },
  { special: 25, category: 'crusher', name: 'Start crusher (slow hurt)', activation: 'W1' },
  { special: 57, category: 'crusher', name: 'Stop crusher', activation: 'W1' },
  { special: 73, category: 'crusher', name: 'Start crusher slow', activation: 'WR' },
  { special: 77, category: 'crusher', name: 'Start crusher fast', activation: 'WR' },
  { special: 74, category: 'crusher', name: 'Stop crusher', activation: 'WR' },
  { special: 141, category: 'crusher', name: 'Silent crusher', activation: 'W1', doom2Only: true },
  { special: 9, category: 'floor', name: 'Donut', activation: 'S1' },
  { special: 35, category: 'light', name: 'Light to 0', activation: 'W1' },
  { special: 12, category: 'light', name: 'Light to max', activation: 'W1' },
  { special: 13, category: 'light', name: 'Light to 255', activation: 'W1' },
  { special: 17, category: 'light', name: 'Blinking light', activation: 'W1' },
  { special: 104, category: 'light', name: 'Light to lowest neighbor', activation: 'W1' },
  { special: 79, category: 'light', name: 'Light to 0', activation: 'WR' },
  { special: 80, category: 'light', name: 'Light to max neighbor', activation: 'WR' },
  { special: 81, category: 'light', name: 'Light to 255', activation: 'WR' },
  { special: 138, category: 'light', name: 'Light to 255', activation: 'SR', doom2Only: true },
  { special: 139, category: 'light', name: 'Light to 0', activation: 'SR', doom2Only: true },
  { special: 22, category: 'floor', name: 'Floor raise nhEF (transfer)', activation: 'W1&' },
  { special: 95, category: 'floor', name: 'Floor raise nhEF (transfer)', activation: 'WR&' },
  { special: 20, category: 'floor', name: 'Floor raise nhEF (transfer)', activation: 'S1&' },
  { special: 68, category: 'floor', name: 'Floor raise nhEF (transfer)', activation: 'SR&' },
  { special: 47, category: 'floor', name: 'Floor raise nhEF (transfer gun)', activation: 'G1&' },
  { special: 56, category: 'floor', name: 'Floor raise LIC-8 crush', activation: 'W1&' },
  { special: 94, category: 'floor', name: 'Floor raise LIC-8 crush', activation: 'WR&' },
  { special: 55, category: 'floor', name: 'Floor raise LIC-8 crush', activation: 'S1' },
  { special: 65, category: 'floor', name: 'Floor raise LIC-8 crush', activation: 'SR' },
  { special: 15, category: 'floor', name: 'Floor raise 24 (transfer)', activation: 'S1&' },
  { special: 66, category: 'floor', name: 'Floor raise 24 (transfer)', activation: 'SR&' },
  { special: 59, category: 'floor', name: 'Floor raise 24 (transfer)', activation: 'W1&' },
  { special: 93, category: 'floor', name: 'Floor raise 24 (transfer)', activation: 'WR&' },
  { special: 14, category: 'floor', name: 'Floor raise 32 (transfer)', activation: 'S1&' },
  { special: 67, category: 'floor', name: 'Floor raise 32 (transfer)', activation: 'SR&' },
  { special: 140, category: 'floor', name: 'Floor raise 512', activation: 'S1', doom2Only: true },
  { special: 30, category: 'floor', name: 'Floor up shortest lower tex', activation: 'W1' },
  { special: 96, category: 'floor', name: 'Floor up shortest lower tex', activation: 'WR' },
  { special: 36, category: 'floor', name: 'Floor lower HEF+8 fast', activation: 'W1' },
  { special: 71, category: 'floor', name: 'Floor lower HEF+8 fast', activation: 'S1' },
  { special: 98, category: 'floor', name: 'Floor lower HEF+8 fast', activation: 'WR' },
  { special: 70, category: 'floor', name: 'Floor lower HEF+8 fast', activation: 'SR' },
  { special: 37, category: 'floor', name: 'Floor lower LEF (transfer)', activation: 'W1&' },
  { special: 84, category: 'floor', name: 'Floor lower LEF (transfer)', activation: 'WR&' },
  { special: 53, category: 'movingFloor', name: 'Start moving floor', activation: 'W1&' },
  { special: 54, category: 'movingFloor', name: 'Stop moving floor', activation: 'W1&' },
  { special: 87, category: 'movingFloor', name: 'Start moving floor', activation: 'WR&' },
  { special: 89, category: 'movingFloor', name: 'Stop moving floor', activation: 'WR&' },
];

function resolveHandler(special: number): LineSpecialCatalogEntry['handler'] {
  if (isScrollWallSpecial(special)) return 'scroll';
  if (getDoorSpecial(special)) return 'door';
  if (getFloorMoverSpecial(special)) return 'floor';
  if (getMovingFloorSpecial(special)) return 'movingFloor';
  if (getTeleportSpecial(special)) return 'teleport';
  if (getCrusherSpecial(special)) return 'crusher';
  if (getExitSpecial(special)) return 'exit';
  if (getStairSpecial(special)) return 'stair';
  if (getDonutSpecial(special)) return 'donut';
  if (getLightSpecial(special)) return 'light';
  return null;
}

function resolveStatus(
  _row: (typeof CATALOG_ROWS)[number],
  handler: LineSpecialCatalogEntry['handler']
): LineSpecialImplementationStatus {
  return handler ? 'implemented' : 'missing';
}

export const LINE_SPECIAL_CATALOG: Record<number, LineSpecialCatalogEntry> = Object.fromEntries(
  CATALOG_ROWS.map((row) => {
    const handler = resolveHandler(row.special);
    return [
      row.special,
      {
        ...row,
        handler,
        status: resolveStatus(row, handler),
      },
    ];
  })
);

export const ALL_CATALOGED_SPECIALS = CATALOG_ROWS.map((row) => row.special).sort((a, b) => a - b);

export const IMPLEMENTED_LINE_SPECIALS = ALL_CATALOGED_SPECIALS.filter(
  (special) => LINE_SPECIAL_CATALOG[special]?.status === 'implemented'
);

export function getLineSpecialCatalogEntry(special: number): LineSpecialCatalogEntry | null {
  return LINE_SPECIAL_CATALOG[special] ?? null;
}

export function isLineSpecialImplemented(special: number): boolean {
  return resolveHandler(special) !== null;
}
