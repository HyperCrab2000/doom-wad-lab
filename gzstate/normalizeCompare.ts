import type { GzstateDocument, GzstateLumpCatalogEntry } from '../types';

export function resolveStringIndex(doc: GzstateDocument, index: number): string {
  return doc.strings[index] ?? '';
}

export function resolvedStringList(doc: GzstateDocument, indices: number[]): string[] {
  return indices.map((index) => resolveStringIndex(doc, index));
}

export function normalizedLumpCatalog(doc: GzstateDocument): GzstateLumpCatalogEntry[] {
  return [...doc.lumpCatalog].sort((a, b) =>
    resolveStringIndex(doc, a.nameIndex).localeCompare(resolveStringIndex(doc, b.nameIndex)),
  );
}

export function normalizedLumpCatalogKeys(doc: GzstateDocument): string[] {
  return normalizedLumpCatalog(doc).map((entry) => resolveStringIndex(doc, entry.nameIndex));
}

export function normalizedNameList(doc: GzstateDocument, indices: number[]): string[] {
  return resolvedStringList(doc, indices).sort((a, b) => a.localeCompare(b));
}
