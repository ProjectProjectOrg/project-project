import { CODE_TOKEN_KINDS } from "../lib/highlight"

/*
 * The editor's Lexical theme: the class names its nodes render with, which
 * prose.css styles under `.prose-md`. Code highlighting (code-highlight.ts)
 * gives each token one of the CODE_TOKEN_KINDS colours.
 */

export const editorTheme = {
  tableScrollableWrapper: "lexical-table-scroll",
  tableCellSelected: "lexical-table-cell-selected",
  tableSelection: "lexical-table-selection",
  paragraph: "lexical-paragraph",
  heading: {
    h1: "lexical-h1",
    h2: "lexical-h2",
    h3: "lexical-h3",
    h4: "lexical-h4",
    h5: "lexical-h5",
    h6: "lexical-h6"
  },
  quote: "lexical-quote",
  list: {
    ul: "lexical-ul",
    ol: "lexical-ol",
    listitem: "lexical-li",
    checklist: "lexical-checklist",
    listitemChecked: "lexical-li-checked",
    listitemUnchecked: "lexical-li-unchecked",
    nested: {
      listitem: "lexical-li-nested"
    }
  },
  hr: "lexical-hr",
  link: "lexical-link",
  text: {
    bold: "lexical-bold",
    italic: "lexical-italic",
    strikethrough: "lexical-strike",
    underline: "lexical-underline"
  },
  code: "lexical-code",
  codeHighlight: Object.fromEntries(
    CODE_TOKEN_KINDS.map((kind) => [kind, `token ${kind}`])
  )
}
