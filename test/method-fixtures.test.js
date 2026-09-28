/**
 * Cluster-free guards for the method fixtures and the wrapper fixes that the
 * completion lane (test/completion/completion.js, npm run test:complete)
 * exercises on the real scheduler. These run in test:ci, so a broken fixture
 * or a reverted fix fails CI instead of surfacing only on a cluster run.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { relaxModels } = require("../app/relax/descriptor.js");

const ROOT = path.join(__dirname, "..");

// method dir -> alignment fixture (must match test/completion/completion.js)
const FIXTURES = {
  absrel: "Flu.fasta",
  bgm: "CD2.nex",
  bstill: "CD2.nex",
  busted: "5446bc0d355080301f18a8c6",
  "contrast-fel": "Flu.fasta",
  fade: "CD2.aa.fasta",
  fel: "CD2.nex",
  fubar: "CD2.nex",
  gard: "CD2.nex",
  meme: "CD2.nex",
  multihit: "Flu.fasta",
  nrm: "CD2.nex",
  prime: "595a5dfd0483ab9a7959e731",
  relax: "Flu.fasta",
  slac: "CD2.nex",
};

// Sequence names from FASTA or NEXUS (fixtures use \r, \n and \r\n endings).
function alignmentNames(file) {
  const text = fs.readFileSync(file, "latin1").replace(/\r\n?/g, "\n");
  if (/^\s*#NEXUS/i.test(text)) {
    const m = /MATRIX([\s\S]*?);/i.exec(text);
    assert.ok(m, file + ": NEXUS without a MATRIX block");
    return new Set(
      m[1]
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[0])
        .filter(Boolean)
        .map((n) => n.replace(/'/g, "").toUpperCase())
    );
  }
  return new Set(
    text
      .split("\n")
      .filter((l) => l.startsWith(">"))
      .map((l) => l.slice(1).trim().toUpperCase())
  );
}

function treeTips(nwk) {
  const clean = nwk.replace(/\{[^}]*\}/g, "");
  const tips = [];
  const re = /[(,]\s*([^():,;\s]+)/g;
  let m;
  while ((m = re.exec(clean))) tips.push(m[1].toUpperCase());
  return new Set(tips);
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

describe("method fixtures: every tree location matches its alignment", function () {
  Object.keys(FIXTURES).forEach(function (dir) {
    it(dir, function () {
      const res = path.join(ROOT, "test", dir, "res");
      let p = JSON.parse(fs.readFileSync(path.join(res, "params.json"), "utf8"));
      if (p.job) p = p.job;
      const aln = fs.readFileSync(path.join(res, FIXTURES[dir]), "latin1");
      // An embedded tree makes HyPhy stop and ask whether to use it; a batch job
      // can never answer, so it hangs (this is what stalled multihit).
      assert.ok(!/\n\s*\(|\r\s*\(/.test(aln.replace(/^#NEXUS[\s\S]*$/i, "")), dir + ": alignment has an embedded Newick tree");

      const names = alignmentNames(path.join(res, FIXTURES[dir]));
      const am = ((p.analysis || {}).msa || [{}])[0] || {};
      // Every routing location a constructor may read (CLAUDE.md "Tree
      // parameter routing"); production payloads populate all of them.
      const locations = {
        "params.tree": p.tree,
        "analysis.tagged_nwk_tree": (p.analysis || {}).tagged_nwk_tree,
        "msa[0].nj": p.msa[0].nj,
        "msa[0].usertree": p.msa[0].usertree,
        "analysis.msa[0].nj": am.nj,
        "analysis.msa[0].usertree": am.usertree,
      };
      Object.keys(locations).forEach(function (loc) {
        const t = locations[loc];
        assert.ok(t, dir + ": " + loc + " is missing (an analysis reading it writes an empty .tre)");
        const tips = treeTips(t);
        assert.ok(
          sameSet(tips, names),
          dir + ": " + loc + " has " + tips.size + " tips that do not match the " + names.size + " sequences"
        );
      });
    });
  });
});

describe("wrapper fixes guarded by the completion lane", function () {
  it("fade.sh passes MCMC settings as --chains/--chain-length (FADE.bf keywords)", function () {
    const sh = fs.readFileSync(path.join(ROOT, "app/fade/fade.sh"), "utf8");
    const runs = sh.split("\n").filter((l) => /\$FADE --alignment/.test(l));
    assert.ok(runs.length > 0, "no FADE invocations found");
    runs.forEach(function (l) {
      assert.ok(/--chains \$CHAINS --chain-length \$LENGTH/.test(l), "FADE line lacks --chains/--chain-length: " + l.trim().slice(0, 80));
      assert.ok(!/--chain \$/.test(l), "FADE line still passes the unknown --chain flag");
    });
  });

  it("bstill.sh launches its non-MPI binary as a single srun task", function () {
    const sh = fs.readFileSync(path.join(ROOT, "app/bstill/bstill.sh"), "utf8");
    const sruns = sh.split("\n").filter((l) => /^\s*(echo "?)?srun /.test(l));
    assert.ok(sruns.length > 0, "no srun lines found");
    sruns.forEach(function (l) {
      assert.ok(/ -n 1 /.test(l), "bstill srun must use -n 1 (N copies race on the cache): " + l.trim().slice(0, 80));
    });
  });

  it("RELAX maps legacy analysis_type indices to --models names", function () {
    assert.strictEqual(relaxModels(undefined, 1), "All");
    assert.strictEqual(relaxModels(undefined, "1"), "All");
    assert.strictEqual(relaxModels(undefined, 2), "Minimal");
    assert.strictEqual(relaxModels(undefined, "2"), "Minimal");
    assert.strictEqual(relaxModels("Minimal", 1), "Minimal");
    assert.strictEqual(relaxModels("All", undefined), "All");
    assert.strictEqual(relaxModels(undefined, undefined), "All");
    assert.strictEqual(relaxModels("", ""), "All");
  });
});
