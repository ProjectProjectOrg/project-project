import {
  CodeExtension,
  PrismTokenizer,
  registerCodeHighlighting
} from "@lexical/code"
import { defineExtension, type LexicalEditor } from "lexical"

import "../lib/prismLangs"

/*
 * The editor's Lexical theme: the class names its nodes render with, which
 * prose.css styles under `.prose-md`. Plus code highlighting (Prism) for
 * code blocks.
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
  codeHighlight: {
    atrule: "token atrule",
    attr: "token attr-name",
    boolean: "token boolean",
    builtin: "token builtin",
    cdata: "token cdata",
    char: "token char",
    "class-name": "token class-name",
    comment: "token comment",
    constant: "token constant",
    deleted: "token deleted",
    doctype: "token doctype",
    entity: "token entity",
    function: "token function",
    important: "token important",
    inserted: "token inserted",
    keyword: "token keyword",
    namespace: "token namespace",
    number: "token number",
    operator: "token operator",
    prolog: "token prolog",
    property: "token property",
    punctuation: "token punctuation",
    regex: "token regex",
    selector: "token selector",
    string: "token string",
    symbol: "token symbol",
    tag: "token tag",
    url: "token url",
    variable: "token variable",
    "deleted-sign": "token deleted-sign",
    "deleted-arrow": "token deleted-arrow",
    "inserted-sign": "token inserted-sign",
    "inserted-arrow": "token inserted-arrow",
    unchanged: "token unchanged",
    diff: "token diff",
    coord: "token coord",
    line: "token line",
    prefix: "token prefix"
  }
}

// Lexical's tokenizer, with "plain" as the default language: a block without
// one stays unhighlighted (Prism has no "plain" grammar) instead of becoming
// JavaScript, and saves as a bare fence (CODE_BLOCK in
// editor-transformers.ts). It can't be empty: Lexical stores "" as no
// language and would keep re-applying the default until it gave up.
export const PLAIN_CODE_LANGUAGE = "plain"
const plainByDefault = {
  ...PrismTokenizer,
  defaultLanguage: PLAIN_CODE_LANGUAGE
}

export const CodeHighlightExtension = defineExtension({
  name: "@pp/code-highlight",
  dependencies: [CodeExtension],
  register: (editor: LexicalEditor) =>
    registerCodeHighlighting(editor, plainByDefault)
})
