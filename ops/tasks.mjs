// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cross-platform task runner. Single source for `make <task>` and `npm run <task>`
// (docs/spec/02_arquitectura.md §4.1). Usage: node ops/tasks.mjs <task>
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const VENV_PY = join(ROOT, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
const WEB = join(ROOT, 'web');

// Cloudflare Pages projects (docs/decisions.md D-45).
const CF_APP_PROJECT = process.env.CF_APP_PROJECT ?? 'aeroinformagicos-llsn';

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // On Windows, npm/npx/py are .cmd shims that need a shell; the arguments here are fixed strings.
  const viaShell = WIN && !cmd.endsWith('.exe');
  const res = viaShell
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', cwd: ROOT, shell: true, ...opts })
    : spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function venvPython() {
  if (!existsSync(VENV_PY)) {
    console.error('Python environment missing: run `make setup` (or `npm run setup`) first.');
    process.exit(1);
  }
  return VENV_PY;
}

function basePython() {
  if (process.env.PYTHON) return [process.env.PYTHON, []];
  if (WIN) return ['py', ['-3.12']];
  return ['python3.12', []];
}

const pytest = (markExpr) => run(venvPython(), ['-m', 'pytest', '-c', 'pipeline/pyproject.toml', '-m', markExpr]);
const cli = (...args) => run(venvPython(), ['-m', 'pipeline.cli', ...args]);
const hasContract = () => existsSync(join(ROOT, 'contract', 'schemas'));

const tasks = {
  setup() {
    if (!existsSync(VENV_PY)) {
      const [py, pre] = basePython();
      run(py, [...pre, '-m', 'venv', '.venv']);
    }
    run(VENV_PY, ['-m', 'pip', 'install', '--upgrade', 'pip']);
    run(VENV_PY, ['-m', 'pip', 'install', '-r', 'pipeline/requirements.txt']);
    run('npm', ['ci'], { cwd: WEB });
  },
  'setup-gpu'() {
    run(venvPython(), ['-m', 'pip', 'install', '-r', 'pipeline/requirements-gpu.txt']);
  },
  test() {
    pytest('not data and not slow');
    run('npx', ['vitest', 'run'], { cwd: WEB });
    if (hasContract()) cli('check-contract');
    else console.log('contract/schemas not present yet (T-02): schema validation skipped');
  },
  'test-all'() {
    pytest('');
    run('npx', ['vitest', 'run'], { cwd: WEB });
    if (hasContract()) cli('check-contract');
    if (existsSync(join(WEB, 'e2e')) && process.env.LLSN_SKIP_E2E !== '1') {
      run('npx', ['playwright', 'test', '--pass-with-no-tests'], { cwd: WEB });
    }
  },
  check() {
    run(venvPython(), ['-m', 'ruff', 'check', 'pipeline']);
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: WEB });
    if (hasContract()) cli('check-contract');
  },
  dev() {
    run('npx', ['vite'], { cwd: WEB });
  },
  build() {
    run('npm', ['run', 'build'], { cwd: WEB });
  },
  deploy() {
    if (!existsSync(join(WEB, 'dist', 'index.html'))) tasks.build();
    run('npx', ['wrangler', 'pages', 'deploy', 'dist', '--project-name', CF_APP_PROJECT, '--branch',
      process.env.CF_BRANCH ?? 'main'], { cwd: WEB });
  },
  info() {
    cli('info');
  },
  // Cost of the horizon cube with 4 chunks (08_mapa_polar.md §4). Optional: LAW=full|fast,
  // RING=<samples per block>, PTS_BATCH=<points per batch>; the device comes from LLSN_DEVICE.
  'cube-bench'() {
    const extra = [];
    if (process.env.LAW) extra.push('--law', process.env.LAW);
    if (process.env.RING) extra.push('--ring', process.env.RING);
    if (process.env.PTS_BATCH) extra.push('--pts-batch', process.env.PTS_BATCH);
    cli('cube', '--bench', ...extra);
  },
  'cube-plan'() {
    cli('cube-plan');
  },
  // Synthetic example data of the contract (09_contrato_datos.md §13, T-02): writes
  // contract/examples/data, copies it to web/public/data and writes web/public/config.json.
  examples() {
    run(venvPython(), ['contract/examples/make_examples.py']);
  },
};

const name = process.argv[2];
if (!name || !tasks[name]) {
  console.error(`Usage: node ops/tasks.mjs <${Object.keys(tasks).join('|')}>`);
  process.exit(2);
}
tasks[name]();
