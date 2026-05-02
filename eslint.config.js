//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
      // Forbid `../../other-package/...` style imports — when crossing a
      // package boundary, you must use the package name (e.g.
      // `@projectproject/shared`). Keeps the workspace's public-API
      // boundary honest.
      "import/no-relative-packages": "error"
    }
  },
  {
    ignores: ["eslint.config.js", "prettier.config.js"]
  }
]
