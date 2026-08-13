/**
 * Parameter-flow check: every exported key must actually reach the analysis binary.
 *
 * WHY THIS EXISTS. test/golden/qsub-params.js pins what each descriptor SENDS — the
 * --export string on the sbatch line, or the key=value argv for local runs — byte for
 * byte. Nothing tested the other side of that boundary. A descriptor could export a
 * key, the shell script could parse it, assign it a default, even echo it into the
 * log, and still never pass it to HyPhy. The golden snapshot stays green the whole
 * time, because the key really is being sent; it just is not being used.
 *
 * That is not hypothetical. app/meme/meme.sh parsed `pvalue`, defaulted it to 0.1,
 * printed "PVALUE: '0.1'" into the progress file, and never put --pvalue on the
 * command line. MEME.bf declares the keyword, the frontend and the MCP surface both
 * let a user set it, and the golden snapshot contained pvalue=0.1 — so every signal
 * a developer would normally check said the parameter worked. Every MEME job ran at
 * HyPhy's own default instead. This test is the check that would have caught it.
 *
 * HOW IT WORKS. For each analysis with a descriptor:
 *   1. Collect the exported keys from the descriptor itself (not from source text),
 *      so the test reads the same list the factory does.
 *   2. Find the script's LIVE invocation lines — the ones that actually run the
 *      binary, excluding the `echo "..."` copies that sit above each of them.
 *   3. Resolve shell aliases. Scripts rarely use the export key directly: meme does
 *      PVALUE="${pvalue:-0.1}", busted does omegaClasses=${rates:-3}. Assignments are
 *      traced transitively, so the test follows renames instead of hard-coding them
 *      and does not need editing when a script renames a variable.
 *   4. Assert the resolved variable appears on at least one live invocation line.
 *
 * EXEMPTIONS ARE EXPLICIT AND EXPLAINED. A key that legitimately never reaches the
 * binary is listed in EXEMPT below with the reason. That list is the point: adding to
 * it is a deliberate, reviewable act, whereas silence is how the MEME bug survived.
 */

var fs = require("fs"),
  path = require("path"),
  should = require("should");

var APP_DIR = path.resolve(__dirname, "../../app");

/**
 * Keys that are sent but are NOT arguments to the analysis binary.
 *
 * "*" applies to every analysis. Anything else is per-analysis and must say why,
 * because an unexplained entry here is indistinguishable from the bug this test
 * was written to catch.
 */
var EXEMPT = {
  "*": {
    // Job plumbing consumed by the script itself (paths it writes, the working
    // directory it cds into, the rank count it hands to srun) — never HyPhy flags.
    cwd: "shell working directory, not a binary argument",
    msaid: "job bookkeeping only",
    procs: "MPI rank count for srun, not a binary argument",
    analysis_type: "used for log lines and file naming",
    treemode: "consumed by the script's tree handling",
    sfn: "status file path, written by the script",
    pfn: "progress file path, the stdout redirect target",
    rfn: "results-file stem, used to build --output"
  },
  meme: {
    bootstrap: "control flag: selects the branch that adds --resample; not itself a flag"
  },
  fel: {
    bootstrap: "control flag: selects the branch that adds --resample; not itself a flag"
  },
  axomeme: {
    genetic_code:
      "AxoMEME has no genetic-code option — the universal code is baked into the " +
      "model's tokenizer. Exported for log parity with the other analyses only."
  },
  fade: {
    genetic_code:
      "FADE tests directional selection on AMINO ACID data and declares no 'code' " +
      "keyword (see FADE.bf's KeywordArgument list: alignment, output, cache, tree, " +
      "branches, grid, model, method, chains, chain-length, burn-in, samples). The " +
      "descriptor exports it because the field block is shared with the codon methods."
  }
};

/** Lines that actually execute the analysis binary (not the echo'd copy above them). */
function liveInvocationLines(scriptBody) {
  return scriptBody.split("\n").filter(function (line) {
    var t = line.trim();
    if (!t || t.charAt(0) === "#") return false;
    if (t.indexOf("echo") === 0) return false;
    var runsBinary =
      /\$HYPHY\b|\$HYPHY_NON_MPI\b|HYPHYMPI?\b|\bhyphy\b|\$NODE_BIN\b/.test(t);
    var hasArgs = t.indexOf("--") !== -1;
    return runsBinary && hasArgs;
  });
}

