/**
 * Regression suite for the shared cluster environment (app/cluster-env.sh).
 *
 * The per-wrapper copy-pasted lmod / OpenMPI / LD_LIBRARY_PATH block drifted:
 * fubar.sh and bstill.sh kept a dead openmpi/gnu/3.1.6 load and every FUBAR
 * job failed in production with "libmpi.so.40: cannot open shared object
 * file" (#504). The environment now lives in ONE sourced file, and this suite
 * pins that:
 *
 *   A. static   -- every wrapper sources app/cluster-env.sh through the exact
 *                  canonical locator block, nothing re-inlines module loads or
 *                  library paths, every srun line uses the LD pin idiom.
 *   B. behavior -- app/cluster-env.sh executed under bash in a temp dir:
 *                  silverback defaults, site-override precedence, lmod absent,
 *                  the locator anchors (cwd / SLURM_SUBMIT_DIR / PBS_O_WORKDIR /
 *                  BASH_SOURCE) and fail-loud when the file cannot be found.
 *
 * Runs without a cluster (GitHub Actions ubuntu): no lmod, no /opt/ohpc.
 * Temp files live under os.tmpdir(); this is not an MPI test.
 */
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const SHARED = path.join(APP, 'cluster-env.sh');
const EXAMPLE = path.join(APP, 'cluster-env.local.example');

// Silverback defaults, written out as the legacy per-wrapper literal.
const OMPI_LIB = '/opt/ohpc/pub/mpi/openmpi5-gnu14/5.0.7/lib';
const UCX_LIB = '/opt/ohpc/pub/mpi/ucx-ohpc/1.18.0/lib';
const DEFAULT_MPI_LIB_PATH = `${OMPI_LIB}:${UCX_LIB}`;
// legacy: export LD_LIBRARY_PATH=<ompi>:<ucx>:$LD_LIBRARY_PATH:/usr/lib64
const legacyLd = (inherited) => `${OMPI_LIB}:${UCX_LIB}:${inherited}:/usr/lib64`;

const SRUN_PIN = '/usr/bin/env LD_LIBRARY_PATH="$MPI_LIB_PATH:$LD_LIBRARY_PATH"';

// The canonical locator block. PROFILE is the only per-file variation.
// Plain strings (not template literals) because the block is full of ${...}.
const CANONICAL = [
  '# >>> cluster-env (canonical block, pinned verbatim by test/cluster-env.test.js; never edit per wrapper)',
  '# PATH, modules and the OpenMPI/UCX LD_LIBRARY_PATH pin live in app/cluster-env.sh;',
  '# per-site overrides in app/cluster-env.local.sh (gitignored). sbatch/qsub run a',
  '# spooled copy of this script, so $0/BASH_SOURCE are NOT the repo there: anchor on cwd=.',
  'if [ -n "$cwd" ]; then DM_APP_DIR="$cwd/.."',
  'elif [ -n "$SLURM_SUBMIT_DIR" ]; then DM_APP_DIR="$SLURM_SUBMIT_DIR/../.."',
  'elif [ -n "$PBS_O_WORKDIR" ]; then DM_APP_DIR="$PBS_O_WORKDIR/../.."',
  'else DM_APP_DIR="${BASH_SOURCE[0]%/*}/.."',
  'fi',
  'if [ ! -f "$DM_APP_DIR/cluster-env.sh" ]; then',
  '  echo "Error: cluster-env: $DM_APP_DIR/cluster-env.sh not found (cwd=\'$cwd\' SLURM_SUBMIT_DIR=\'$SLURM_SUBMIT_DIR\' PBS_O_WORKDIR=\'$PBS_O_WORKDIR\')" >&2',
  '  DM_STATUS_FN="${sfn:-${fn:+${fn}_status}}"',
  '  if [ -n "$DM_STATUS_FN" ]; then echo "Error" > "$DM_STATUS_FN"; fi',
  '  exit 1',
  'fi',
  '. "$DM_APP_DIR/cluster-env.sh" PROFILE',
  '# <<< cluster-env',
].join('\n');
const canonicalFor = (profile) => CANONICAL.replace(/ PROFILE$/m, ` ${profile}`);

