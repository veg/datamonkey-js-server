#!/usr/bin/env node
/**
 * cli.js — the AxoMEME job runner invoked by app/axomeme/axomeme.sh.
 *
 * STDOUT IS THE PROGRESS FILE. The shell script redirects this process's
 * stdout into the job's .progress file, and hyphyjob republishes the WHOLE
 * file through redis on every tick — so output must stay bounded: one line
 * per phase plus at most one per decile of scoring progress, never a line
 * per site.
 *
 * COMPLETION CONTRACT: results file written + exit 0. The local path in
 * app/job.js keys on the exit code; the SLURM path stats the results file.
 * The results file is therefore written (and fsync'd) BEFORE the final
 * progress line, so no observer can see "done" before the results exist.
 *
 * Errors go to stderr and set a non-zero exit code — the shell's ERR trap
 * then writes "Error" to the status file.
 */

const fs = require("fs");
const { predictAxomeme } = require("./predict.js");

const USAGE =
  "Usage: cli.js --alignment <file> --tree <file> --output <file>\n" +
  "              [--call-mode percentile|zscore|pvalue] [--max-species 2..512]\n" +
  "              [--reference-sequence <name>] [--threads <n>]\n";

/**
 * Hand-rolled flag parser (no new deps): accepts `--flag value` and
 * `--flag=value`. Unknown flags are collected too; main() only reads the
 * ones it knows.
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

/** Parse an optional integer flag; absent, empty or unparsable means "not set". */
function intOrUndefined(value) {
  if (value == null || value === "") return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Print progress updates to stdout, bounded: a line when the phase changes or
 * when the percent crosses into a new decile, otherwise silence. With the
 * runner's phases (parsing/preparing/loading/running/processing) this is at
 * most ~11 lines regardless of alignment size.
 */
function makeProgressPrinter() {
  let lastPhase = null;
  let lastDecile = -1;
  return function (update) {
    const decile = Math.floor(update.percent / 10);
    if (update.phase === lastPhase && decile <= lastDecile) return;
    lastPhase = update.phase;
    lastDecile = Math.max(lastDecile, decile);
    process.stdout.write(
      "[" + update.phase + "] " + update.percent + "% " + update.message + "\n"
    );
  };
}

/** Write + fsync + close, so the bytes are durable before we signal completion. */
function writeFileWithFsync(path, data) {
  const fd = fs.openSync(path, "w");
  try {
    // writeSync may perform a SHORT write without throwing (ENOSPC/EIO mid-write);
    // exiting 0 after one would deliver truncated JSON as a "successful" result.
    const buf = Buffer.from(data);
    let written = 0;
    while (written < buf.length) {
      const n = fs.writeSync(fd, buf, written);
      if (n <= 0) {
        throw new Error("short write to " + path + " (" + written + "/" + buf.length + " bytes)");
      }
      written += n;
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const missing = ["alignment", "tree", "output"].filter(function (k) {
    return !args[k];
  });
  if (missing.length) {
    throw new Error(
      "missing required flag(s): --" + missing.join(", --") + "\n" + USAGE
    );
  }

  const alignmentText = fs.readFileSync(args.alignment, "utf8");
  const treeText = fs.readFileSync(args.tree, "utf8");

  // An empty/missing --reference-sequence means "auto-pick" (undefined), not
  // a sequence literally named "".
  const referenceSequence = args["reference-sequence"]
    ? args["reference-sequence"]
    : undefined;
  const callMode = args["call-mode"] ? args["call-mode"] : undefined;

  const result = await predictAxomeme({
    alignmentText: alignmentText,
    treeText: treeText,
    callMode: callMode,
    maxSpecies: intOrUndefined(args["max-species"]),
    referenceSequence: referenceSequence,
    threads: intOrUndefined(args.threads),
    onProgress: makeProgressPrinter(),
  });

  // Results BEFORE the final progress line — see the completion contract above.
  writeFileWithFsync(args.output, JSON.stringify(result));
  process.stdout.write(
    "[complete] 100% Results written to " + args.output + "\n"
  );
}

// No explicit process.exit(): VERIFIED (onnxruntime-node 1.23.2, node 22)
// by running this CLI standalone that the session's native thread pool does
// not keep the event loop referenced — the process exits on its own right
// after the write (~1s total on the 30-site test alignment). If a future
// onnxruntime bump changes that, re-verify and add a process.exit(0) AFTER
// writeFileWithFsync. Letting the process exit naturally also guarantees the
// error path below flushes stderr before the (implicit) exit.
main().catch(function (err) {
  process.stderr.write(
    "AxoMEME failed: " + (err && err.message ? err.message : String(err)) + "\n"
  );
  process.exitCode = 1;
});
