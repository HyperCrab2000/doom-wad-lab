import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReleaseNotes, readVersionManifest, resolvePreviousRef } from './release-notes.mts';

const rootDir = process.cwd();
const versionTag = process.argv[2];
let title = process.argv[3] ?? '';
let summary = process.argv[4] ?? '';
const currentRef = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? 'HEAD';

if (!versionTag?.startsWith('v')) {
  console.error('Usage: npx tsx tools/release/write-release-notes.mts vX.Y.Z ["Title"] ["Summary"]');
  process.exit(1);
}

const manifestEntry = readVersionManifest(process.cwd()).versions.find(
  (entry) => entry.tag === versionTag,
);
if (!title && manifestEntry) title = manifestEntry.title;
if (!summary && manifestEntry) summary = manifestEntry.summary;

const previousRef = resolvePreviousRef(rootDir, currentRef, process.env.PREVIOUS_RELEASE_TAG ?? null);
const notes = generateReleaseNotes({
  rootDir,
  fromRef: previousRef,
  toRef: currentRef,
  version: versionTag,
  title,
  summary,
});

const docsDir = path.join(rootDir, 'docs/releases');
await mkdir(docsDir, { recursive: true });

const docPath = path.join(docsDir, `${versionTag}.md`);
const githubDocPath = path.join(docsDir, `${versionTag}.github.md`);
const releaseNotesPath = path.join(rootDir, 'release-notes.md');

await writeFile(docPath, notes.markdown);
await writeFile(githubDocPath, notes.githubBody);
await writeFile(releaseNotesPath, notes.githubBody);

console.log(`Wrote ${path.relative(rootDir, docPath)}`);
console.log(`Wrote ${path.relative(rootDir, githubDocPath)}`);
console.log(`Wrote ${path.relative(rootDir, releaseNotesPath)}`);
