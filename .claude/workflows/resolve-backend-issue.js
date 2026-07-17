export const meta = {
  name: 'resolve-backend-issue',
  description: 'Resolve a datamonkey-js-server GitHub issue: investigate, fix on v3 (master) + v2 (release/2.6.x), verify end-to-end on the real SLURM/MPI cluster, and open PRs. Pass the issue number as args.',
  whenToUse: 'When resolving a bug/feature issue in veg/datamonkey-js-server (the shared DM2+DM3 backend). Pass the issue number, e.g. /resolve-backend-issue 391.',
  phases: [
    { title: 'Understand', detail: 'read the issue + map the affected analysis code across both release lines' },
    { title: 'Design', detail: 'draft fix approaches from independent angles, judge, pick one' },
    { title: 'Implement', detail: 'apply the fix on master (v3) and port to release/2.6.x (v2) in isolated worktrees' },
    { title: 'Verify', detail: 'run the real HyPhy analysis end-to-end via srun/clush on shared storage; adversarially confirm' },
    { title: 'Ship', detail: 'summarize per-branch diffs + verification and draft PR bodies' },
  ],
}

// ---------------------------------------------------------------------------
// Repo facts (verified against the cluster + git remotes):
//   - veg/datamonkey-js-server is the SHARED backend for BOTH DM2 and DM3.
//   - v3 line  = `master`          (prod DM3 tracks it; currently ~v3.4.0)
//   - v2 line  = `release/2.6.x`   (prod DM2 tracks it; currently ~v2.6.6)
//                (`release/2.7.x` also exists — the newer v2 line; confirm target)
//   - Fixes historically land on master first, then port to the release branch.
//     Branch naming: `fix/<slug>-<issue>` and `fix/<slug>-<issue>-2.6.x` (or -v2).
//   - CRITICAL cluster facts (see repo CLAUDE.md):
//       * /tmp is NOT shared across nodes. All MPI/SLURM job I/O must live on
//         shared storage (/home/...). MPI rank 0 is on the head node; other ranks
//         run on compute nodes and cannot see the head node's /tmp.
//       * Compute nodes have no lmod. Use `clush -w 'node[0-15]'` (quote the glob —
//         zsh eats it unquoted) and `srun --partition=datamonkey --mpi=pmix`.
//       * HyPhy: bundled `.hyphy/HYPHYMPI` + `.hyphy/HYPHYMP`; system
//         `/usr/local/bin/hyphy` (res at /usr/local/share/hyphy/).
//       * The `datamonkey` user owns the prod checkouts; `sudo -u datamonkey`
//         for anything reading the bundled `.hyphy` or prod app dirs.
//   - Lesson from prod history: a fix that "looks right" is NOT done until the
//     actual analysis runs end-to-end and produces a valid result JSON. Verify
//     before committing.
//   - Never put internal job IDs / Mongo ObjectIDs / paths / hostnames / usernames
//     in the PR body (public-facing). Sanitize.
// ---------------------------------------------------------------------------

