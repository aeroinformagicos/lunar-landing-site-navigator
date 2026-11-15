// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
// Cross-platform task runner. Single source for `make <task>` and `npm run <task>`
// (docs/spec/02_arquitectura.md §4.1). Usage: node ops/tasks.mjs <task>
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
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

// Size budgets, gzip (02_arquitectura.md §7: main JavaScript ≤ 350 kB; 16_vista_3d.md §12.3: the 3D
// view's extra JavaScript ≤ 1.5 MB). Decimal kB and MB, the stricter reading.
const MAIN_JS_BUDGET = 350_000;
const VIEW3D_BUDGET = 1_500_000;
const VIEW3D_ENTRY = 'src/ui/stage3d/index.tsx';

// Gzip sizes of the built web from Vite's manifest (`dist/.vite/manifest.json`): `main` = the entry
// chunk of index.html and every chunk it imports statically; `view3d` = the dynamic chunk of the 3D
// view and its static imports that are not already in `main`, plus the mesh worker's own file.
function bundleSizes(dist) {
  const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8'));
  const gz = (file) => gzipSync(readFileSync(join(dist, file))).length;
  const closure = (key, into) => {
    const c = manifest[key];
    if (!c || into.has(key)) return into;
    into.add(key);
    for (const k of c.imports ?? []) closure(k, into);
    return into;
  };
  const entry = Object.keys(manifest).find((k) => manifest[k].isEntry);
  const main = closure(entry, new Set());
  const sum = (keys) => [...keys].reduce((s, k) => s + gz(manifest[k].file), 0);
  if (!manifest[VIEW3D_ENTRY]) return { main: sum(main), view3d: 0 };
  const view = [...closure(VIEW3D_ENTRY, new Set())].filter((k) => !main.has(k));
  const workers = readdirSync(join(dist, 'assets')).filter((f) => /^mesh\.worker-.*\.js$/.test(f));
  return { main: sum(main), view3d: sum(view) + workers.reduce((s, f) => s + gz(`assets/${f}`), 0) };
}

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
      // Playwright serves `web/dist` with `vite preview`: build it first so the tests never run on a stale one.
      tasks.build();
      run('npx', ['playwright', 'test', '--pass-with-no-tests'], { cwd: WEB });
    }
  },
  check() {
    run(venvPython(), ['-m', 'ruff', 'check', 'pipeline']);
    run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: WEB });
    if (hasContract()) cli('check-contract');
    tasks['check-size']();
  },
  // Size budgets of the web (02_arquitectura.md §7, 16_vista_3d.md §12.3, T-73): builds the web with
  // its manifest (a few seconds) and checks the gzip size of the main JavaScript and of the 3D chunk.
  'check-size'() {
    run('npx', ['vite', 'build', '--manifest', '--logLevel', 'warn'], { cwd: WEB });
    const r = bundleSizes(join(WEB, 'dist'));
    const kb = (b) => `${(b / 1000).toFixed(1)} kB`;
    console.log(`Main JavaScript (entry and its static imports), gzip: ${kb(r.main)} (budget ${kb(MAIN_JS_BUDGET)})`);
    console.log(`3D view (three.js, the stage3d chunk and the mesh worker), gzip: ${kb(r.view3d)} (budget ${kb(VIEW3D_BUDGET)})`);
    const over = [];
    if (r.main > MAIN_JS_BUDGET) over.push(`main JavaScript ${kb(r.main)} > ${kb(MAIN_JS_BUDGET)}`);
    if (r.view3d > VIEW3D_BUDGET) over.push(`3D view ${kb(r.view3d)} > ${kb(VIEW3D_BUDGET)}`);
    if (r.view3d === 0) over.push('the 3D chunk (src/ui/stage3d/index.tsx) is missing from the build');
    if (over.length) {
      console.error(`Size budget exceeded: ${over.join('; ')}`);
      process.exit(1);
    }
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
  // validation_report.json in web/public/data from $LLSN_DATA_DIR/out/test_results (written by the
  // case tests: run `make test` or `make test-all` first) and docs/manual_checks.json (11 §7.1, T-22).
  report() {
    cli('report');
  },
  // Site masks, profiles and sites.json in the batch order of 04_catalogo_sitios.md §6, published to
  // web/public/data after each site (T-09; run by I3 in T-21). Sites whose files already exist are
  // kept. SITES=<id,id> computes only those; FORCE=1 recomputes; NO_PUBLISH=1 leaves web/public/data.
  sites() {
    const extra = [];
    if (envVar('SITES')) extra.push('--sites', envVar('SITES'));
    if (envVar('FORCE') === '1') extra.push('--force');
    if (envVar('NO_PUBLISH') === '1') extra.push('--no-publish');
    cli('sites', ...extra);
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
  // Map layers (08_mapa_polar.md §5, §6; T-28) into $LLSN_DATA_DIR/out/heavy: map/regions.json, the
  // hillshade and the 500 m heights from P2, then the layers of every chunk in cube/done.bin with
  // map/grid.json (resumable: run it again to finish; chunks already done are kept). FORCE=1
  // recomputes every chunk; SOURCE=nasa_avgvisib writes the NASA layers of plan B-4 (08 §9) instead;
  // the device comes from LLSN_DEVICE (PyTorch, GPU if any).
  layers() {
    cli('regions');
    cli('hillshade');
    const extra = [];
    if (envVar('SOURCE')) extra.push('--source', envVar('SOURCE'));
    if (envVar('FORCE') === '1') extra.push('--force');
    cli('layers', ...extra);
  },
  // Compact masks for the optimal-site worker (09 §11; T-34) from the cube into
  // $LLSN_DATA_DIR/out/heavy/compact: regions.bin.gz (every region point must be in the cube) and
  // overview.bin.gz (1 point in 4 per direction; points not computed yet are left out). < 5 min.
  compact() {
    cli('compact', '--overview');
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
