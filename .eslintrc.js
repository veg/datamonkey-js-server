module.exports = {
    "env": {
        "node": true,
        "es6": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 2021,
        "sourceType": "script"
    },
    "rules": {
        // Phase 4c (#410): modern block-scoped declarations. no-var is a
        // CI-blocking error; prefer-const nudges immutable bindings.
        "no-var": "error",
        "prefer-const": "error",
        "indent": [
            "error",
            2
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "double",
            { "avoidEscape": true }
        ],
        // Relaxed for the v4 lint-CI-blocking transition (#410): using the
        // `undefined` literal is legitimate here, and unused vars are a
        // warning (cleanup tracked separately) rather than a CI blocker.
        "no-undefined": "off",
        "no-unused-vars": "warn",
        // Empty catch blocks are used intentionally to swallow non-fatal
        // errors (e.g. best-effort cleanup); allow them.
        "no-empty": ["error", { "allowEmptyCatch": true }],
        "semi": [
            "off",
            "never"
        ]
    }
};