const ISSUE = args ? String(args).trim().replace(/^#/, '') : null

const FINDING_SCHEMA = {
  type: 'object',
  required: ['summary', 'affectedFiles', 'affectsCodonPath', 'rootCause'],
  properties: {
    summary: { type: 'string' },
    affectedFiles: { type: 'array', items: { type: 'string' } },
    affectsCodonPath: { type: 'boolean', description: 'true if the bug involves the HyPhy codon model / genetic-code path' },
    analysisMethods: { type: 'array', items: { type: 'string' }, description: 'which analyses (gard, contrast-fel, absrel, ...) are implicated' },
    rootCause: { type: 'string' },
    reproCommand: { type: 'string', description: 'a concrete command that reproduces the failure on the cluster, or "" if not yet known' },
  },
}

const DESIGN_SCHEMA = {
  type: 'object',
  required: ['approach', 'rationale', 'masterEdits', 'releaseEdits', 'risk'],
  properties: {
    approach: { type: 'string' },
    rationale: { type: 'string' },
    masterEdits: { type: 'string', description: 'concrete edits for the v3/master line' },
    releaseEdits: { type: 'string', description: 'concrete edits for the v2/release/2.6.x line (may differ if the code diverged)' },
    risk: { type: 'string' },
    verificationPlan: { type: 'string', description: 'the exact analysis + inputs to run end-to-end to prove the fix' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['branch', 'ranEndToEnd', 'producedValidJson', 'evidence', 'verdict'],
  properties: {
    branch: { type: 'string' },
    ranEndToEnd: { type: 'boolean' },
    producedValidJson: { type: 'boolean' },
    evidence: { type: 'string', description: 'the actual command run + a summary of the result (sanitized)' },
    verdict: { type: 'string', enum: ['fixed', 'partial', 'not-fixed'] },
  },
}

if (!ISSUE) {
  log('No issue number passed. Invoke as: /resolve-backend-issue <number> (e.g. 391).')
  return { error: 'missing issue number in args' }
}

// ---- Phase 1: Understand --------------------------------------------------
phase('Understand')
log(`Investigating veg/datamonkey-js-server issue #${ISSUE}`)

const finding = await agent(
  `Read GitHub issue veg/datamonkey-js-server#${ISSUE} with:
     gh issue view ${ISSUE} --repo veg/datamonkey-js-server --comments
   Then map the affected code in THIS repo (working dir is the datamonkey-js-server checkout).
   Analysis method scripts live in app/<method>/<method>.sh and app/<method>/<method>.js.
   The HyPhy command line is assembled in the .sh; the JS constructor wires params.
   Determine: which analysis method(s) are involved, the exact files, whether the HyPhy
   codon/genetic-code path is implicated, the root cause, and a concrete cluster repro
   command if you can derive one. Do NOT fix anything yet — investigate and report.`,
  { phase: 'Understand', schema: FINDING_SCHEMA },
)

if (!finding) return { error: 'investigation failed' }
log(`Root cause: ${finding.rootCause?.slice(0, 200)}`)

// ---- Phase 2: Design (judge panel of independent approaches) --------------
phase('Design')
const ANGLES = [
  'minimal-surgical: smallest change that fixes the root cause with least risk to other methods',
  'defensive-default: fix the immediate bug AND add a safe default/guard so the class of bug cannot recur (e.g. always pass a value, validate before submit)',
  'consistency: fix it the same way the other, already-correct methods in this repo do it — match the existing convention',
]
const proposals = await parallel(
  ANGLES.map((angle) => () =>
    agent(
      `Given this root cause for issue #${ISSUE}:
         ${finding.rootCause}
       Affected files: ${finding.affectedFiles.join(', ')}
       Design a fix from the "${angle}" angle. This backend serves BOTH release lines:
       v3 = master, v2 = release/2.6.x — the code may differ between them, so specify
       edits for each line. Include a verification plan: the exact HyPhy analysis + input
       shape to run end-to-end to prove it. Do not edit files.`,
      { label: angle.split(':')[0], phase: 'Design', schema: DESIGN_SCHEMA },
    ),
  ),
)
const viable = proposals.filter(Boolean)
const chosen = await agent(
  `Three fix proposals for issue #${ISSUE}:
   ${viable.map((p, i) => `\n### Proposal ${i + 1} (${p.approach})\nrationale: ${p.rationale}\nmaster: ${p.masterEdits}\nrelease: ${p.releaseEdits}\nrisk: ${p.risk}\nverify: ${p.verificationPlan}`).join('\n')}
   Pick the best, grafting the strongest ideas from the others. This repo's history strongly
   favors the defensive-default pattern (e.g. GARD "always pass --code, default Universal";
   contrast-FEL "validate >=2 branch sets"). Return the final consolidated design.`,
  { phase: 'Design', schema: DESIGN_SCHEMA },
)
log(`Chosen approach: ${chosen.approach}`)

// ---- Phase 3: Implement on BOTH lines (isolated worktrees) ----------------
phase('Implement')
const slug = (finding.analysisMethods?.[0] || 'fix') + `-${ISSUE}`
const lines = [
  { branch: 'master', line: 'v3', fixBranch: `fix/${slug}`, edits: chosen.masterEdits },
  { branch: 'release/2.6.x', line: 'v2', fixBranch: `fix/${slug}-2.6.x`, edits: chosen.releaseEdits },
]

const implemented = await parallel(
  lines.map((L) => () =>
    agent(
      `Implement the fix for issue #${ISSUE} on the ${L.line} line.
       Steps:
       1. git fetch origin && git checkout ${L.branch} && git pull --ff-only
       2. git checkout -b ${L.fixBranch}
       3. Apply these edits (adapt to what actually exists on THIS branch — the code may
          differ from the other line): ${L.edits}
       4. Keep the change minimal and match surrounding style. Do NOT commit yet — leave the
          working tree edited so it can be verified first.
       Report the exact diff (git diff) and the branch name. If the branch already exists
       upstream (e.g. a prior fix/${slug}), note that and build on it instead of duplicating.`,
      { label: `${L.line}:${L.fixBranch}`, phase: 'Implement', isolation: 'worktree' },
    ).then((r) => ({ ...L, result: r })),
  ),
)

// ---- Phase 4: Verify end-to-end on the real cluster + adversarial check ---
phase('Verify')
const verified = await pipeline(
  implemented.filter(Boolean),
  // stage 1: run the analysis end-to-end on the cluster
  (impl) =>
    agent(
      `Verify the fix for issue #${ISSUE} on the ${impl.line} line (branch ${impl.fixBranch}) by
       running the ACTUAL HyPhy analysis end-to-end — a diff is not proof.
       Follow the repo CLAUDE.md cluster rules exactly:
         - Put ALL job input/output on shared storage (/home/...), NEVER /tmp (not shared across nodes).
         - Use the bundled .hyphy binary the backend actually uses, or system /usr/local/bin/hyphy.
         - For MPI runs: srun --partition=datamonkey --mpi=pmix ; for a fast single check,
           clush -w 'node0' (quote the glob) also works.
         - Use sudo -u datamonkey when reading prod .hyphy / app dirs.
       Verification plan from design: ${chosen.verificationPlan}
       Run it, confirm it produces a VALID result JSON (non-empty, parseable, expected keys),
       and confirm the previously-failing case now succeeds. Clean up any scratch files/jobs
       you create. Report sanitized evidence (no internal IDs/paths/hostnames).`,
      { label: `run:${impl.line}`, phase: 'Verify', schema: VERIFY_SCHEMA },
    ).then((v) => ({ ...impl, verify: v })),
  // stage 2: an independent skeptic tries to refute the "fixed" claim
  (implWithVerify) => {
    if (!implWithVerify?.verify) return implWithVerify
    return agent(
      `Adversarially review this verification claim for issue #${ISSUE} on the ${implWithVerify.line} line:
         verdict=${implWithVerify.verify.verdict}, ranEndToEnd=${implWithVerify.verify.ranEndToEnd},
         validJson=${implWithVerify.verify.producedValidJson}
         evidence: ${implWithVerify.verify.evidence}
       Default to skeptical. Did it ACTUALLY run the analysis (not just build a command or check syntax)?
       Was the output a real, valid result — or an empty/placeholder JSON? Would the original failing
       input now pass? If the claim doesn't hold up, say verdict=not-fixed and explain. Do not re-run
       unless you must; judge the evidence.`,
      { label: `refute:${implWithVerify.line}`, phase: 'Verify', schema: VERIFY_SCHEMA },
    ).then((v) => ({ ...implWithVerify, adversarial: v }))
  },
)

// ---- Phase 5: Ship (draft PRs; do NOT auto-merge/release) ------------------
phase('Ship')
const results = verified.filter(Boolean)
const allFixed = results.every(
  (r) => r.verify?.verdict === 'fixed' && r.adversarial?.verdict === 'fixed',
)

const prBodies = await parallel(
  results.map((r) => () =>
    agent(
      `Draft a PR body (markdown, do NOT open the PR, do NOT commit/merge/release) for the ${r.line}-line
       fix of issue #${ISSUE} on branch ${r.fixBranch}. Include: the bug, the fix, and the end-to-end
       verification evidence. SANITIZE: no internal job IDs, Mongo ObjectIDs, paths, hostnames, or
       usernames. Reference the issue with "Fixes #${ISSUE}" only if this is the v3/master PR; for the
       v2 port, reference the issue without auto-close. Return the markdown.`,
      { label: `pr:${r.line}`, phase: 'Ship' },
    ).then((body) => ({ line: r.line, branch: r.fixBranch, body })),
  ),
)

log(allFixed
  ? 'Both lines verified end-to-end. PR bodies drafted — review, then commit/push/open PRs and cut releases yourself.'
  : 'NOT all lines verified — review the failing verification before shipping. No PRs drafted as final.')

return {
  issue: ISSUE,
  rootCause: finding.rootCause,
  approach: chosen.approach,
  lines: results.map((r) => ({
    line: r.line,
    branch: r.branch,
    verifyVerdict: r.verify?.verdict,
    adversarialVerdict: r.adversarial?.verdict,
  })),
  allVerified: allFixed,
  prBodies: prBodies.filter(Boolean),
  note: 'Workflow stops at drafted PR bodies + verified branches. Committing, pushing, opening PRs, merging, and cutting releases are left to you (repo history shows these are explicit human-gated steps).',
}
