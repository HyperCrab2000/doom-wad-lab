import { createHash } from 'node:crypto';

export type { BspGoldenCatalog, BspSnapshot } from './bspSnapshot';
export { snapshotFromBspVisible, snapshotFromDrawState } from './bspSnapshot';

import type { BspSnapshot } from './bspSnapshot';

/** SHA256 prefix for golden snapshot fixtures (Node/tests only). */
export function hashBspSnapshotSha256(snapshot: BspSnapshot): string {
  const payload = JSON.stringify(snapshot);
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** @deprecated Use hashBspSnapshotSha256 in Node; browser code uses bspSnapshot.hashBspSnapshot */
export const hashBspSnapshot = hashBspSnapshotSha256;