// Every app/*/*.sh must be in exactly one of these two maps.
const SOURCES = {
  'absrel/absrel.sh': 'mpi',
  'bgm/bgm.sh': 'mpi',
  'bstill/bstill.sh': 'mpi',
  'busted/busted_submit.sh': 'mpi',
  'contrast-fel/cfel.sh': 'mpi',
  'fade/fade.sh': 'mpi',
  'fel/fel.sh': 'mpi',
  'fubar/fubar.sh': 'mpi',
  'gard/gard.sh': 'mpi',
  'meme/meme.sh': 'mpi',
  'multihit/multihit.sh': 'mpi',
  'nrm/nrm.sh': 'mpi',
  'prime/prime.sh': 'mpi',
  'relax/relax.sh': 'mpi',
  'slac/slac.sh': 'mpi',
  'hivtrace/hivtrace_submit.sh': 'base',
};
const EXEMPT = {
  'axomeme/axomeme.sh':
    'Node/ONNX CLI; header documents no lmod/MPI/srun by design; sourcing would add module loads/LD prefix to onnxruntime-node = not equivalent',
  'difFubar/difFubar.sh':
    'Julia, no MPI/srun; uses source /etc/profile + JULIA_*; local mode is positional with no cwd and is executed by test/difFubar*.test.js on CI, which parse its stdout',
};

// Ordered srun -n arguments per wrapper (live lines only).
const SRUN_N = {
  'fubar/fubar.sh': ['1'],
  'bgm/bgm.sh': ['$PROCS', '$PROCS'],
  'fel/fel.sh': ['$PROCS', '$PROCS'],
  'meme/meme.sh': ['$PROCS', '$PROCS'],
  'absrel/absrel.sh': ['$PROCS'],
  'bstill/bstill.sh': ['$PROCS'],
  'busted/busted_submit.sh': ['$PROCS'],
  'contrast-fel/cfel.sh': ['$PROCS'],
  'fade/fade.sh': ['$PROCS'],
  'gard/gard.sh': ['$PROCS'],
  'multihit/multihit.sh': ['$PROCS'],
  'nrm/nrm.sh': ['$PROCS'],
  'prime/prime.sh': ['$PROCS'],
  'relax/relax.sh': ['$PROCS'],
  'slac/slac.sh': ['$PROCS'],
  'hivtrace/hivtrace_submit.sh': [],
  'axomeme/axomeme.sh': [],
  'difFubar/difFubar.sh': [],
};
const MPIRUN_ALLOWED = { 'gard/gard.sh': 'unreachable local branch' };

function listWrappers() {
  const out = [];
  for (const d of fs.readdirSync(APP, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(APP, d.name))) {
      if (f.endsWith('.sh')) out.push(`${d.name}/${f}`);
    }
  }
  return out.sort();
}

const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
const isComment = (line) => line.trimStart().startsWith('#');
const isEcho = (line) => /^echo\b/.test(line.trimStart());

// Content with the canonical region removed (for "outside the block" checks).
function stripCanonical(text) {
  const s = text.indexOf('# >>> cluster-env');
  const e = text.indexOf('# <<< cluster-env');
  if (s < 0 || e < 0) return text;
  return text.slice(0, s) + text.slice(e + '# <<< cluster-env'.length);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  return r;
}

/**
 * Run a bash snippet with a scrubbed environment. --norc/--noprofile keep a
 * developer's rc files (set -u, noclobber) out of the result.
 */
function bashClean(script, { cwd, env = {}, args = [] } = {}) {
  const envArgs = ['-i', 'PATH=/usr/bin:/bin', `HOME=${cwd || os.tmpdir()}`];
  for (const [k, v] of Object.entries(env)) envArgs.push(`${k}=${v}`);
  return run('env', [...envArgs, 'bash', '--norc', '--noprofile', '-c', script, 'bash', ...args], { cwd });
}

// Print variables in a parseable form; "<unset>" distinguishes unset from empty.
const DUMP =
  'printf "RC=%s\\n" "$rc"; echo AFTER; ' +
  'printf "V_PATH=%s\\n" "${PATH-<unset>}"; ' +
  'printf "V_LD=%s\\n" "${LD_LIBRARY_PATH-<unset>}"; ' +
  'printf "V_MPI=%s\\n" "${MPI_LIB_PATH-<unset>}"';

