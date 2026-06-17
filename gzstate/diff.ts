import { GZSTATE_SECTION_NAMES } from './constants';
import { normalizedLumpCatalog, normalizedNameList, resolveStringIndex } from './normalizeCompare';
import type { GzstateDiffResult, GzstateDocument, GzstateFieldDiff, GzstateSectionDiff } from './types';

function pushFieldDiffs(
  out: GzstateFieldDiff[],
  path: string,
  left: unknown,
  right: unknown,
): void {
  if (Object.is(left, right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length === right.length && left.every((v, i) => Object.is(v, right[i]))) return;
  }
  if (left instanceof Int16Array && right instanceof Int16Array) {
    if (left.length === right.length && left.every((v, i) => v === right[i])) return;
  }
  out.push({ path, left, right });
}

function diffArray<T extends Record<string, unknown>>(
  sectionName: string,
  left: T[],
  right: T[],
  fields: (keyof T)[],
): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (i >= left.length) {
      fieldDiffs.push({ path: `${sectionName}[${i}]`, left: undefined, right: right[i] });
      continue;
    }
    if (i >= right.length) {
      fieldDiffs.push({ path: `${sectionName}[${i}]`, left: left[i], right: undefined });
      continue;
    }
    for (const field of fields) {
      pushFieldDiffs(fieldDiffs, `${sectionName}[${i}].${String(field)}`, left[i][field], right[i][field]);
    }
  }
  return {
    sectionId: 0,
    sectionName,
    leftCount: left.length,
    rightCount: right.length,
    fieldDiffs,
  };
}

function diffLumpCatalog(left: GzstateDocument, right: GzstateDocument): GzstateSectionDiff {
  const leftCatalog = normalizedLumpCatalog(left);
  const rightCatalog = normalizedLumpCatalog(right);
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(leftCatalog.length, rightCatalog.length);
  for (let i = 0; i < max; i++) {
    const l = leftCatalog[i];
    const r = rightCatalog[i];
    const name = l ? resolveStringIndex(left, l.nameIndex) : resolveStringIndex(right, r!.nameIndex);
    if (!l || !r) {
      fieldDiffs.push({ path: `lumpCatalog[${name}]`, left: l, right: r });
      continue;
    }
    if (l.byteLength !== r.byteLength) {
      fieldDiffs.push({ path: `lumpCatalog[${name}].byteLength`, left: l.byteLength, right: r.byteLength });
    }
    if (l.crc32 !== r.crc32) {
      fieldDiffs.push({ path: `lumpCatalog[${name}].crc32`, left: l.crc32, right: r.crc32 });
    }
    if (l.category !== r.category) {
      fieldDiffs.push({ path: `lumpCatalog[${name}].category`, left: l.category, right: r.category });
    }
  }
  return {
    sectionId: 11,
    sectionName: 'lumpCatalog',
    leftCount: leftCatalog.length,
    rightCount: rightCatalog.length,
    fieldDiffs,
  };
}

function diffResolvedNameList(
  sectionName: string,
  sectionId: number,
  left: GzstateDocument,
  right: GzstateDocument,
  leftIndices: number[],
  rightIndices: number[],
): GzstateSectionDiff {
  const leftNames = normalizedNameList(left, leftIndices);
  const rightNames = normalizedNameList(right, rightIndices);
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(leftNames.length, rightNames.length);
  for (let i = 0; i < max; i++) {
    if (leftNames[i] !== rightNames[i]) {
      fieldDiffs.push({ path: `${sectionName}[${i}]`, left: leftNames[i], right: rightNames[i] });
    }
  }
  return { sectionId, sectionName, leftCount: leftNames.length, rightCount: rightNames.length, fieldDiffs };
}

function diffTextureDefs(left: GzstateDocument, right: GzstateDocument): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const leftSorted = [...left.textureDefs].sort((a, b) =>
    resolveStringIndex(left, a.nameIndex).localeCompare(resolveStringIndex(left, b.nameIndex)),
  );
  const rightSorted = [...right.textureDefs].sort((a, b) =>
    resolveStringIndex(right, a.nameIndex).localeCompare(resolveStringIndex(right, b.nameIndex)),
  );
  const max = Math.max(leftSorted.length, rightSorted.length);
  for (let i = 0; i < max; i++) {
    const l = leftSorted[i];
    const r = rightSorted[i];
    const name = l ? resolveStringIndex(left, l.nameIndex) : resolveStringIndex(right, r!.nameIndex);
    if (!l || !r) {
      fieldDiffs.push({ path: `textureDefs[${name}]`, left: l, right: r });
      continue;
    }
    if (l.width !== r.width) fieldDiffs.push({ path: `textureDefs[${name}].width`, left: l.width, right: r.width });
    if (l.height !== r.height) fieldDiffs.push({ path: `textureDefs[${name}].height`, left: l.height, right: r.height });
    if (JSON.stringify(l.patches) !== JSON.stringify(r.patches)) {
      fieldDiffs.push({ path: `textureDefs[${name}].patches`, left: l.patches, right: r.patches });
    }
  }
  return {
    sectionId: 12,
    sectionName: 'textureDefs',
    leftCount: leftSorted.length,
    rightCount: rightSorted.length,
    fieldDiffs,
  };
}

