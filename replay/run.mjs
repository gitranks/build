// The replay: for every step of every project in this folder, it writes the step's files from its commit into an
// empty folder, runs the step's check with each seed, and compares the SHA-256 of what the check printed with the
// one stored here. The stored files hold hashes, never the texts.
//
//   node replay/run.mjs                 every project, every language
//   node replay/run.mjs typescript      only these languages
//
// Python runs as "python", or as the command in REPLAY_PYTHON. It needs git, and a clone with every branch.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const only = process.argv.slice(2);
const RUNS = {
  typescript: [process.execPath],
  python: (process.env.REPLAY_PYTHON || 'python').split(' ').filter(Boolean),
};
const CHECK_TIMEOUT_MS = 60_000;
// Python writes UTF-8 whatever the system's code page, so a check prints the same bytes on every system.
const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

function git(args) {
  const run = spawnSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(run.stderr || run.error).trim()}`);
  return run.stdout;
}

// A step's files, byte for byte as the commit holds them: no checkout, so no line-end setting changes them.
function writeStep(commit, dir) {
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', commit]).toString('utf8').split('\0').filter(Boolean);
  for (const entry of entries) {
    const [meta, path] = entry.split('\t');
    const [, type, id] = meta.split(' ');
    if (type !== 'blob') continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), git(['cat-file', 'blob', id]));
  }
}

// What a check printed, as it is stored: LF line ends, no trailing spaces on a line, no blank lines at the end.
const normalized = (text) =>
  text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');

// Why a check's run is not a pass: it could not start, ran out of time, or ended with an error.
function howItEnded(run) {
  if (run.error && run.error.code !== 'ETIMEDOUT') return `could not start: ${run.error.code ?? run.error.message}`;
  if (run.status === null) return `no end within ${CHECK_TIMEOUT_MS / 1000} s`;
  return run.status === 0 ? 'another text' : `exit code ${run.status}`;
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function version(words) {
  const run = spawnSync(words[0], [...words.slice(1), '--version'], { encoding: 'utf8', windowsHide: true });
  return run.status === 0 ? (run.stdout || run.stderr).trim() : `not found (${words.join(' ')})`;
}

const files = readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((project) =>
    readdirSync(join(here, project.name))
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(here, project.name, name)),
  )
  .sort();
const replays = files
  .map((file) => JSON.parse(readFileSync(file, 'utf8')))
  .filter((replay) => !only.length || only.includes(replay.language));
if (!replays.length) {
  console.log(`No replay file${only.length ? ` for ${only.join(', ')}` : ''}.`);
  process.exit(1);
}

for (const language of new Set(replays.map((replay) => replay.language))) {
  console.log(`${language}: ${version(RUNS[language] ?? [language])}`);
}

const scratch = mkdtempSync(join(tmpdir(), 'replay-'));
let ran = 0;
let wrong = 0;
try {
  for (const replay of replays) {
    const words = RUNS[replay.language];
    if (!words) throw new Error(`${replay.project}: no way to run ${replay.language}`);
    for (const step of replay.steps) {
      const name = `${step.branch} step ${step.number} (${step.slug})`;
      const dir = mkdtempSync(join(scratch, 'step-'));
      writeStep(step.commit, dir);
      const failed = [];
      for (const { seed, sha256: expected } of step.cases) {
        const args = [...words.slice(1), replay.check, step.slug, seed];
        const options = { cwd: dir, env, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, windowsHide: true };
        const run = spawnSync(words[0], args, options);
        ran++;
        const printed = normalized(run.stdout ?? '');
        if (run.status === 0 && sha256(printed) === expected) continue;
        const how = howItEnded(run);
        failed.push({ seed, how, printed, stderr: (run.stderr ?? '').trim() });
      }
      if (!failed.length) {
        console.log(`ok       ${name}: ${step.cases.length} seeds`);
        continue;
      }
      wrong += failed.length;
      for (const { seed, how, printed, stderr } of failed) {
        console.log(`DIFFERS  ${name}, seed ${seed} (${how}). It printed:`);
        for (const line of (printed || '(nothing)').split('\n').slice(0, 40)) console.log(`    ${line}`);
        if (stderr) for (const line of stderr.split('\n').slice(-5)) console.log(`    stderr: ${line}`);
      }
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(wrong ? `${wrong} of ${ran} checks printed another text.` : `All ${ran} checks printed the expected text.`);
process.exit(wrong ? 1 : 0);
