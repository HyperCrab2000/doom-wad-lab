import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateReleaseNotes, readVersionManifest } from './release-notes.mts';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs/releases');
const manifest = readVersionManifest(rootDir);
const rootCommit =
  readGit(['rev-list', '--max-parents=0', 'HEAD']) ??
  manifest.versions[0]?.sha ??
  'HEAD';

await mkdir(docsDir, { recursive: true });

const indexLines = [
  '# Release history',
  '',
  'Detailed release notes for every published version of **doom-wad-lab**.',
  'GitHub Releases use the `githubBody` from these docs; the full markdown lives here.',
  '',
  '| Version | Date | Summary |',
  '|---------|------|---------|',
];

for (let index = 0; index < manifest.versions.length; index++) {
  const entry = manifest.versions[index]!;
  const previousRef = index === 0 ? rootCommit : manifest.versions[index - 1]!.sha;
  const notes = generateReleaseNotes({
    rootDir,
    fromRef: previousRef,
    toRef: entry.sha,
    version: entry.tag,
    title: entry.title,
    summary: entry.summary,
  });

  const versionSlug = entry.tag.replace(/^v/, '');
  const docPath = path.join(docsDir, `${entry.tag}.md`);
  const githubPath = path.join(docsDir, `${entry.tag}.github.md`);

  await writeFile(docPath, notes.markdown);
  await writeFile(githubPath, notes.githubBody);

  const date = notes.commits.at(-1)?.date ?? notes.commits[0]?.date ?? '';
  const dateCell = date ? date.slice(0, 10) : '';
  indexLines.push(
    `| [${entry.tag}](./${entry.tag}.md) | ${dateCell} | ${entry.summary} |`,
  );

  console.log(`Wrote ${path.relative(rootDir, docPath)} (${notes.commits.length} commits)`);
}

indexLines.push(
  '',
  '## Generating notes',
  '',
  '```sh',
  '# Regenerate all historical docs from tools/release/version-manifest.json',
  'npm run release:backfill',
  '',
  '# Notes for the next unpublished version (working tree -> HEAD)',
  'npm run release:notes -- v0.11.0 "Release title" "One-line summary"',
  '```',
  '',
  'Every new `v*` tag must append an entry to `tools/release/version-manifest.json`,',
  'regenerate docs with `npm run release:backfill`, and publish through the Release workflow.',
  '',
);

await writeFile(path.join(docsDir, 'README.md'), `${indexLines.join('\n')}\n`);
console.log(`Wrote ${path.relative(rootDir, 'docs/releases/README.md')}`);

function readGit(args: string[]): string | null {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}