function diffResolvedSectorTextures(left: GzstateDocument, right: GzstateDocument): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(left.sectors.length, right.sectors.length);
  for (let i = 0; i < max; i++) {
    const l = left.sectors[i];
    const r = right.sectors[i];
    if (!l || !r) continue;
    const floorL = resolveStringIndex(left, l.floorTextureIndex);
    const floorR = resolveStringIndex(right, r.floorTextureIndex);
    if (floorL !== floorR) fieldDiffs.push({ path: `sectors[${i}].floorTexture`, left: floorL, right: floorR });
    const ceilL = resolveStringIndex(left, l.ceilingTextureIndex);
    const ceilR = resolveStringIndex(right, r.ceilingTextureIndex);
    if (ceilL !== ceilR) fieldDiffs.push({ path: `sectors[${i}].ceilingTexture`, left: ceilL, right: ceilR });
  }
  return { sectionId: 3, sectionName: 'sectors', leftCount: left.sectors.length, rightCount: right.sectors.length, fieldDiffs };
}

function diffResolvedSidedefTextures(left: GzstateDocument, right: GzstateDocument): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(left.sidedefs.length, right.sidedefs.length);
  for (let i = 0; i < max; i++) {
    const l = left.sidedefs[i];
    const r = right.sidedefs[i];
    if (!l || !r) {
      fieldDiffs.push({ path: `sidedefs[${i}]`, left: l, right: r });
      continue;
    }
    for (const field of ['textureOffsetX', 'textureOffsetY', 'sectorIndex'] as const) {
      if (l[field] !== r[field]) fieldDiffs.push({ path: `sidedefs[${i}].${field}`, left: l[field], right: r[field] });
    }
    for (const texField of ['topTextureIndex', 'bottomTextureIndex', 'midTextureIndex'] as const) {
      const nameL = resolveStringIndex(left, l[texField]);
      const nameR = resolveStringIndex(right, r[texField]);
      if (nameL !== nameR) fieldDiffs.push({ path: `sidedefs[${i}].${texField}`, left: nameL, right: nameR });
    }
  }
  return { sectionId: 4, sectionName: 'sidedefs', leftCount: left.sidedefs.length, rightCount: right.sidedefs.length, fieldDiffs };
}

function diffStringIndexList(sectionName: string, left: number[], right: number[]): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (i >= left.length || i >= right.length || left[i] !== right[i]) {
      pushFieldDiffs(fieldDiffs, `${sectionName}[${i}]`, left[i], right[i]);
    }
  }
  return {
    sectionId: 0,
    sectionName,
    leftCount: left.length,
    rightCount: right.length,
    fieldDiffs,
  };
}

function diffNodeChildren(left: GzstateDocument['nodes'], right: GzstateDocument['nodes']): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    const l = left[i];
    const r = right[i];
    if (!l || !r) continue;
    if ((l.child0 >>> 0) !== (r.child0 >>> 0)) {
      fieldDiffs.push({ path: `nodes[${i}].child0`, left: l.child0 >>> 0, right: r.child0 >>> 0 });
    }
    if ((l.child1 >>> 0) !== (r.child1 >>> 0)) {
      fieldDiffs.push({ path: `nodes[${i}].child1`, left: l.child1 >>> 0, right: r.child1 >>> 0 });
    }
  }
  return { sectionId: 8, sectionName: 'nodes', leftCount: left.length, rightCount: right.length, fieldDiffs };
}

function diffRasterDigests(
  sectionName: string,
  sectionId: number,
  left: GzstateDocument,
  right: GzstateDocument,
  leftDigests: GzstateDocument['patchRasters'],
  rightDigests: GzstateDocument['patchRasters'],
): GzstateSectionDiff {
  const fieldDiffs: GzstateFieldDiff[] = [];
  const leftSorted = [...leftDigests].sort((a, b) =>
    resolveStringIndex(left, a.nameIndex).localeCompare(resolveStringIndex(left, b.nameIndex)),
  );
  const rightSorted = [...rightDigests].sort((a, b) =>
    resolveStringIndex(right, a.nameIndex).localeCompare(resolveStringIndex(right, b.nameIndex)),
  );
  const max = Math.max(leftSorted.length, rightSorted.length);
  for (let i = 0; i < max; i++) {
    const l = leftSorted[i];
    const r = rightSorted[i];
    const name = l ? resolveStringIndex(left, l.nameIndex) : resolveStringIndex(right, r!.nameIndex);
    if (!l || !r) {
      fieldDiffs.push({ path: `${sectionName}[${name}]`, left: l, right: r });
      continue;
    }
    if (l.width !== r.width) fieldDiffs.push({ path: `${sectionName}[${name}].width`, left: l.width, right: r.width });
    if (l.height !== r.height) fieldDiffs.push({ path: `${sectionName}[${name}].height`, left: l.height, right: r.height });
    if (l.rgbaCrc32 !== r.rgbaCrc32) {
      fieldDiffs.push({ path: `${sectionName}[${name}].rgbaCrc32`, left: l.rgbaCrc32, right: r.rgbaCrc32 });
    }
  }
  return { sectionId, sectionName, leftCount: leftSorted.length, rightCount: rightSorted.length, fieldDiffs };
}

