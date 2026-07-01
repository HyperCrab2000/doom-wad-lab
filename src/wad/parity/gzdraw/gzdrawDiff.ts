import { GZDRAW_SECTION, GZDRAW_SECTION_NAMES } from './constants';
import type {
  GzdrawDiffResult,
  GzdrawDocument,
  GzdrawFieldDiff,
  GzdrawMissingSection,
  GzdrawSectionDiff,
} from './types';

const REQUIRED_SECTION_IDS = [
  GZDRAW_SECTION.CAMERA,
  GZDRAW_SECTION.SUBSECTORS,
  GZDRAW_SECTION.SECTORS,
  GZDRAW_SECTION.WALLS,
  GZDRAW_SECTION.SPRITES,
  GZDRAW_SECTION.PORTAL_SNAPSHOT,
] as const;

function sectionName(typeId: number): string {
  return GZDRAW_SECTION_NAMES[typeId] ?? `unknown(${typeId})`;
}

function pushFieldDiff(out: GzdrawFieldDiff[], path: string, left: unknown, right: unknown): void {
  if (Object.is(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length === right.length && left.every((v, i) => Object.is(v, right[i]))) return;
  }
  out.push({ path, left, right });
}

function diffIndexedScalars(
  sectionId: number,
  sectionNameKey: string,
  left: number[],
  right: number[],
): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    pushFieldDiff(fieldDiffs, `${sectionNameKey}[${i}]`, left[i], right[i]);
  }
  return {
    sectionId,
    sectionName: sectionNameKey,
    leftCount: left.length,
    rightCount: right.length,
    fieldDiffs,
  };
}

function diffWalls(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const max = Math.max(left.walls.length, right.walls.length);
  for (let i = 0; i < max; i++) {
    const l = left.walls[i];
    const r = right.walls[i];
    if (!l || !r) {
      pushFieldDiff(fieldDiffs, `walls[${i}]`, l, r);
      continue;
    }
    pushFieldDiff(fieldDiffs, `walls[${i}].linedef`, l.linedef, r.linedef);
    pushFieldDiff(fieldDiffs, `walls[${i}].side`, l.side, r.side);
    // segIndex is engine-internal; linedef+side+sortKey is the draw oracle identity.
    if (l.linedef !== r.linedef || l.side !== r.side) {
      pushFieldDiff(fieldDiffs, `walls[${i}].segIndex`, l.segIndex, r.segIndex);
    }
    pushFieldDiff(fieldDiffs, `walls[${i}].sortKey`, l.sortKey, r.sortKey);
    pushFieldDiff(fieldDiffs, `walls[${i}].flags`, l.flags, r.flags);
  }
  return {
    sectionId: GZDRAW_SECTION.WALLS,
    sectionName: 'walls',
    leftCount: left.walls.length,
    rightCount: right.walls.length,
    fieldDiffs,
  };
}

function diffCamera(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const fields = ['x', 'y', 'z', 'yaw', 'pitch', 'yawBam'] as const;
  for (const field of fields) {
    pushFieldDiff(fieldDiffs, `camera.${field}`, left.camera?.[field], right.camera?.[field]);
  }
  return {
    sectionId: GZDRAW_SECTION.CAMERA,
    sectionName: 'camera',
    leftCount: left.camera ? 1 : 0,
    rightCount: right.camera ? 1 : 0,
    fieldDiffs,
  };
}

function diffSprites(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const max = Math.max(left.sprites.length, right.sprites.length);
  for (let i = 0; i < max; i++) {
    const l = left.sprites[i];
    const r = right.sprites[i];
    if (!l || !r) {
      pushFieldDiff(fieldDiffs, `sprites[${i}]`, l, r);
      continue;
    }
    pushFieldDiff(fieldDiffs, `sprites[${i}].thingIndex`, l.thingIndex, r.thingIndex);
    pushFieldDiff(fieldDiffs, `sprites[${i}].spriteFrame`, l.spriteFrame, r.spriteFrame);
    pushFieldDiff(fieldDiffs, `sprites[${i}].sortKey`, l.sortKey, r.sortKey);
    pushFieldDiff(fieldDiffs, `sprites[${i}].flags`, l.flags, r.flags);
  }
  return {
    sectionId: GZDRAW_SECTION.SPRITES,
    sectionName: 'sprites',
    leftCount: left.sprites.length,
    rightCount: right.sprites.length,
    fieldDiffs,
  };
}

function diffPortalSnapshot(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const l = left.portalSnapshot;
  const r = right.portalSnapshot;
  pushFieldDiff(fieldDiffs, 'portal_snapshot.stackDepth', l?.stackDepth, r?.stackDepth);
  pushFieldDiff(fieldDiffs, 'portal_snapshot.clipCount', l?.clipCount, r?.clipCount);
  const max = Math.max(l?.clips.length ?? 0, r?.clips.length ?? 0);
  for (let i = 0; i < max; i++) {
    pushFieldDiff(fieldDiffs, `portal_snapshot.clips[${i}]`, l?.clips[i], r?.clips[i]);
  }
  return {
    sectionId: GZDRAW_SECTION.PORTAL_SNAPSHOT,
    sectionName: 'portal_snapshot',
    leftCount: l?.clipCount ?? 0,
    rightCount: r?.clipCount ?? 0,
    fieldDiffs,
  };
}

