import type { ElementTransformer } from "@lexical/markdown"
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableNode,
  TableRowNode,
  TableCellNode
} from "@lexical/table"
import { $isElementNode } from "lexical"

export const TABLE_TRANSFORMER: ElementTransformer = {
  type: "element",
  dependencies: [TableNode, TableRowNode, TableCellNode],
  regExp: /$^/,
  replace: () => false,
  export: (node, traverseChildren) => {
    if (!$isTableNode(node)) return null
    const rows = node.getChildren().filter($isTableRowNode)
    const header = rows[0]?.getChildren().filter($isTableCellNode) ?? []
    if (header.length === 0) return ""
    const output = rows.map((row) => {
      const cells = row
        .getChildren()
        .filter($isTableCellNode)
        .map((cell) =>
          cell
            .getChildren()
            .map((child) =>
              $isElementNode(child)
                ? traverseChildren(child)
                : child.getTextContent()
            )
            .join("&#10;")
            .replace(/\|/g, "\\|")
            .replace(/\n/g, "&#10;")
        )
      return `| ${cells.join(" | ")} |`
    })
    const delimiter = header.map((cell) => {
      switch (cell.getFormatType()) {
        case "left":
          return ":---"
        case "center":
          return ":---:"
        case "right":
          return "---:"
        default:
          return "---"
      }
    })
    output.splice(1, 0, `| ${delimiter.join(" | ")} |`)
    return output.join("\n")
  }
}
