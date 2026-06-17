import { diffGzstate, formatGzstateDiff } from '../../../../gzstate/diff';
import type { GzstateDiffResult, GzstateDocument } from '../../../../gzstate/types';

export interface ParitySectionResult {
  sectionName: string;
  identical: boolean;
  mismatchCount: number;
}

export interface FullParityResult {
  identical: boolean;
  diff: GzstateDiffResult;
  sections: ParitySectionResult[];
  summary: string;
}

const PARITY_SECTIONS = [
  'STRING_TABLE',
  'lumpCatalog',
  'pnames',
  'textureDefs',
  'flatNames',
  'spriteNames',
  'musicNames',
  'soundNames',
  'patchRasters',
  'flatRasters',
  'spriteRasters',
  'textureRasters',
  'vertices',
  'sectors',
  'sidedefs',
  'linedefs',
  'segs',
  'subsectors',
  'nodes',
  'things',
] as const;

export function runFullParity(wadLab: GzstateDocument, gzdoom: GzstateDocument): FullParityResult {
  const diff = diffGzstate(wadLab, gzdoom);
  const sections: ParitySectionResult[] = PARITY_SECTIONS.map((sectionName) => {
    const lookupName = sectionName === 'STRING_TABLE' ? 'STRING_TABLE' : sectionName;
    const sectionDiff = diff.sectionDiffs.find((s) => s.sectionName === lookupName);
    const mismatchCount = sectionDiff?.fieldDiffs.length ?? 0;
    return {
      sectionName,
      identical: mismatchCount === 0,
      mismatchCount,
    };
  });

  return {
    identical: diff.identical,
    diff,
    sections,
    summary: formatGzstateDiff(diff),
  };
}

export function assertFullParity(wadLab: GzstateDocument, gzdoom: GzstateDocument): void {
  const result = runFullParity(wadLab, gzdoom);
  if (!result.identical) {
    throw new Error(result.summary);
  }
}