function diffFlats(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const max = Math.max(left.flats.length, right.flats.length);
  for (let i = 0; i < max; i++) {
    const l = left.flats[i];
    const r = right.flats[i];
    if (!l || !r) {
      pushFieldDiff(fieldDiffs, `flats[${i}]`, l, r);
      continue;
    }
    pushFieldDiff(fieldDiffs, `flats[${i}].subsectorIndex`, l.subsectorIndex, r.subsectorIndex);
    pushFieldDiff(fieldDiffs, `flats[${i}].sectorIndex`, l.sectorIndex, r.sectorIndex);
    pushFieldDiff(fieldDiffs, `flats[${i}].sortKey`, l.sortKey, r.sortKey);
  }
  return {
    sectionId: GZDRAW_SECTION.FLAT_DRAWS,
    sectionName: 'flat_draws',
    leftCount: left.flats.length,
    rightCount: right.flats.length,
    fieldDiffs,
  };
}

function diffDrawMeta(left: GzdrawDocument, right: GzdrawDocument): GzdrawSectionDiff {
  const fieldDiffs: GzdrawFieldDiff[] = [];
  const l = left.drawMeta;
  const r = right.drawMeta;
  pushFieldDiff(fieldDiffs, 'draw_meta.flatDrawMode', l?.flatDrawMode, r?.flatDrawMode);
  pushFieldDiff(fieldDiffs, 'draw_meta.wallCount', l?.wallCount, r?.wallCount);
  pushFieldDiff(fieldDiffs, 'draw_meta.spriteCount', l?.spriteCount, r?.spriteCount);
  pushFieldDiff(fieldDiffs, 'draw_meta.subsectorCount', l?.subsectorCount, r?.subsectorCount);
  return {
    sectionId: GZDRAW_SECTION.DRAW_META,
    sectionName: 'draw_meta',
    leftCount: l ? 1 : 0,
    rightCount: r ? 1 : 0,
    fieldDiffs,
  };
}

function collectPresentSectionIds(doc: GzdrawDocument): Set<number> {
  const present = new Set<number>();
  for (const section of doc.sections) {
    present.add(section.sectionId);
  }
  return present;
}

function diffMissingSections(left: GzdrawDocument, right: GzdrawDocument): GzdrawMissingSection[] {
  const leftIds = collectPresentSectionIds(left);
  const rightIds = collectPresentSectionIds(right);
  const missing: GzdrawMissingSection[] = [];

  for (const typeId of REQUIRED_SECTION_IDS) {
    if (leftIds.has(typeId) && !rightIds.has(typeId)) {
      missing.push({ side: 'right', typeId, sectionName: sectionName(typeId) });
    } else if (!leftIds.has(typeId) && rightIds.has(typeId)) {
      missing.push({ side: 'left', typeId, sectionName: sectionName(typeId) });
    }
  }

  return missing;
}

export function diffGzdraw(left: GzdrawDocument, right: GzdrawDocument): GzdrawDiffResult {
  const headerDiffs: GzdrawFieldDiff[] = [];
  pushFieldDiff(headerDiffs, 'header.version', left.header.version, right.header.version);
  pushFieldDiff(headerDiffs, 'header.mapName', left.header.mapName, right.header.mapName);
  pushFieldDiff(headerDiffs, 'header.probeId', left.header.probeId, right.header.probeId);
  pushFieldDiff(headerDiffs, 'header.sectionCount', left.header.sectionCount, right.header.sectionCount);

  const missingSections = diffMissingSections(left, right);

  const sectionDiffs: GzdrawSectionDiff[] = [
    diffCamera(left, right),
    diffIndexedScalars(GZDRAW_SECTION.SUBSECTORS, 'subsectors', left.subsectors, right.subsectors),
    diffIndexedScalars(GZDRAW_SECTION.SECTORS, 'sectors', left.sectors, right.sectors),
    diffWalls(left, right),
    diffSprites(left, right),
    diffPortalSnapshot(left, right),
    diffFlats(left, right),
    diffDrawMeta(left, right),
  ].filter((section) => section.fieldDiffs.length > 0);

  return {
    identical: headerDiffs.length === 0 && missingSections.length === 0 && sectionDiffs.length === 0,
    headerDiffs,
    missingSections,
    sectionDiffs,
  };
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  return JSON.stringify(value);
}

export function formatGzdrawDiff(result: GzdrawDiffResult): string {
  if (result.identical) return 'GZDRAW files are identical.';

  const lines: string[] = ['GZDRAW diff:'];

  for (const diff of result.headerDiffs) {
    lines.push(`  ${diff.path}: ${formatValue(diff.left)} != ${formatValue(diff.right)}`);
  }

  for (const missing of result.missingSections) {
    lines.push(`  missing on ${missing.side}: ${missing.sectionName} (type ${missing.typeId})`);
  }

  for (const section of result.sectionDiffs) {
    lines.push(
      `  ${section.sectionName}: ${section.fieldDiffs.length} mismatch(es) (left=${section.leftCount}, right=${section.rightCount})`,
    );
    for (const field of section.fieldDiffs.slice(0, 20)) {
      lines.push(`    ${field.path}: ${formatValue(field.left)} != ${formatValue(field.right)}`);
    }
    if (section.fieldDiffs.length > 20) {
      lines.push(`    ... ${section.fieldDiffs.length - 20} more`);
    }
  }

  return lines.join('\n');
}
