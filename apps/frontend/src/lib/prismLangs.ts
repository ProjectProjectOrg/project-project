// Don't register `diff` on prism: @lexical/code-prism ships its own diff grammar.

import "prismjs"
import "prismjs/components/prism-jsx.js"
import "prismjs/components/prism-tsx.js"
import "prismjs/components/prism-bash.js"
import "prismjs/components/prism-yaml.js"
import "prismjs/components/prism-json.js"
import "prismjs/components/prism-go.js"
import "prismjs/components/prism-toml.js"
import { refractor } from "refractor"
import jsx from "refractor/jsx"
import toml from "refractor/toml"
import tsx from "refractor/tsx"

refractor.register(jsx)
refractor.register(tsx)
refractor.register(toml)
