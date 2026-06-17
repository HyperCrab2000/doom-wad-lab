/**
 * Mod stack GZSTATE parity — stock IWAD baselines always run; PWAD/PK3 fixtures skip when files missing.
 *
 *   npm run test:mod-parity
 *   MOD_CORPUS_REQUIRED=1 npm run test:mod-parity
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertFullParity,
  exportToGzstate,
  readGzstateFile,
} from '@hypercrab2000/doom-wad-core';

import {
  loadWadFromModStack,
  modStackFilesPresent,
  type ModFileStack,
} from '@/wad/mod/modFileStack';

const ROOT = process.cwd();
const STACKS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/gzrender-v2/mod-stacks.json'), 'utf8'),
) as ModFileStack[];
const ARTIFACTS = path.join(ROOT, 'artifacts/gzrender-v2/mod-corpus');
const REQUIRED = process.env.MOD_CORPUS_REQUIRED === '1';

function gzdoomGzstatePath(stackId: string, map: string): string {
  return path.join(ARTIFACTS, stackId, map, 'gzdoom.gzstate');
}

describe('mod stack GZSTATE parity', () => {
  for (const stack of STACKS) {
    if (stack.files.length > 0) continue;

    for (const map of stack.maps) {
      it(`${stack.id}/${map} matches GZDoom dump (IWAD baseline)`, () => {
        const gzPath = gzdoomGzstatePath(stack.id, map);
        if (!fs.existsSync(gzPath)) {
          if (REQUIRED) {
            throw new Error(
              `Missing ${gzPath} — run: npm run mod:parity -- ${stack.id}`,
            );
          }
          return;
        }
        if (!modStackFilesPresent(ROOT, stack)) return;

        const wad = loadWadFromModStack(ROOT, stack);
        const nodeDoc = exportToGzstate(wad, map);
        const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzPath)));
        assertFullParity(nodeDoc, gzdoomDoc);
      });
    }
  }

  it('documents PWAD fixture stacks in mod-stacks.json', () => {
    const fixtureStacks = STACKS.filter((s) => s.files.length > 0);
    expect(fixtureStacks.length).toBeGreaterThan(0);
    for (const stack of fixtureStacks) {
      expect(stack.id).toBeTruthy();
      expect(stack.maps.length).toBeGreaterThan(0);
    }
  });
});
