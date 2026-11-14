// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cross-platform task runner. Single source for `make <task>` and `npm run <task>`
// (docs/spec/02_arquitectura.md §4.1). Usage: node ops/tasks.mjs <task>
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const VENV_PY = join(ROOT, '.venv', WIN ? 'Scripts/python.exe' : 'bin/python');
const WEB = join(ROOT, 'web');

// Cloudflare Pages projects (docs/decisions.md D-45).
const CF_APP_PROJECT = process.env.CF_APP_PROJECT ?? 'aeroinformagicos-llsn';
const CF_DATA_PROJECT = process.env.CF_DATA_PROJECT ?? 'aeroinformagicos-llsn-data';
// Cloudflare Pages limits on the free plan (02_arquitectura.md §6.2): files per site and bytes per file.
const CF_MAX_FILES = 20000;
const CF_MAX_FILE_BYTES = 25 * 1024 * 1024;
// Heavy origin: any site may read it (02_arquitectura.md §6.2, CORS).
const HEAVY_HEADERS = '/*\n  Access-Control-Allow-Origin: *\n';

// Data folder outside the repository (decision D-44): $LLSN_DATA_DIR, else ./data.
const dataDir = () => (process.env.LLSN_DATA_DIR ? resolve(process.env.LLSN_DATA_DIR) : join(ROOT, 'data'));
// An environment variable counts only if it is set and not empty (make exports empty ones too).
const envVar = (name) => (process.env[name] ? process.env[name].trim() : '') || undefined;

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