export function diffGzstate(left: GzstateDocument, right: GzstateDocument): GzstateDiffResult {
  const headerDiffs: GzstateFieldDiff[] = [];
  pushFieldDiffs(headerDiffs, 'header.mapName', left.header.mapName, right.header.mapName);
  // engineTag differs by design (WADLAB vs git hash)
  pushFieldDiffs(headerDiffs, 'header.flags', left.header.flags, right.header.flags);

  const sectionDiffs: GzstateSectionDiff[] = [];

  if (left.strings.slice().sort().join('\0') !== right.strings.slice().sort().join('\0')) {
    sectionDiffs.push({
      sectionId: 1,
      sectionName: 'STRING_TABLE',
      leftCount: left.strings.length,
      rightCount: right.strings.length,
      fieldDiffs: [{ path: 'strings', left: left.strings, right: right.strings }],
    });
  }

  sectionDiffs.push(
    diffArray('vertices', left.vertices, right.vertices, ['x', 'y']),
    diffArray('sectors', left.sectors, right.sectors, [
      'floorHeight',
      'ceilingHeight',
      'lightLevel',
      'special',
      'tag',
      'flags',
    ]),
    diffResolvedSectorTextures(left, right),
    diffResolvedSidedefTextures(left, right),
    diffArray('linedefs', left.linedefs, right.linedefs, [
      'vertex1',
      'vertex2',
      'flags',
      'flags2',
      'special',
      'side0',
      'side1',
      'tag',
      'activation',
      'args',
    ]),
    diffArray('segs', left.segs, right.segs, ['vertex1', 'vertex2', 'angle', 'linedef', 'side', 'offset']),
    diffArray('subsectors', left.subsectors, right.subsectors, ['numSegs', 'firstSeg', 'sectorIndex', 'flags']),
    diffArray('nodes', left.nodes, right.nodes, ['x', 'y', 'dx', 'dy', 'bbox']),
    diffNodeChildren(left.nodes, right.nodes),
    diffArray('things', left.things, right.things, ['x', 'y', 'z', 'angle', 'type', 'flags', 'tid']),
    diffLumpCatalog(left, right),
    diffTextureDefs(left, right),
    diffResolvedNameList('flatNames', 13, left, right, left.flatNames, right.flatNames),
    diffResolvedNameList('spriteNames', 14, left, right, left.spriteNames, right.spriteNames),
    diffResolvedNameList('musicNames', 15, left, right, left.musicNames, right.musicNames),
    diffResolvedNameList('soundNames', 16, left, right, left.soundNames, right.soundNames),
    diffResolvedNameList('pnames', 17, left, right, left.pnames, right.pnames),
    diffRasterDigests('patchRasters', 18, left, right, left.patchRasters, right.patchRasters),
    diffRasterDigests('flatRasters', 19, left, right, left.flatRasters, right.flatRasters),
    diffRasterDigests('spriteRasters', 20, left, right, left.spriteRasters, right.spriteRasters),
    diffRasterDigests('textureRasters', 21, left, right, left.textureRasters, right.textureRasters),
  );

  const nonEmptySectionDiffs = sectionDiffs
    .filter((s) => s.fieldDiffs.length > 0)
    .reduce<GzstateSectionDiff[]>((acc, section) => {
      const existing = acc.find((s) => s.sectionName === section.sectionName);
      if (existing) existing.fieldDiffs.push(...section.fieldDiffs);
      else acc.push(section);
      return acc;
    }, []);
  for (const diff of nonEmptySectionDiffs) {
    const id = Object.entries(GZSTATE_SECTION_NAMES).find(([, name]) => name === diff.sectionName)?.[0];
    if (id) diff.sectionId = Number(id);
  }

  return {
    identical: headerDiffs.length === 0 && nonEmptySectionDiffs.length === 0,
    headerDiffs,
    sectionDiffs: nonEmptySectionDiffs,
  };
}

export function formatGzstateDiff(result: GzstateDiffResult): string {
  if (result.identical) return 'GZSTATE files are identical.';
  const lines: string[] = ['GZSTATE diff:'];
  for (const diff of result.headerDiffs) {
    lines.push(`  ${diff.path}: ${JSON.stringify(diff.left)} != ${JSON.stringify(diff.right)}`);
  }
  for (const section of result.sectionDiffs) {
    lines.push(`  ${section.sectionName}: ${section.fieldDiffs.length} field mismatch(es)`);
    for (const field of section.fieldDiffs.slice(0, 20)) {
      lines.push(`    ${field.path}: ${JSON.stringify(field.left)} != ${JSON.stringify(field.right)}`);
    }
    if (section.fieldDiffs.length > 20) {
      lines.push(`    ... ${section.fieldDiffs.length - 20} more`);
    }
  }
  return lines.join('\n');
}
