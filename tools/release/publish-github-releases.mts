import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readVersionManifest } from './release-notes.mts';

const rootDir = process.cwd();
const manifest = readVersionManifest(rootDir);
const dryRun = process.argv.includes('--dry-run');
const onlyTag = readFlagValue('--tag');

const targets = onlyTag
  ? manifest.versions.filter((entry) => entry.tag === onlyTag)
  : manifest.versions;

if (targets.length === 0) {
  console.error('No release targets found.');
  process.exit(1);
}

for (const entry of targets) {
  const notesPath = path.join(rootDir, 'docs/releases', `${entry.tag}.github.md`);
  const notes = readFileSync(notesPath, 'utf8');
  const title = `doom-wad-lab ${entry.tag}: ${entry.title}`;

  if (dryRun) {
    console.log(`[dry-run] gh release create ${entry.tag} --target ${entry.sha} --title "${title}"`);
    continue;
  }

  const view = spawnSync('gh', ['release', 'view', entry.tag], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (view.status === 0) {
    const edit = spawnSync(
      'gh',
      ['release', 'edit', entry.tag, '--title', title, '--notes-file', notesPath],
      { cwd: rootDir, stdio: 'inherit' },
    );
    if (edit.status !== 0) {
      throw new Error(`Failed to update ${entry.tag}`);
    }
    console.log(`Updated GitHub release ${entry.tag}`);
    continue;
  }

  const create = spawnSync(
    'gh',
    [
      'release',
      'create',
      entry.tag,
      '--title',
      title,
      '--notes-file',
      notesPath,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  if (create.status !== 0) {
    throw new Error(`Failed to create ${entry.tag}`);
  }
  console.log(`Created GitHub release ${entry.tag}`);
}

function readFlagValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}
