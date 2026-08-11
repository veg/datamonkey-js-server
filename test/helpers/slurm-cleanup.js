/**
 * slurm-cleanup.js — SLURM-leak backstop for the real-scheduler test suites.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * test/jobqueue.js and test/jobstatus.js submit real jobs to the live
 * `datamonkey` SLURM partition (multi-day walltimes). Their per-suite cleanup
 * used a fire-and-forget `spawn('scancel', ids)` in an `after`/`afterEach`
 * hook. Under `mocha --exit`, mocha force-kills the process the instant the
 * last test's callback returns — before the detached `scancel` child has a
 * chance to run — so the submitted jobs SURVIVE on the partition. A crashing
 * test (throw before its own cleanup) leaks the same way.
 *
 * This module provides two things:
 *
 *   1. `track(id)` — register a slurm job id the moment it is known, so it can
 *      be cleaned up even if the test that created it never reaches its own
 *      afterEach/after (e.g. it throws or times out).
 *
 *   2. A mocha ROOT-LEVEL `after` hook (registered on require) that runs a
 *      single BLOCKING `execSync('scancel <tracked ids>')` after ALL suites in
 *      the process finish. Because it is synchronous, it completes before
 *      `--exit` tears the process down. It is intentionally conservative: it
 *      only cancels the specific ids this suite tracked (never `scancel -u`,
 *      never other users' jobs).
 *
 * The per-suite hooks in jobqueue.js / jobstatus.js ALSO switch to a blocking
 * `execSync` scancel; this root hook is a backstop for ids that slipped past
 * those hooks (crashes, untracked-but-registered ids).
 */
var execSync = require("child_process").execSync;

// Set of slurm job ids (as strings) that this test process has submitted and
// is responsible for cancelling.
var tracked = new Set();

/**
 * Register a slurm job id for backstop cleanup. Ids are normalized to strings
 * so lookups line up regardless of numeric/string origin.
 * @param {string|number} id
 */
function track(id) {
  if (id === null || id === undefined) return;
  tracked.add(String(id));
}

/**
 * Forget an id once the owning test has already cancelled it (keeps the
 * backstop's scancel list minimal). Safe to call with an unknown id.
 * @param {string|number} id
 */
function untrack(id) {
  if (id === null || id === undefined) return;
  tracked.delete(String(id));
}

/**
 * Blocking cancel of the supplied ids (defaults to everything tracked). Wrapped
 * so a scancel failure (e.g. job already gone) never fails the suite. Returns
 * the list of ids it attempted to cancel.
 * @param {Array<string|number>} [ids]
 * @returns {string[]}
 */
function cancel(ids) {
  var list = (ids || Array.from(tracked)).map(String).filter(Boolean);
  if (!list.length) return [];
  try {
    // Blocking so it finishes before mocha's `--exit` kills the process.
    execSync("scancel " + list.join(" "), { stdio: "ignore" });
  } catch (e) {
    // Best-effort: job may already be gone / cancelled. Do not fail cleanup.
  }
  list.forEach(untrack);
  return list;
}

// Mocha root-level backstop. Registering a top-level `after` (outside any
// describe) attaches it to the root suite, so it runs once after every suite
// in the process — even if an individual test crashed before its own cleanup.
if (typeof after === "function") {
  after(function slurmCleanupBackstop() {
    cancel();
  });
}

module.exports = { track: track, untrack: untrack, cancel: cancel };
