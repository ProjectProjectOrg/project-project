import type { Element, ElementContent, Root } from "hast"
import { expect, it } from "vitest"

import { rehypeHighlight } from "./markdown-highlight"

const segments: (node: ElementContent, classes: string) => Array<string> = (
  node,
  classes
) => {
  if (node.type === "text") return [`${classes}|${node.value}`]
  if (node.type !== "element") return []
  const own = node.properties.className
  const next = Array.isArray(own) ? own.join(" ") : classes
  return node.children.flatMap((child) => segments(child, next))
}

it("numbers each line and keeps a token's class on every line it spans", () => {
  const code: Element = {
    type: "element",
    tagName: "code",
    properties: { className: ["language-ts"] },
    children: [{ type: "text", value: "/* one\ntwo */\nconst x = 1\n" }]
  }
  const tree: Root = {
    type: "root",
    children: [
      { type: "element", tagName: "pre", properties: {}, children: [code] }
    ]
  }
  rehypeHighlight()(tree)
  expect(
    code.children.map((line) =>
      line.type === "element"
        ? [line.properties.line, line.children.flatMap((c) => segments(c, ""))]
        : null
    )
  ).toEqual([
    [1, ["token comment|/* one", "|\n"]],
    [2, ["token comment|two */", "|\n"]],
    [
      3,
      [
        "token keyword|const ",
        "|x ",
        "token punctuation|= ",
        "token number|1",
        "|\n"
      ]
    ]
  ])
})