/**
 * Every shell variable a key's value can flow into, following assignments
 * transitively.
 *
 * The right-hand side is matched anywhere on the line, not just as the first token,
 * because real scripts move values through more than a rename. contrast-fel turns one
 * export key into a whole flag list:
 *
 *     sets=(`echo $branch_sets | sed 's/:/\n/g'`)
 *     BRANCH_SETS=$(for x in ${sets[@]}; do echo -n " --branch-set $x "; done;)
 *
 * so branch_sets -> sets -> BRANCH_SETS, through an array and a command substitution.
 * A first-token-only matcher reports that as a missing parameter, which is a false
 * alarm — and false alarms are how a test like this stops being believed.
 *
 * Being generous here does not weaken the check. The failure this test exists to
 * catch is "no variable carrying this value appears on any command line at all";
 * widening what counts as carrying the value cannot hide that.
 */
function aliasesOf(key, scriptBody) {
  var found = {};
  found[key] = true;
  var lines = scriptBody.split("\n");
  var changed = true;
  // Terminates: every pass either adds a variable named in the script or stops.
  while (changed) {
    changed = false;
    lines.forEach(function (line) {
      var m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
      if (!m) return;
      var lhs = m[1];
      var rhs = m[2];
      if (found[lhs]) return;
      var carries = Object.keys(found).some(function (v) {
        return new RegExp("\\$\\{?" + v + "\\b").test(rhs);
      });
      if (carries) {
        found[lhs] = true;
        changed = true;
      }
    });
  }
  return Object.keys(found);
}

function isExempt(analysis, key) {
  if (EXEMPT["*"][key]) return true;
  return Boolean(EXEMPT[analysis] && EXEMPT[analysis][key]);
}

var analyses = fs
  .readdirSync(APP_DIR)
  .filter(function (d) {
    return fs.existsSync(path.join(APP_DIR, d, "descriptor.js"));
  })
  .sort();

describe("HyPhy parameter flow (exported keys reach the binary)", function () {
  it("finds every declarative analysis", function () {
    analyses.length.should.be.above(
      10,
      "expected the factory-built analyses to be discovered; got " + analyses.join(", ")
    );
  });

  analyses.forEach(function (name) {
    describe(name, function () {
      var descriptor = require(path.join(APP_DIR, name, "descriptor.js")).descriptor;
      var scriptPath = path.join(APP_DIR, name, descriptor.script);
      var body = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf8") : null;
      var invocations = body ? liveInvocationLines(body) : [];

      it("ships the script its descriptor names", function () {
        should.exist(body, descriptor.script + " is missing from app/" + name);
      });

      it("has at least one live invocation line", function () {
        // A script with no runnable command line would make every check below
        // vacuously pass, so this guards the guard.
        invocations.length.should.be.above(
          0,
          descriptor.script + ": found no line that executes the analysis binary"
        );
      });

      var keys = (descriptor.prefixKeys || ["fn", "tree_fn", "sfn", "pfn", "rfn", "treemode"])
        .concat(
          descriptor.exportKeys.map(function (entry) {
            return entry[0];
          })
        );

      keys.forEach(function (key) {
        if (isExempt(name, key)) return;
        it("passes " + key + " to the binary", function () {
          var joined = invocations.join("\n");
          var names = aliasesOf(key, body);
          var used = names.filter(function (v) {
            return new RegExp("\\$\\{?" + v + "\\b").test(joined);
          });
          used.length.should.be.above(
            0,
            descriptor.script +
              " parses '" +
              key +
              "' but never puts it on the command line.\n" +
              "  Value can reach: " +
              names.map(function (v) { return "$" + v; }).join(", ") +
              "\n  If this key is intentionally not a binary argument, add it to " +
              "EXEMPT in this file with the reason."
          );
        });
      });
    });
  });
});
