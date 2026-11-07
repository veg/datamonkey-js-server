/**
 * Per-method SLURM partition routing (lib/partition.js).
 *
 * `<method>_partition` sends one analysis to its own partition (production
 * isolates GARD on a dedicated "gard" partition so it cannot starve the shared
 * one via gang scheduling); anything unset falls back to slurm_partition, then
 * "datamonkey". The integration cases build the REAL sbatch argv the way
 * test/golden/qsub-params.js does: checkOnly constructors under
 * submit_type "slurm", which never submit a job.
 */
const assert = require("assert");
const EventEmitter = require("events").EventEmitter;
const config = require("../lib/config");
const { partitionFor } = require("../lib/partition");

function fakeSocket() {
  const s = new EventEmitter();
  s.id = "partition-test";
  s.disconnect = function () {};
  return s;
}

function partitionArg(qsubParams) {
  const hit = (qsubParams || []).filter(function (a) {
    return /^--partition=/.test(a);
  });
  assert.strictEqual(hit.length, 1, "expected exactly one --partition arg, got " + JSON.stringify(hit));
  return hit[0].slice("--partition=".length);
}

// Build each analysis's sbatch argv without submitting (see golden test).
const BUILD = {
  fel: function () {
    const Ctor = require("../app/fel/fel.js").fel;
    return new Ctor(fakeSocket(), ">A\nACGT\n", {
      checkOnly: true,
      _id: "PART-ID",
      analysis: { _id: "PART-ID" },
      msa: [{ _id: "MSA-ID", nj: "(A,B);", gencodeid: 0 }],
      genetic_code: "Universal",
    });
  },
  bstill: function () {
    const Ctor = require("../app/bstill/bstill.js").bstill;
    return new Ctor(fakeSocket(), ">A\nACGT\n", {
      checkOnly: true,
      _id: "PART-ID",
      analysis: { _id: "PART-ID" },
      msa: [{ _id: "MSA-ID", nj: "(A,B);", gencodeid: 0 }],
      genetic_code: "Universal",
    });
  },
  gard: function () {
    const Ctor = require("../app/gard/gard.js").gard;
    return new Ctor(fakeSocket(), ">A\nACGT\n", {
      checkOnly: true,
      genetic_code: "Universal",
      nwk_tree: "(A,B);",
    });
  },
  difFubar: function () {
    const Ctor = require("../app/difFubar/difFubar.js").difFubar;
    return new Ctor(fakeSocket(), ">A\nACGT\n", {
      checkOnly: true,
      analysis: {
        _id: "PART-ID",
        number_of_grid_points: 20,
        concentration_of_dirichlet_prior: 0.5,
        mcmc_iterations: 2500,
        burnin_samples: 500,
        pos_threshold: 0.95,
      },
      msa: [{ _id: "MSA-ID", nj: "(A,B);" }],
    });
  },
};

describe("partitionFor", function () {
  it("uses <method>_partition when set", function () {
    assert.strictEqual(partitionFor("gard", { gard_partition: "gard", slurm_partition: "datamonkey" }), "gard");
  });
  it("falls back to slurm_partition", function () {
    assert.strictEqual(partitionFor("fel", { gard_partition: "gard", slurm_partition: "shared" }), "shared");
  });
  it("falls back to datamonkey when neither is set", function () {
    assert.strictEqual(partitionFor("fel", {}), "datamonkey");
  });
  it("keys difFubar case-sensitively, like difFubar_procs", function () {
    assert.strictEqual(partitionFor("difFubar", { difFubar_partition: "julia" }), "julia");
    assert.strictEqual(partitionFor("diffubar", { difFubar_partition: "julia" }), "datamonkey");
  });
  it("ignores an empty override", function () {
    assert.strictEqual(partitionFor("gard", { gard_partition: "", slurm_partition: "shared" }), "shared");
  });
});

describe("per-method --partition in the real sbatch argv", function () {
  const saved = {};
  const KEYS = ["submit_type", "slurm_partition", "gard_partition", "difFubar_partition", "fel_partition", "bstill_partition"];

  beforeEach(function () {
    KEYS.forEach(function (k) {
      saved[k] = config[k];
    });
    config.submit_type = "slurm";
    config.slurm_partition = "shared";
    delete config.gard_partition;
    delete config.difFubar_partition;
    delete config.fel_partition;
    delete config.bstill_partition;
  });

  afterEach(function () {
    // config is a shared cached object; restore it for later suites.
    KEYS.forEach(function (k) {
      if (saved[k] === undefined) delete config[k];
      else config[k] = saved[k];
    });
  });

  Object.keys(BUILD).forEach(function (method) {
    it(method + ": no override -> slurm_partition", function () {
      assert.strictEqual(partitionArg(BUILD[method]().qsub_params), "shared");
    });
    it(method + ": " + method + "_partition wins", function () {
      config[method + "_partition"] = method + "-dedicated";
      assert.strictEqual(partitionArg(BUILD[method]().qsub_params), method + "-dedicated");
    });
  });

  it("an override for one method does not leak into another", function () {
    config.gard_partition = "gard";
    assert.strictEqual(partitionArg(BUILD.gard().qsub_params), "gard");
    assert.strictEqual(partitionArg(BUILD.fel().qsub_params), "shared");
    assert.strictEqual(partitionArg(BUILD.difFubar().qsub_params), "shared");
  });

  it("bstill is keyed by its own name even though it borrows fubar_procs", function () {
    config.fubar_partition = "fubar-only";
    try {
      assert.strictEqual(partitionArg(BUILD.bstill().qsub_params), "shared");
    } finally {
      delete config.fubar_partition;
    }
  });
});
