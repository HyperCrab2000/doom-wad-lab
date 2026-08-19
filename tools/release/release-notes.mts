import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CommitCategory =
  | 'feature'
  | 'fix'
  | 'ci'
  | 'docs'
  | 'refactor'
  | 'test'
  | 'renderer'
  | 'gameplay'
  | 'infra'
  | 'other';

export type CommitInfo = {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  category: CommitCategory;
};

export type ReleaseNotesInput = {
  fromRef: string;
  toRef: string;
  version?: string;
  title?: string;
  summary?: string;
  rootDir?: string;
};

export type ReleaseNotesOutput = {
  markdown: string;
  githubBody: string;
  commits: CommitInfo[];
  range: string;
  compareUrl: string | null;
  fileStats: string;
};

const CATEGORY_LABELS: Record<CommitCategory, string> = {
  feature: 'Features',
  fix: 'Fixes',
  ci: 'CI / Testing',
  docs: 'Documentation',
  refactor: 'Refactoring',
  test: 'Tests',
  renderer: 'Renderer',
  gameplay: 'Gameplay',
  infra: 'Infrastructure',
  other: 'Other',
};

const CATEGORY_ORDER: CommitCategory[] = [
  'renderer',
  'gameplay',
  'feature',
  'fix',
  'test',
  'ci',
  'docs',
  'infra',
  'refactor',
  'other',
];

export function generateReleaseNotes(input: ReleaseNotesInput): ReleaseNotesOutput {
  const rootDir = input.rootDir ?? process.cwd();
  const range = `${input.fromRef}..${input.toRef}`;
  const commits = readCommits(rootDir, range);
  const fileStats = readGit(rootDir, ['diff', '--stat', '--summary', range]) ?? '';
  const compareUrl = githubCompareUrl(input.fromRef, input.toRef);
  const toMeta = readCommitMeta(rootDir, input.toRef);

  const markdown = buildMarkdown({
    ...input,
    range,
    commits,
    fileStats,
    compareUrl,
    toDate: toMeta?.date,
    toSha: toMeta?.shortHash ?? input.toRef.slice(0, 12),
  });
  const githubBody = buildGithubBody({
    ...input,
    range,
    commits,
    compareUrl,
    toDate: toMeta?.date,
    toSha: toMeta?.shortHash ?? input.toRef.slice(0, 12),
  });

  return {
    markdown,
    githubBody,
    commits,
    range,
    compareUrl,
    fileStats,
  };
}

function buildMarkdown(params: {
  version?: string;
  title?: string;
  summary?: string;
  range: string;
  commits: CommitInfo[];
  fileStats: string;
  compareUrl: string | null;
  toDate?: string;
  toSha?: string;
}): string {
  const lines: string[] = [];
  const heading = params.version
    ? `# Release ${params.version}${params.title ? `: ${params.title}` : ''}`
    : '# Deployment Changes';

  lines.push(heading, '');
  if (params.summary) {
    lines.push(params.summary, '');
  }
  lines.push('## Metadata', '');
  if (params.version) lines.push(`- **Version:** \`${params.version}\``);
  if (params.toSha) lines.push(`- **Commit:** \`${params.toSha}\``);
  if (params.toDate) lines.push(`- **Date:** ${params.toDate}`);
  lines.push(`- **Range:** \`${params.range}\``);
  if (params.compareUrl) lines.push(`- **Compare:** ${params.compareUrl}`);
  lines.push('');

  appendCategorySections(lines, params.commits, { includeBodies: true, includeAuthors: true });

  if (params.fileStats.trim()) {
    lines.push('## Files changed', '', '```', params.fileStats.trim(), '```', '');
  }

  lines.push('## Full commit log', '');
  for (const commit of params.commits) {
    lines.push(`- \`${commit.shortHash}\` ${commit.subject}`);
    if (commit.body.trim()) {
      for (const bodyLine of commit.body.trim().split('\n')) {
        lines.push(`  ${bodyLine}`);
      }
    }
  }
  lines.push('');

  return lines.join('\n');
}

function buildGithubBody(params: {
  version?: string;
  title?: string;
  summary?: string;
  range: string;
  commits: CommitInfo[];
  compareUrl: string | null;
  toDate?: string;
  toSha?: string;
}): string {
  const lines: string[] = [];

  if (params.summary) {
    lines.push(params.summary, '');
  }

  if (params.toSha || params.toDate) {
    lines.push(
      `**Commit:** \`${params.toSha ?? 'unknown'}\`${params.toDate ? ` · **Date:** ${params.toDate}` : ''}`,
      '',
    );
  }

  appendCategorySections(lines, params.commits, { includeBodies: true, includeAuthors: false });

  if (params.compareUrl) {
    lines.push('---', '', `[Full compare for ${params.range}](${params.compareUrl})`, '');
  }

  return lines.join('\n').trim() + '\n';
}

function appendCategorySections(
  lines: string[],
  commits: CommitInfo[],
  options: { includeBodies: boolean; includeAuthors: boolean },
): void {
  const grouped = groupCommits(commits);
  let wroteAny = false;

  for (const category of CATEGORY_ORDER) {
    const bucket = grouped.get(category);
    if (!bucket?.length) continue;
    wroteAny = true;
    lines.push(`## ${CATEGORY_LABELS[category]}`, '');
    for (const commit of bucket) {
      const suffix = options.includeAuthors ? ` — ${commit.author}` : '';
      lines.push(`- **${commit.subject}** (\`${commit.shortHash}\`)${suffix}`);
      if (options.includeBodies && commit.body.trim()) {
        for (const bodyLine of commit.body.trim().split('\n')) {
          lines.push(`  - ${bodyLine.trim()}`);
        }
      }
    }
    lines.push('');
  }

  if (!wroteAny) {
    lines.push('## Changes', '', '- No commits found in range.', '');
  }
}

