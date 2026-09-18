import { defineConfig } from "vite-plus"

export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: ["packages/*/vite.config.ts"]
  },
  lint: {
    categories: {
      correctness: "error",
      suspicious: "warn",
      perf: "warn"
    },
    jsPlugins: [
      {
        name: "workspace",
        specifier: "./tools/oxlint-plugin-workspace.js"
      },
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts"
      },
      {
        name: "anti-slop-effect",
        specifier: "./tools/oxlint/anti-slop/effect/index.ts"
      }
    ],
    options: {
      typeAware: true,
      typeCheck: false
    },
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    rules: {
      "react-in-jsx-scope": "off",
      "react/refs": "warn",
      "react/set-state-in-effect": "warn",
      "react/immutability": "warn",
      "react/static-components": "warn",
      "eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "eslint/no-underscore-dangle": "off",
      "workspace/no-relative-packages": "error",
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "warn",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "warn",
      "anti-slop/no-conditional-empty-object-spread": "warn",
      "anti-slop/no-known-value-widening": "warn",
      "anti-slop/no-module-mocking": "warn",
      "anti-slop/no-object-parameters": "warn",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "warn",
      "anti-slop/no-runtime-typeof": "warn",
      "anti-slop/no-shape-in-symbol-names": "off",
      "anti-slop/no-unknown-parameters": "warn",
      "anti-slop/no-unknown-returns": "warn",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "warn",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "off",
      "anti-slop/require-safety-comment-for-type-assertion": "off",
      "anti-slop-effect/no-manual-effect-error-tag": "warn",
      "anti-slop-effect/no-manual-tag-comparison": "warn",
      "anti-slop-effect/no-manual-tagged-construction": "warn",
      "anti-slop-effect/no-service-constructor-imports": "error",
      "anti-slop-effect/prefer-effect-match": "warn"
    },
    ignorePatterns: [
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".superpowers/**",
      ".windsurf/**",
      "opensrc/**",
      "tools/oxlint/anti-slop/**",
      "node_modules",
      "bun.lock",
      "*.tsbuildinfo",
      "**/routeTree.gen.ts",
      "**/*.md"
    ]
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    trailingComma: "none",
    arrowParens: "always",
    objectWrap: "preserve",
    sortImports: false,
    sortPackageJson: false,
    ignorePatterns: [
      ".agent/**",
      ".agents/**",
      ".claude/**",
      ".codex/**",
      ".continue/**",
      ".cursor/**",
      ".gemini/**",
      ".opencode/**",
      ".pi/**",
      ".roo/**",
      ".superpowers/**",
      ".windsurf/**",
      "opensrc/**",
      "tools/oxlint/anti-slop/**",
      "**/node_modules",
      "**/dist",
      "**/build",
      "**/.next",
      "**/db/migrations/**/snapshot.json",
      "docs/everhour-api-schema.yml",
      "bun.lock",
      "**/routeTree.gen.ts",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "**/*.md"
    ]
  }
})
