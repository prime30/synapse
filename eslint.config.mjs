import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Allow explicit any in test files
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Downgrade strict React Compiler hooks rules to warn (many existing patterns)
  {
    files: ["**/*.tsx", "**/*.jsx", "**/hooks/**/*.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Synced theme assets (minified/vendor JS) — not project source
    ".synapse-themes/**",
    // Root-level scripts (CommonJS / Electron)
    "_write_card.js",
    "_write_rule.js",
    "_v2_stream_patch.js",
    "fix-lazysizes.js",
    "electron/**",
    // Theme workspace (vendor/minified assets)
    "theme-workspace/**",
    // Local theme cache (synced vendor/minified assets)
    ".cache/**",
  ]),
]);

export default eslintConfig;