function groupCommits(commits: CommitInfo[]): Map<CommitCategory, CommitInfo[]> {
  const grouped = new Map<CommitCategory, CommitInfo[]>();
  for (const commit of commits) {
    const bucket = grouped.get(commit.category) ?? [];
    bucket.push(commit);
    grouped.set(commit.category, bucket);
  }
  return grouped;
}

function readCommits(rootDir: string, range: string): CommitInfo[] {
  const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%aI%x1e';
  const raw =
    readGit(rootDir, ['log', '--no-merges', `--pretty=format:${format}`, range]) ?? '';
  if (!raw.trim()) return [];

  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, body, author, date] = line.split('\x1f');
      return {
        hash: hash ?? '',
        shortHash: shortHash ?? '',
        subject: subject ?? '(no subject)',
        body: body ?? '',
        author: author ?? '',
        date: date ?? '',
        category: categorizeCommit(subject ?? '', body ?? ''),
      };
    });
}

function readCommitMeta(
  rootDir: string,
  ref: string,
): { shortHash: string; date: string } | null {
  const raw = readGit(rootDir, ['log', '-1', '--pretty=format:%h%x1f%aI', ref]);
  if (!raw) return null;
  const [shortHash, date] = raw.split('\x1f');
  return { shortHash, date };
}

function categorizeCommit(subject: string, body: string): CommitCategory {
  const safeSubject = subject || '(no subject)';
  const text = `${safeSubject} ${body}`.toLowerCase();

  if (/^(fix|repair|correct|resolve|hotfix)\b/.test(safeSubject.toLowerCase())) return 'fix';
  if (/^(add|implement|introduce|wire|restore|enable)\b/.test(safeSubject.toLowerCase())) {
    if (/renderer|webgl|bsp|draw|flat|wall|sprite|sky|colormap|shader/.test(text)) {
      return 'renderer';
    }
    if (/gameplay|pickup|inventory|hud|menu|cheat|monster|combat|teleport|exit/.test(text)) {
      return 'gameplay';
    }
    return 'feature';
  }
  if (/^(improve|tighten|narrow|refine|optimize|stabilize|harden)\b/.test(safeSubject.toLowerCase())) {
    if (/renderer|webgl|bsp|draw|parity|colormap/.test(text)) return 'renderer';
    if (/ci|coverage|smoke|puppeteer|workflow|deploy|gitlab|github actions/.test(text)) {
      return 'ci';
    }
    return 'feature';
  }
  if (/^(skip|ignore)\b/.test(safeSubject.toLowerCase()) && /ci|test|e2e|smoke/.test(text)) {
    return 'ci';
  }
  if (/test|vitest|parity gate|coverage/.test(text)) return 'test';
  if (/readme|docs|bible|chronicle|documentation/.test(text)) return 'docs';
  if (/terraform|aws|cloudfront|s3|deploy pipeline|bootstrap/.test(text)) return 'infra';
  if (/refactor|extract|move|cleanup|clean up|organize/.test(text)) return 'refactor';
  if (/renderer|webgl|bsp|draw pipeline|gzrender|gzdoom|colormap|shader/.test(text)) {
    return 'renderer';
  }
  if (/gameplay|pickup|inventory|hud|menu|cheat|monster|combat/.test(text)) return 'gameplay';
  if (/ci|workflow|smoke test|puppeteer|coverage/.test(text)) return 'ci';
  return 'other';
}

function readGit(rootDir: string, args: string[]): string | null {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function githubCompareUrl(base: string, head: string): string | null {
  const repo = process.env.GITHUB_REPOSITORY ?? readRemoteRepo(process.cwd());
  if (!repo) return null;
  return `https://github.com/${repo}/compare/${base}...${head}`;
}

function readRemoteRepo(rootDir: string): string | null {
  const raw = readGit(rootDir, ['remote', 'get-url', 'origin']);
  if (!raw) return null;
  const sshMatch = raw.match(/git@[^:]+:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = raw.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  return null;
}

export function readVersionManifest(rootDir: string): {
  versions: Array<{
    tag: string;
    sha: string;
    title: string;
    summary: string;
  }>;
} {
  const manifestPath = path.join(rootDir, 'tools/release/version-manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    versions: Array<{
      tag: string;
      sha: string;
      title: string;
      summary: string;
    }>;
  };
}

export function resolvePreviousRef(
  rootDir: string,
  currentRef: string,
  explicitPrevious?: string | null,
): string {
  if (explicitPrevious) return explicitPrevious;

  const manifest = readVersionManifest(rootDir);
  const currentIndex = manifest.versions.findIndex(
    (entry) => entry.sha.startsWith(currentRef) || entry.tag === currentRef,
  );
  if (currentIndex > 0) {
    return manifest.versions[currentIndex - 1]!.sha;
  }

  const tagBefore =
    readGit(rootDir, ['describe', '--tags', '--abbrev=0', `${currentRef}^`]) ??
    readGit(rootDir, ['describe', '--tags', '--abbrev=0', currentRef]);
  if (tagBefore) return tagBefore;

  return (
    readGit(rootDir, ['rev-list', '--max-parents=0', currentRef]) ?? `${currentRef}^`
  );
}
