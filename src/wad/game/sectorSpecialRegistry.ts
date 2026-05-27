import { SectorKind } from '@/wad/constants/SectorSpecials';
import {
  ALL_SECTOR_TYPE_ROWS,
  getSectorDamage,
  getSectorHealPerSecond,
  getSectorScroll,
  getSectorTimedDoor,
  getSectorWind,
  isEndOnDeathSectorType,
  isSecretSectorType,
  isSectorLowFriction,
  isStairBuilderSectorType,
} from './sectorSpecialRuntime';

export type SectorSpecialHandler =
  | 'none'
  | 'light'
  | 'damage'
  | 'wind'
  | 'scroll'
  | 'friction'
  | 'healing'
  | 'door'
  | 'end'
  | 'secret'
  | 'stairs'
  | 'fog'
  | 'automap'
  | 'lightning'
  | 'sky'
  | 'combo'
  | 'both';

export type SectorSpecialStatus = 'implemented' | 'partial' | 'missing';

export interface SectorSpecialCatalogEntry {
  type: number;
  kind: SectorKind;
  description?: string;
  handler: SectorSpecialHandler;
  status: SectorSpecialStatus;
}

function resolveHandler(kind: SectorKind, type: number): SectorSpecialHandler {
  switch (kind) {
    case SectorKind.none:
      return 'none';
    case SectorKind.light:
      return 'light';
    case SectorKind.damage:
      return 'damage';
    case SectorKind.wind:
      return 'wind';
    case SectorKind.scroller:
      return type === 118 ? 'scroll' : 'scroll';
    case SectorKind.friction:
      return 'friction';
    case SectorKind.healing:
      return 'healing';
    case SectorKind.door:
      return 'door';
    case SectorKind.end:
      return 'end';
    case SectorKind.secret:
      return 'secret';
    case SectorKind.stairs:
      return 'stairs';
    case SectorKind.fog:
      return 'fog';
    case SectorKind.automap:
      return 'automap';
    case SectorKind.lightning:
      return 'lightning';
    case SectorKind.sky:
      return 'sky';
    case SectorKind.combo:
      return 'combo';
    case SectorKind.both:
      return 'both';
    default:
      return 'none';
  }
}

function isHandlerImplemented(handler: SectorSpecialHandler, type: number): boolean {
  switch (handler) {
    case 'none':
      return true;
    case 'light':
    case 'lightning':
      return true;
    case 'damage':
    case 'both':
    case 'combo':
      return getSectorDamage(type) !== null;
    case 'wind':
      return getSectorWind(type) !== null;
    case 'scroll':
      return getSectorScroll(type, type === 118 ? 90 : 0) !== null;
    case 'friction':
      return isSectorLowFriction(type);
    case 'healing':
      return getSectorHealPerSecond(type) > 0;
    case 'door':
      return getSectorTimedDoor(type) !== null;
    case 'end':
      return isEndOnDeathSectorType(type);
    case 'secret':
      return isSecretSectorType(type);
    case 'stairs':
      return isStairBuilderSectorType(type);
    case 'fog':
      return type === 87;
    case 'automap':
      return type === 195;
    case 'sky':
      return type === 200;
    default:
      return false;
  }
}

export const SECTOR_SPECIAL_CATALOG: Record<number, SectorSpecialCatalogEntry> =
  Object.fromEntries(
    ALL_SECTOR_TYPE_ROWS.map((row) => {
      const handler = resolveHandler(row.kind, row.id);
      const implemented = isHandlerImplemented(handler, row.id);
      return [
        row.id,
        {
          type: row.id,
          kind: row.kind,
          description: row.description,
          handler,
          status: implemented ? 'implemented' : ('missing' as const),
        },
      ];
    })
  );

export const ALL_CATALOGED_SECTOR_TYPES = Object.keys(SECTOR_SPECIAL_CATALOG)
  .map(Number)
  .sort((a, b) => a - b);

export function getSectorSpecialCatalogEntry(type: number): SectorSpecialCatalogEntry | undefined {
  return SECTOR_SPECIAL_CATALOG[type];
}

export function getSectorCatalogCoverageStats(): {
  cataloged: number;
  implemented: number;
  missing: number;
  partial: number;
} {
  const entries = Object.values(SECTOR_SPECIAL_CATALOG);
  const implemented = entries.filter((e) => e.status === 'implemented').length;
  const missing = entries.filter((e) => e.status === 'missing').length;
  const partial = entries.filter((e) => e.status === 'partial').length;
  return {
    cataloged: entries.length,
    implemented,
    missing,
    partial,
  };
}