// 2026-11-14T23:30:05.123Z -> 20261114T233005Z
const utcStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// Run `node ops/tasks.mjs <task>` as a child, showing its output and copying it to `logPath`.
// Resolves to the exit code.
function runTaskLogged(task, env, logPath) {
  return new Promise((resolveExit) => {
    const log = createWriteStream(logPath, { flags: 'a' });
    const child = spawn(process.execPath, [join(ROOT, 'ops', 'tasks.mjs'), task], {
      cwd: ROOT,
      env: { ...process.env, ...env, PYTHONUNBUFFERED: '1' },
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { process.stdout.write(d); log.write(d); });
    child.stderr.on('data', (d) => { process.stderr.write(d); log.write(d); });
    child.on('error', (err) => { log.write(`${err}\n`); log.end(() => resolveExit(1)); });
    child.on('close', (code, signal) => log.end(() => resolveExit(code ?? (signal ? 1 : 0))));
  });
}

// Files under `dir` (relative paths with '/'), sorted, with their sizes.
function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) out.push({ path: relative(dir, p).split('\\').join('/'), bytes: statSync(p).size });
    }
  };
  walk(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

// Set heavy_base_url in a config.json of the web, keeping its other keys (09_contrato_datos.md §1).
function writeHeavyBaseUrl(path, url) {
  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { data_base_url: 'data' };
  config.heavy_base_url = url;
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

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
  // Hourly ephemeris table into web/public/data (05_efemerides.md §4.4, T-06); < 1 min.
  // SAMPLE=1 also rewrites tests/golden/ephem_sample.json.
  ephem() {
    cli('ephem', ...(envVar('SAMPLE') === '1' ? ['--write-sample'] : []));
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
  // The horizon cube into $LLSN_DATA_DIR/out/heavy/cube (08_mapa_polar.md §2, T-25). Resumable: run
  // it again to finish. LEVELS=1|2,3,4 (default all), SHARD=k/n (default 0/1), LAW=full|fast
  // (default full, decision D-59), RING and PTS_BATCH as in cube-bench; device from LLSN_DEVICE.
  cube() {
    const extra = [];
    for (const [name, flag] of [['LEVELS', '--levels'], ['SHARD', '--shard'], ['LAW', '--law'],
      ['RING', '--ring'], ['PTS_BATCH', '--pts-batch']]) {
      if (envVar(name)) extra.push(flag, envVar(name));
    }
    cli('cube', ...extra);
  },
  // Unattended night chain (T-25): `make cube LEVELS=2,3,4`, then `make layers`. Stops at the first
  // failure. Each step's output goes to $LLSN_DATA_DIR/out/logs/night-<UTC>-<n>-<step>.log and the
  // start, end and exit code of each step to night-<UTC>.log.
  async night() {
    const logs = join(dataDir(), 'out', 'logs');
    mkdirSync(logs, { recursive: true });
    const stamp = utcStamp();
    const summary = join(logs, `night-${stamp}.log`);
    const note = (line) => {
      const text = `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')} ${line}`;
      console.log(`[night] ${text}`);
      writeFileSync(summary, `${text}\n`, { flag: 'a' });
    };
    const steps = [
      { task: 'cube', env: { LEVELS: '2,3,4' } },
      { task: 'layers', env: {} },
    ];
    if (!tasks.layers) note('WARNING: `make layers` does not exist yet (T-28): the chain will stop after the cube');
    note(`start: ${steps.map((s) => s.task).join(' -> ')}; law ${envVar('LAW') ?? 'full (default, D-59)'}`);
    for (const [n, step] of steps.entries()) {
      const label = `${n + 1}-${step.task}`;
      const stepLog = join(logs, `night-${stamp}-${label}.log`);
      const shown = Object.entries(step.env).map(([k, v]) => `${k}=${v} `).join('');
      note(`step ${label}: ${shown}make ${step.task} (output in ${stepLog})`);
      const t0 = Date.now();
      const code = tasks[step.task] ? await runTaskLogged(step.task, step.env, stepLog) : 1;
      if (!tasks[step.task]) writeFileSync(stepLog, `make ${step.task} does not exist yet\n`);
      const minutes = ((Date.now() - t0) / 60000).toFixed(1);
      if (code !== 0) {
        note(`step ${label} FAILED with exit code ${code} after ${minutes} min; chain stopped`);
        process.exit(code);
      }
      note(`step ${label} finished in ${minutes} min`);
    }
    note('night chain finished');
  },
  // Publish $LLSN_DATA_DIR/out/heavy (heavy origin: cube, layers, map) to Cloudflare Pages
  // (02_arquitectura.md §6.2, D-45), with a `_headers` file that opens CORS, then write its URL as
  // heavy_base_url in web/public/config.json (and web/dist/config.json if built). DRY_RUN=1 lists the
  // files and the `_headers` file and uploads or writes nothing. HEAVY_BASE_URL overrides the URL.
  'deploy-heavy'() {
    const dryRun = envVar('DRY_RUN') === '1';
    const heavy = join(dataDir(), 'out', 'heavy');
    const url = envVar('HEAVY_BASE_URL') ?? `https://${CF_DATA_PROJECT}.pages.dev`;
    if (!existsSync(heavy)) {
      console.error(`Nothing to publish: ${heavy} does not exist (make cube, make layers).`);
      process.exit(1);
    }
    const files = listFiles(heavy).filter((f) => f.path !== '_headers');
    const errors = [];
    const tmp = files.filter((f) => f.path.endsWith('.tmp'));
    if (tmp.length) {
      errors.push(`${tmp.length} unfinished .tmp files (${tmp[0].path}, ...): a computation is running or was `
        + 'interrupted; finish it (run the same command again) before publishing');
    }
    const big = files.filter((f) => f.bytes > CF_MAX_FILE_BYTES);
    for (const f of big) errors.push(`${f.path}: ${mb(f.bytes)} is over the 25 MiB per file limit`);
    if (files.length + 1 > CF_MAX_FILES) errors.push(`${files.length + 1} files: over the ${CF_MAX_FILES} limit`);

    for (const f of files) console.log(`  ${f.path}  ${f.bytes} B`);
    const total = files.reduce((s, f) => s + f.bytes, 0);
    const byDir = {};
    for (const f of files) {
      const top = f.path.includes('/') ? f.path.split('/')[0] : '.';
      byDir[top] = (byDir[top] ?? 0) + 1;
    }
    console.log(`${files.length} files, ${mb(total)} in ${heavy} `
      + `(${Object.entries(byDir).map(([d, n]) => `${d}: ${n}`).join(', ')}), plus _headers:`);
    console.log(HEAVY_HEADERS.trimEnd().split('\n').map((l) => `  | ${l}`).join('\n'));
    console.log(`Cloudflare Pages project ${CF_DATA_PROJECT}; heavy_base_url = ${url}`);
    if (errors.length) {
      for (const e of errors) console.error(`ERROR: ${e}`);
      process.exit(1);
    }
    const configs = [join(WEB, 'public', 'config.json'), join(WEB, 'dist', 'config.json')]
      .filter((p, i) => i === 0 || existsSync(p));
    if (dryRun) {
      console.log(`DRY_RUN=1: nothing uploaded; _headers and ${configs.map((p) => relative(ROOT, p)).join(', ')} `
        + 'not written');
      return;
    }
    writeFileSync(join(heavy, '_headers'), HEAVY_HEADERS);
    // On Windows `run` goes through the shell: quote the path in case the data folder has spaces.
    run('npx', ['wrangler', 'pages', 'deploy', WIN ? `"${heavy}"` : heavy, '--project-name', CF_DATA_PROJECT, '--branch', 'main',
      '--commit-dirty=true'], { cwd: WEB });
    for (const p of configs) {
      writeHeavyBaseUrl(p, url);
      console.log(`heavy_base_url = ${url} written to ${relative(ROOT, p)}`);
    }
    console.log('Commit web/public/config.json so that the next deployment of the app uses it (T-39).');
  },
  // JPL Horizons reference values of cases A1 and A2 into tests/golden (11_validacion.md §2, T-05),
  // then cases A1 and A2 against them. Needs network; 2-4 min. A1 reviews the files before merging.
  golden() {
    run(venvPython(), ['ops/fetch_golden.py']);
    run(venvPython(), ['-m', 'pytest', '-c', 'pipeline/pyproject.toml', '-s',
      'pipeline/tests/test_a1_horizons.py', 'pipeline/tests/test_a2_riseset.py']);
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
Promise.resolve(tasks[name]()).catch((err) => {
  console.error(err);
  process.exit(1);
});
