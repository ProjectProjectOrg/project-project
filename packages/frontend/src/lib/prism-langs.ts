// Side-effect-only module: registers extra languages on both Prism instances
// the app uses. Import this once before either highlighter renders.
//
//   - The global `prismjs` singleton — used by `@lexical/code` inside the
//     editor. Adding to it requires `import "prismjs/components/prism-X.js"`,
//     which mutates `Prism.languages` on import.
//   - The `refractor` instance — a separate forked Prism used by
//     `rehype-prism-plus` on the read view. Add via `refractor.register(...)`.
//
// Both bundles ship a curated set of languages by default, but they each
// leave out `tsx` and `jsx` (and Lexical's set additionally lacks bash, json,
// yaml, go). We extend both here so a fenced ` ```tsx ` block renders the
// same in the editor and in the rendered markdown.
//
// We do NOT register `diff` on prism — `@lexical/code-prism` ships its own
// custom diff grammar with extra structure (PREFIXES, line numbers) that
// would be clobbered by the standard one.

// --- Editor side (global Prism singleton) -----------------------------------
import "prismjs/components/prism-jsx.js"
import "prismjs/components/prism-tsx.js"
import "prismjs/components/prism-bash.js"
import "prismjs/components/prism-yaml.js"
import "prismjs/components/prism-json.js"
import "prismjs/components/prism-go.js"
import "prismjs/components/prism-toml.js"

// --- Read side (refractor) --------------------------------------------------
// Refractor's package.json maps `./*` to `./lang/*.js`, so the subpath import
// looks like `refractor/jsx` (not `refractor/lang/jsx.js`).
import { refractor } from "refractor"
import jsx from "refractor/jsx"
import tsx from "refractor/tsx"

refractor.register(jsx)
refractor.register(tsx)
