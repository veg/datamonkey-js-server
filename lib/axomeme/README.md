# lib/axomeme

Server-side AxoMEME: a neural surrogate for MEME (ONNX model) vendored from
[veg/datamonkey3](https://github.com/veg/datamonkey3).

## Provenance

Vendored from datamonkey3 commit `a00d3b72df26e03a9808d3ed87326f118d6f791a`
(2026-08-11). Do not hand-edit files under `vendor/` — they are kept
mechanically diffable against upstream (lint/prettier are configured to leave
their tab/single-quote formatting alone).

| File in `vendor/` | Upstream source |
| --- | --- |
| `assemble.js` | `src/lib/services/axomeme/assemble.js` |
| `mds.js` | `src/lib/services/axomeme/mds.js` |
| `modelContract.js` | `src/lib/services/axomeme/modelContract.js` |
| `newick.js` | `src/lib/services/axomeme/newick.js` |
| `patristic.js` | `src/lib/services/axomeme/patristic.js` |
| `postprocess.js` | `src/lib/services/axomeme/postprocess.js` |
| `symmetricEigen.js` | `src/lib/services/axomeme/symmetricEigen.js` |
| `tokenizer.js` | `src/lib/services/axomeme/tokenizer.js` |
| `alignment.js` | Composite: `parseFasta`, `isNexusFormat`, `isFastaFormat`, `parseNexus`, `parseAlignment` from `src/lib/utils/fastaValidation.js`; `stripEmbeddedTrees` from `src/lib/services/BackendAnalysisRunner.js` |
| `tree-inspect.js` | Composite: `NJ_SATURATION_SENTINEL`, `branchLengths`, `inspectBranchLengths` from `src/lib/utils/treeSanitation.js`; `treeHasBranchLengths` from `src/lib/services/prescreen/scope.js` |

Upstream `src/lib/services/axomeme/session.js` is deliberately **not**
vendored: it is onnxruntime-web/browser-specific; the server has its own
session handling.

The only intentional body change anywhere in `vendor/`: the browser
`console.log` calls inside `stripEmbeddedTrees` (`alignment.js`) are removed —
on the server this code runs under the AxoMEME CLI, whose stdout **is** the
job progress file, so stray logging would corrupt job output.

## ESM -> CJS conversion recipe

Each vendored file is converted mechanically, in exactly three steps:

1. Prepend the `/* VENDORED from veg/datamonkey3 ... */` provenance header
   (source path, upstream commit, pointer to this README).
2. Convert imports: `import { a, b } from './x.js';` becomes
   `const { a, b } = require("./x.js");` (double quotes on the require path;
   everything else in the file keeps upstream formatting).
3. Strip the `export ` keyword from each declaration and add a single
   `module.exports = { ... };` block at the bottom of the file listing every
   symbol that was exported upstream.

Function bodies are otherwise verbatim (sole exception: the
`stripEmbeddedTrees` logging removal noted above).

### Rejected alternative: ESM subpackage

We considered keeping the files as untouched ESM in a `"type": "module"`
subdirectory (zero-diff vendoring). Rejected because datamonkey-js-server is
CommonJS throughout: every consumer would need dynamic `import()` with async
plumbing up the call stack (the analysis constructors and MCP spawn path are
synchronous `require` users), Mocha/nyc/eslint tooling here is configured for
CJS, and a mixed module graph has bitten this codebase's tooling before. The
3-step mechanical conversion keeps `diff` noise against upstream limited to
the header, import lines, and export block.

## Model

`model/axomeme_2.0_viral_finetuned.onnx`
- sha256: `3e06b591a060fca996a41c040c2c29f319aa47ca3d3401f4757571b57e6faec6`
- size: 3,782,234 bytes
- Marked `binary` in `.gitattributes`.

## onnxruntime-node pin

`onnxruntime-node` is pinned to **exactly 1.23.2**: it is the last release
that ships darwin/x64 (Intel Mac) prebuilt bindings, which local dev still
needs. Prod/CI are linux/x64 and would work on newer versions; bump to latest
once Intel-Mac dev is dropped. Known deviation: DM3 uses `onnxruntime-web`
`^1.27` in the browser — the ONNX opset used by the model runs on both.
`.npmrc` sets `onnxruntime-node-install=skip`, which only skips the optional
linux CUDA 12 binary download at install time.

## Syncing from DM3

1. In a datamonkey3 clone at the commit you are syncing to, re-copy the
   upstream sources listed in the table above over `lib/axomeme/vendor/`
   (for the two composite files, re-extract the listed symbols).
2. Re-apply the 3-step conversion recipe (header with the NEW upstream
   commit hash, import rewrite, export block) and re-remove the
   `stripEmbeddedTrees` console.log calls.
3. Diff-check each 1:1 file against upstream — bodies must match except
   header/imports/exports. Example:

   ```sh
   diff <(sed -e '/^\/\* VENDORED/,/^ \*\//d' \
              -e 's/^const {\(.*\)} = require("\(.*\)");$/import {\1} from '\''\2'\'';/' \
              lib/axomeme/vendor/assemble.js) \
        /path/to/datamonkey3/src/lib/services/axomeme/assemble.js
   ```

   Expect the only remaining hunks to be `export ` keywords and the
   trailing `module.exports` block.
4. Update the commit hash/date in this README and run
   `npm run lint && npm run test:axomeme-unit`.