function parseDump(stdout) {
  const v = {};
  for (const line of stdout.split('\n')) {
    const m = line.match(/^(RC|V_PATH|V_LD|V_MPI)=(.*)$/);
    if (m) v[m[1]] = m[2];
  }
  return v;
}

describe('cluster-env: shared cluster environment for app/*/*.sh', function () {
  this.timeout(20000);

  describe('A. static checks on the wrappers', function () {
    const wrappers = listWrappers();

    it('A1 inventory: every app/*/*.sh is either sourcing or exempt with a reason', function () {
      for (const w of wrappers) {
        const inSources = Object.prototype.hasOwnProperty.call(SOURCES, w);
        const inExempt = Object.prototype.hasOwnProperty.call(EXEMPT, w);
        expect(inSources !== inExempt,
          `${w}: new wrapper must source app/cluster-env.sh or be exempted with a reason`).to.equal(true);
      }
      for (const w of [...Object.keys(SOURCES), ...Object.keys(EXEMPT)]) {
        expect(wrappers, `${w} is listed in the test but missing from app/`).to.include(w);
      }
      for (const reason of Object.values(EXEMPT)) expect(reason).to.be.a('string').and.not.empty;
    });

    it('A1 stale env-block carriers are deleted', function () {
      expect(fs.existsSync(path.join(APP, 'prime/PRIME_wrapper.sh')), 'app/prime/PRIME_wrapper.sh').to.equal(false);
      expect(fs.existsSync(path.join(ROOT, 'test/slurm/slurm_analysis_wrapper.js')),
        'test/slurm/slurm_analysis_wrapper.js re-injects module blocks into every wrapper').to.equal(false);
    });

    it('A2 each sourcing wrapper holds exactly one canonical block, byte-identical', function () {
      for (const [w, profile] of Object.entries(SOURCES)) {
        const text = read(w);
        const starts = text.split('# >>> cluster-env').length - 1;
        const ends = text.split('# <<< cluster-env').length - 1;
        expect(starts, `${w}: '# >>> cluster-env' count`).to.equal(1);
        expect(ends, `${w}: '# <<< cluster-env' count`).to.equal(1);
        const s = text.indexOf('# >>> cluster-env');
        const e = text.indexOf('# <<< cluster-env') + '# <<< cluster-env'.length;
        expect(text.slice(s, e), `${w}: canonical block drifted`).to.equal(canonicalFor(profile));
        // The block must sit at the start of a line.
        expect(s === 0 || text[s - 1] === '\n', `${w}: block not at line start`).to.equal(true);
      }
    });

    it('A3 ordering: after the arg loop, before trap (hivtrace: before FN=$fn and trap)', function () {
      for (const [w, profile] of Object.entries(SOURCES)) {
        const lines = read(w).split('\n');
        const bStart = lines.findIndex((l) => l.startsWith('# >>> cluster-env'));
        const bEnd = lines.findIndex((l) => l.startsWith('# <<< cluster-env'));
        const trap = lines.findIndex((l) => l.startsWith('trap '));
        expect(trap, `${w}: no trap line`).to.be.greaterThan(-1);
        expect(bEnd, `${w}: block must end before trap`).to.be.lessThan(trap);
        if (profile === 'mpi') {
          const loop = lines.findIndex((l) => l.trim() === 'for arg in "$@"; do');
          expect(loop, `${w}: no 'for arg in "$@"' loop`).to.be.greaterThan(-1);
          const done = lines.findIndex((l, i) => i > loop && l.trim() === 'done');
          expect(done, `${w}: arg loop has no done`).to.be.greaterThan(loop);
          expect(bStart, `${w}: block must start after the arg loop's done`).to.be.greaterThan(done);
        } else {
          const fn = lines.findIndex((l) => l.startsWith('FN=$fn'));
          expect(fn, `${w}: no FN=$fn`).to.be.greaterThan(-1);
          expect(bEnd, `${w}: block must end before FN=$fn`).to.be.lessThan(fn);
        }
      }
    });

    it('A4 no wrapper re-inlines module loads, library paths or $0-based anchors', function () {
      const forbidden = [
        [/\/opt\/ohpc/, '/opt/ohpc'],
        [/lmod\.sh/, 'lmod.sh'],
        [/module load/, 'module load'],
        [/(^|[^$\w])MPI_LIB_PATH=/, 'MPI_LIB_PATH='],
        [/ucx-ohpc/, 'ucx-ohpc'],
        [/(^|[;&|(]\s*|\bexport\s+)LD_LIBRARY_PATH=/, 'LD_LIBRARY_PATH assignment'],
      ];
      for (const w of listWrappers()) {
        const outside = stripCanonical(read(w)).split('\n');
        outside.forEach((line, i) => {
          if (isComment(line)) return;
          const t = line.trim();
          const where = `${w}:${i + 1} (outside block): ${t}`;
          for (const [re, label] of forbidden) {
            expect(re.test(t), `${label} forbidden -> ${where}`).to.equal(false);
          }
          if (w !== 'axomeme/axomeme.sh') {
            expect(/\bexport PATH=/.test(t), `export PATH= forbidden -> ${where}`).to.equal(false);
          }
          if (w !== 'difFubar/difFubar.sh') {
            expect(/dirname "\$0"|BASH_SOURCE/.test(t),
              `$0/BASH_SOURCE anchors break under the sbatch spool copy -> ${where}`).to.equal(false);
          }
        });
      }
    });

    it('A4 sanity: the shared file does carry the module loads and /opt/ohpc paths', function () {
      const text = fs.readFileSync(SHARED, 'utf8');
      expect(text).to.include('module load');
      expect(text).to.include('/opt/ohpc');
    });

    it('A5 srun discipline: every live srun line pins LD_LIBRARY_PATH; -n counts and binaries unchanged', function () {
      const live = /srun --mpi=\$MPI_TYPE -n (\S+) \/usr\/bin\/env LD_LIBRARY_PATH="\$MPI_LIB_PATH:\$LD_LIBRARY_PATH" (\S+)/;
      for (const w of listWrappers()) {
        expect(SRUN_N, `${w}: missing from the srun -n table`).to.have.property(w);
        const ns = [];
        read(w).split('\n').forEach((line, i) => {
          if (isComment(line) || isEcho(line)) return;
          const t = line.trim();
          const where = `${w}:${i + 1}: ${t}`;
          if (/\bsrun\b/.test(t)) {
            expect(/\bsrun --mpi/.test(t), `srun without --mpi -> ${where}`).to.equal(true);
            expect(t.includes(SRUN_PIN), `srun must use ${SRUN_PIN} -> ${where}`).to.equal(true);
            const m = t.match(live);
            expect(m, `srun line not in canonical idiom form -> ${where}`).to.not.equal(null);
            ns.push(m[1]);
            const bin = w === 'gard/gard.sh' ? '$HYPHY_MPI' : '$HYPHY';
            expect(m[2], `binary after env prefix -> ${where}`).to.equal(bin);
            if (w === 'bgm/bgm.sh') {
              expect(t.startsWith("printf '\\n\\n\\n\\n\\n\\n' | srun"), `bgm stdin feeder lost -> ${where}`).to.equal(true);
            }
          }
          if (/\bmpirun\b/.test(t)) {
            expect(MPIRUN_ALLOWED, `mpirun only allowed in gard (unreachable local branch) -> ${where}`).to.have.property(w);
          }
        });
        expect(ns, `${w}: ordered srun -n arguments`).to.deep.equal(SRUN_N[w]);
      }
    });

    it('A3b hivtrace passes cwd= (its locator anchor) on every submit path', function () {
      // Without cwd= hivtrace_submit.sh would depend on SLURM_SUBMIT_DIR /
      // PBS_O_WORKDIR, which follow symlinked output dirs and Torque's
      // inherited $PWD. test/golden/qsub-params.js pins this snapshot to the
      // code, so asserting on it covers sbatch --export, qsub -v and local env.
      const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/golden/qsub-params.snapshot.json'), 'utf8'));
      const slurm = snap.hivtrace.slurm.qsub_params.find((p) => p.startsWith('--export='));
      const local = snap.hivtrace.local.qsub_params.find((p) => p.startsWith('fn='));
      for (const params of [slurm, local]) {
        expect(params, 'hivtrace params').to.be.a('string');
        expect(params.split(',')).to.include('cwd=<ROOT>/app/hivtrace');
      }
    });

    it('A6 gitignore: the site override is ignored; the shared file and template are tracked', function () {
      const git = (args) => run('git', args, { cwd: ROOT });
      expect(git(['check-ignore', '-q', 'app/cluster-env.local.sh']).status,
        'app/cluster-env.local.sh must be gitignored').to.equal(0);
      expect(git(['check-ignore', '-q', '--no-index', 'app/cluster-env.sh']).status,
        'app/cluster-env.sh must NOT be gitignored').to.equal(1);
      expect(git(['check-ignore', '-q', '--no-index', 'app/cluster-env.local.example']).status,
        'app/cluster-env.local.example must NOT be gitignored').to.equal(1);
      expect(git(['ls-files', 'app/cluster-env.local.sh']).stdout.trim()).to.equal('');
      const tracked = git(['ls-files', 'app/cluster-env.sh', 'app/cluster-env.local.example']).stdout.trim().split('\n').sort();
      expect(tracked).to.deep.equal(['app/cluster-env.local.example', 'app/cluster-env.sh']);
    });

    it('A7 bash -n passes on the shared file, the template and every wrapper', function () {
      const files = [SHARED, EXAMPLE, ...listWrappers().map((w) => path.join(APP, w))];
      for (const f of files) {
        const r = run('bash', ['-n', f]);
        expect(r.status, `bash -n ${path.relative(ROOT, f)}: ${r.stderr}`).to.equal(0);
      }
    });

    it('A7 shellcheck app/cluster-env.sh (skipped when shellcheck is not installed)', function () {
      const which = spawnSync('sh', ['-c', 'command -v shellcheck'], { encoding: 'utf8' });
      if (which.status !== 0) this.skip();
      const r = run('shellcheck', ['-s', 'bash', SHARED]);
      expect(r.status, r.stdout + r.stderr).to.equal(0);
    });
  });

  describe('B. behavior of app/cluster-env.sh under bash', function () {
    let tmp;

    beforeEach(function () {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-cluster-env-'));
      fs.copyFileSync(SHARED, path.join(tmp, 'cluster-env.sh'));
    });

    afterEach(function () {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    // Every case uses a site file so lmod on the test host never leaks in.
    const site = (body) => fs.writeFileSync(path.join(tmp, 'cluster-env.local.sh'), body);
    const NO_LMOD = 'DM_ENV_LMOD_INIT=/nonexistent\n';
    const sourceAndDump = (profile) => `. ./cluster-env.sh ${profile}; rc=$?; ${DUMP}`;

    describe('B1 parity with the legacy block, lmod absent (profile mpi)', function () {
      for (const inherited of ['/foo:/bar', null]) {
        it(`LD_LIBRARY_PATH ${inherited === null ? 'unset' : `='${inherited}'`}`, function () {
          site(NO_LMOD);
          const env = inherited === null ? {} : { LD_LIBRARY_PATH: inherited };
          const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env });
          const v = parseDump(r.stdout);
          expect(r.status, r.stderr).to.equal(0);
          expect(r.stdout).to.include('AFTER');
          expect(v.RC).to.equal('0');
          const expected = legacyLd(inherited === null ? '' : inherited);
          expect(v.V_LD).to.equal(expected);
          if (inherited === null) expect(v.V_LD).to.include('::');
          expect(v.V_MPI).to.equal(DEFAULT_MPI_LIB_PATH);
          expect(v.V_PATH.startsWith('/usr/local/bin:/usr/bin')).to.equal(true);
          expect(r.stdout).to.include('Module system not available');
        });
      }
    });

    it('B2 profile base: PATH prepended, LD_LIBRARY_PATH and MPI_LIB_PATH untouched', function () {
      site(NO_LMOD);
      const r = bashClean(sourceAndDump('base'), { cwd: tmp });
      const v = parseDump(r.stdout);
      expect(r.status, r.stderr).to.equal(0);
      expect(v.RC).to.equal('0');
      expect(v.V_PATH.startsWith('/usr/local/bin:/usr/bin')).to.equal(true);
      expect(v.V_LD).to.equal('<unset>');
      expect(v.V_MPI).to.equal('<unset>');
    });

    describe('B3 module loads with a stub lmod', function () {
      const stub = (failOn) => {
        const f = path.join(tmp, 'lmod-stub.sh');
        fs.writeFileSync(f,
          `module() { echo "CALL $*" >> "${tmp}/calls"; [ "$2" = "${failOn}" ] && return 1; return 0; }\n`);
        return f;
      };
      const calls = () => {
        const f = path.join(tmp, 'calls');
        return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n') : [];
      };

      it('default modules load in order, stop at the first failure, then list', function () {
        site(`DM_ENV_LMOD_INIT=${stub('openmpi5/5.0.7')}\n`);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
        expect(r.status, r.stderr).to.equal(0);
        expect(parseDump(r.stdout).RC).to.equal('0');
        expect(calls()).to.deep.equal(['CALL load gnu14/14.2.0', 'CALL load openmpi5/5.0.7', 'CALL list']);
        expect(r.stdout).to.include('Failed to load module openmpi5/5.0.7');
      });

      it('a failure mid-list skips the remaining modules', function () {
        site(`DM_ENV_LMOD_INIT=${stub('b/2')}\nDM_ENV_MODULES='a/1 b/2 c/3'\n`);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
        expect(r.status, r.stderr).to.equal(0);
        expect(calls()).to.deep.equal(['CALL load a/1', 'CALL load b/2', 'CALL list']);
      });

      it("DM_ENV_MODULES='' makes no module calls and prints no fallback line", function () {
        site(`DM_ENV_LMOD_INIT=${stub('none')}\nDM_ENV_MODULES=''\n`);
        let r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
        expect(r.status, r.stderr).to.equal(0);
        expect(calls()).to.deep.equal([]);
        expect(r.stdout).to.not.include('Module system not available');
        site(`${NO_LMOD}DM_ENV_MODULES=''\n`);
        r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
        expect(r.stdout).to.not.include('Module system not available');
      });
    });

    describe('B4 override precedence', function () {
      it('an inherited DM_ENV_* value is ignored (sbatch --export=ALL forwards the server env)', function () {
        site(NO_LMOD);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env: { DM_ENV_MPI_LIB_DIRS: '/evil', LD_LIBRARY_PATH: 'X' } });
        const v = parseDump(r.stdout);
        expect(v.V_LD).to.equal(legacyLd('X'));
        expect(v.V_MPI).to.equal(DEFAULT_MPI_LIB_PATH);
        // Not silent: an operator who set it in pm2 env is told where it belongs.
        expect(r.stdout).to.include('WARNING: cluster-env: ignoring inherited DM_ENV_MPI_LIB_DIRS');
      });

      it('an inherited unknown DM_ENV_* is reported once as inherited, not as a site-file typo', function () {
        site(NO_LMOD);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env: { DM_ENV_FOO: '1' } });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include('WARNING: cluster-env: ignoring inherited DM_ENV_FOO');
        expect(r.stdout).to.not.include('unknown setting DM_ENV_FOO');
      });

      it('the site file wins over the defaults', function () {
        site(`${NO_LMOD}DM_ENV_MPI_LIB_DIRS=/x\nDM_ENV_LD_APPEND=''\n`);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env: { LD_LIBRARY_PATH: 'X' } });
        const v = parseDump(r.stdout);
        expect(r.status, r.stderr).to.equal(0);
        expect(v.V_LD).to.equal('/x:X');
        expect(v.V_MPI).to.equal('/x');
        expect(r.stdout).to.include('applying site overrides');
      });

      it('an unknown DM_ENV_* name in the site file is reported (typo guard)', function () {
        site(`${NO_LMOD}DM_ENV_MODULE=typo\n`);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
        expect(r.stdout).to.include('WARNING: cluster-env: unknown setting DM_ENV_MODULE');
        expect(r.stdout).to.not.include('unknown setting DM_ENV_MODULES');
      });

      // A broken site file must not fall back to silverback defaults and fail
      // later at srun with a misleading libmpi error: it fails loudly, now.
      for (const [label, body] of [['a failing last command', 'false\n'], ['a syntax error', 'if then\n']]) {
        it(`a site file with ${label} fails loudly and writes Error to the status file`, function () {
          site(`${NO_LMOD}${body}`);
          const sf = path.join(tmp, 's');
          const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env: { sfn: sf } });
          expect(r.status).to.equal(1);
          expect(r.stderr).to.match(/Error: cluster-env: .*cluster-env\.local\.sh failed/);
          expect(r.stdout).to.not.include('AFTER');
          expect(fs.readFileSync(sf, 'utf8')).to.include('Error');
        });
      }

      it('a site file with a failing command that is not last still loads (returns 0)', function () {
        site(`${NO_LMOD}false\nDM_ENV_LD_APPEND=''\n`);
        const r = bashClean(sourceAndDump('mpi'), { cwd: tmp, env: { LD_LIBRARY_PATH: 'X' } });
        expect(r.status, r.stderr).to.equal(0);
        expect(parseDump(r.stdout).V_LD).to.equal(`${DEFAULT_MPI_LIB_PATH}:X`);
      });
    });

    it('B5 library diagnostic reports found and missing libraries', function () {
      const libdir = path.join(tmp, 'lib');
      fs.mkdirSync(libdir);
      fs.writeFileSync(path.join(libdir, 'libmpi.so.40'), '');
      site(`${NO_LMOD}DM_ENV_MPI_LIB_DIRS=${libdir}\n`);
      const r = bashClean(sourceAndDump('mpi'), { cwd: tmp });
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include(`found libmpi.so.40 at ${libdir}/libmpi.so.40`);
      expect(r.stdout).to.include('WARNING: cluster-env: libucp.so.0 not found');
    });

    describe('B6 a missing or bad profile fails loudly', function () {
      it('sourced without a profile inside a wrapper (caller args leak into $1)', function () {
        site(NO_LMOD);
        const s = path.join(tmp, 's');
        const r = bashClean(`set -- fn=x sfn=${s}; sfn=${s}; . ./cluster-env.sh; echo AFTER`, { cwd: tmp });
        expect(r.status).to.equal(1);
        expect(r.stdout).to.not.include('AFTER');
        expect(r.stderr).to.include('Error: cluster-env: profile');
        expect(fs.readFileSync(s, 'utf8')).to.include('Error');
      });

      it('sourced with no arguments at all', function () {
        site(NO_LMOD);
        const r = bashClean('. ./cluster-env.sh; echo AFTER', { cwd: tmp });
        expect(r.status).to.equal(1);
        expect(r.stdout).to.not.include('AFTER');
        expect(r.stderr).to.include('Error: cluster-env: profile');
      });
    });

    describe('B7 locator block anchors (sbatch spool copy safe)', function () {
      let t;
      const W_HEAD = [
        '#!/bin/bash',
        'for arg in "$@"; do',
        '  case $arg in',
        '    cwd=*) cwd="${arg#*=}" ;;',
        '    sfn=*) sfn="${arg#*=}" ;;',
        '    fn=*) fn="${arg#*=}" ;;',
        '  esac',
        'done',
        '',
      ].join('\n');

      beforeEach(function () {
        // Separate root: tmp itself holds a cluster-env.sh copy, which would
        // make the spool-copy case below find one at $t/spool/.. by accident.
        t = path.join(tmp, 'tree');
        fs.mkdirSync(path.join(t, 'app/x/output'), { recursive: true });
        fs.mkdirSync(path.join(t, 'spool'));
        fs.copyFileSync(SHARED, path.join(t, 'app/cluster-env.sh'));
        fs.writeFileSync(path.join(t, 'app/cluster-env.local.sh'), NO_LMOD);
        const w = `${W_HEAD}${canonicalFor('mpi')}\necho OK $DM_APP_DIR\n`;
        fs.writeFileSync(path.join(t, 'app/x/w.sh'), w);
        // What sbatch actually runs: a copy of the script outside the repo.
        fs.writeFileSync(path.join(t, 'spool/w.sh'), w);
      });

      const W = () => path.join(t, 'app/x/w.sh');

      it('local mode: cwd= argument', function () {
        const r = bashClean(`bash ${W()} cwd=${t}/app/x sfn=${t}/s`, { cwd: t });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`OK ${t}/app/x/..`);
        expect(r.stdout).to.include(`cluster-env: loaded ${t}/app/x/../cluster-env.sh (profile mpi)`);
      });

      it('SLURM_SUBMIT_DIR (= app/<x>/output) when cwd is absent', function () {
        const r = bashClean(`bash ${W()}`, { cwd: t, env: { SLURM_SUBMIT_DIR: `${t}/app/x/output` } });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`OK ${t}/app/x/output/../..`);
      });

      it('PBS_O_WORKDIR (= app/<x>/output) when cwd and SLURM_SUBMIT_DIR are absent', function () {
        const r = bashClean(`bash ${W()}`, { cwd: t, env: { PBS_O_WORKDIR: `${t}/app/x/output` } });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`OK ${t}/app/x/output/../..`);
      });

      it('BASH_SOURCE fallback when run by absolute path with no anchors', function () {
        const r = bashClean(`bash ${W()}`, { cwd: t });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`OK ${t}/app/x/..`);
      });

      it('BASH_SOURCE fallback works with an empty PATH (hivtrace local mode)', function () {
        const r = run('env', ['-i', '/bin/bash', '--norc', '--noprofile', W()], { cwd: t, encoding: 'utf8' });
        expect(r.status, r.stderr).to.equal(0);
        expect(r.stdout).to.include(`OK ${t}/app/x/..`);
      });

      it('a spooled copy with no anchors fails loudly and writes ${fn}_status', function () {
        let r = bashClean(`bash ${t}/spool/w.sh`, { cwd: t });
        expect(r.status).to.equal(1);
        expect(r.stderr).to.include('cluster-env.sh not found');
        expect(r.stdout).to.not.include('OK');
        r = bashClean(`bash ${t}/spool/w.sh`, { cwd: t, env: { fn: `${t}/f` } });
        expect(r.status).to.equal(1);
        expect(fs.readFileSync(`${t}/f_status`, 'utf8')).to.include('Error');
      });

      it('a wrong cwd does not fall through to a valid SLURM_SUBMIT_DIR', function () {
        const r = bashClean(`bash ${t}/spool/w.sh cwd=${t}/elsewhere sfn=${t}/s`, {
          cwd: t, env: { SLURM_SUBMIT_DIR: `${t}/app/x/output` },
        });
        expect(r.status).to.equal(1);
        expect(r.stdout).to.not.include('OK');
        expect(r.stderr).to.include('cluster-env.sh not found');
        expect(fs.readFileSync(`${t}/s`, 'utf8')).to.include('Error');
      });
    });

    it('B8 a real wrapper (slac.sh) fails loudly before any HyPhy run when cluster-env.sh is missing', function () {
      // Fake srun/hyphy/mpirun on PATH record any launch attempt.
      const bin = path.join(tmp, 'bin');
      fs.mkdirSync(bin);
      for (const name of ['srun', 'mpirun', 'hyphy', 'HYPHYMP', 'HYPHYMPI']) {
        const f = path.join(bin, name);
        fs.writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> "${tmp}/launched"\n`);
        fs.chmodSync(f, 0o755);
      }
      const wrapper = path.join(tmp, 'slac.sh');
      fs.copyFileSync(path.join(APP, 'slac/slac.sh'), wrapper);
      const s = path.join(tmp, 's');
      const r = run('env', ['-i', `PATH=${bin}:/usr/bin:/bin`, `HOME=${tmp}`,
        'bash', '--norc', '--noprofile', wrapper, 'cwd=/nonexistent/app/slac', `sfn=${s}`],
      { cwd: tmp, encoding: 'utf8' });
      expect(r.status).to.equal(1);
      expect(r.stderr).to.include('cluster-env.sh');
      expect(r.stderr).to.include('not found');
      expect(fs.readFileSync(s, 'utf8').trim()).to.equal('Error');
      expect(fs.existsSync(path.join(tmp, 'launched')), 'HyPhy/srun was launched').to.equal(false);
      expect(r.stdout).to.not.match(/LIBPATH=/);
    });
  });
});
