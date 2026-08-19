import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateReleaseNotes, resolvePreviousRef } from './release-notes.mts';

const rootDir = process.cwd();
const outputPath = process.argv[2] ?? 'deployment-notes.md';
const currentRef = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? 'HEAD';
const previousRef = resolvePreviousRef(
  rootDir,
  currentRef,
  process.env.PREVIOUS_RELEASE_TAG ?? null,
);

const notes = generateReleaseNotes({
  rootDir,
  fromRef: previousRef,
  toRef: currentRef,
});

await writeFile(path.resolve(rootDir, outputPath), notes.githubBody);
console.log(notes.githubBody);
