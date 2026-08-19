import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type PackageJson = {
  name: string;
  version: string;
};

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const releasesDir = path.join(rootDir, 'releases');
const packageJson = JSON.parse(
  await readFile(path.join(rootDir, 'package.json'), 'utf8')
) as PackageJson;

const releaseRef =
  process.env.GITHUB_REF_NAME ?? process.env.CI_COMMIT_REF_NAME ?? process.env.CI_COMMIT_TAG ?? null;
const releaseVersion =
  process.env.RELEASE_VERSION ??
  versionFromTag(process.env.GITHUB_REF_NAME) ??
  versionFromTag(process.env.CI_COMMIT_TAG) ??
  packageJson.version;
const gitSha =
  process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? readGit(['rev-parse', '--short=12', 'HEAD']);
const createdAt = new Date().toISOString();
const archiveBase = `${packageJson.name}-v${releaseVersion}${gitSha ? `+${gitSha}` : ''}`;
const archiveName = `${archiveBase}.tgz`;
const archivePath = path.join(releasesDir, archiveName);

await assertDirectory(distDir);
await mkdir(releasesDir, { recursive: true });

const manifest = {
  name: packageJson.name,
  version: releaseVersion,
  gitSha,
  ref: releaseRef,
  createdAt,
  artifact: archiveName,
};

await writeFile(path.join(distDir, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const tarResult = spawnSync('tar', ['-czf', archivePath, '-C', distDir, '.'], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (tarResult.status !== 0) {
  throw new Error(`tar failed with exit code ${tarResult.status ?? 'unknown'}`);
}

const sha256 = await sha256File(archivePath);
await writeFile(
  `${archivePath}.sha256`,
  `${sha256}  ${archiveName}\n`
);

console.log(
  JSON.stringify(
    {
      ...manifest,
      archivePath: path.relative(rootDir, archivePath),
      sha256,
    },
    null,
    2
  )
);

async function assertDirectory(dir: string): Promise<void> {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`Missing ${path.relative(rootDir, dir)}. Run npm run build first.`);
  }
  const entries = await readdir(dir);
  if (entries.length === 0) {
    throw new Error(`${path.relative(rootDir, dir)} is empty. Run npm run build first.`);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function readGit(args: string[]): string | null {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function versionFromTag(tag: string | null | undefined): string | null {
  if (!tag?.startsWith('v')) return null;
  const version = tag.slice(1);
  return version.length > 0 ? version : null;
}
