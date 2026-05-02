import { defineConfig } from "vitest/config"

// Minimal Vitest config for the backend package.
//
// Why this exists:
//   - `vitest run` looks for `*.test.ts` files anywhere under the project. The
//     defaults here are intentionally tiny — we just point it at `src/` so it
//     doesn't wander into `node_modules` or `dist`.
//   - `globals: false` (the default) keeps `it`/`expect` as explicit imports.
//     With `@effect/vitest` you import `it` from `@effect/vitest`, not from
//     globals, so don't enable it.
//
// We don't need any plugins — backend tests don't render React, don't bundle
// CSS, and run as plain TypeScript that Vitest compiles via esbuild.

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
})
