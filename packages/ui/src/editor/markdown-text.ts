import {
  advanceFence,
  normalizeLineEndings,
  parseAttachmentUrl
} from "@pp/shared"
import { Children, isValidElement, type ReactNode } from "react"
import { defaultUrlTransform } from "react-markdown"

// Text helpers for read-only Markdown: link references, empty task items, and reading a link's children.

export const allowMentionUrls = (url: string) => {
  if (url.startsWith("mention:")) return url
  if (parseAttachmentUrl(url)) return url
  return defaultUrlTransform(url)
}

export const attachmentLabel: (children: ReactNode) => string = (children) =>
  Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child)
      if (isValidElement<{ children?: ReactNode }>(child))
        return attachmentLabel(child.props.children)
      return ""
    })
    .join("")

export const containsImage: (children: ReactNode) => boolean = (children) =>
  Children.toArray(children).some(
    (child) =>
      isValidElement<{ src?: string; children?: ReactNode }>(child) &&
      (child.props.src !== undefined || containsImage(child.props.children))
  )

export const plainText = (children: ReactNode) => {
  const parts = Children.toArray(children)
  return parts.every((part) => typeof part === "string") ? parts.join("") : null
}

export const LINK_REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S/

export const linkReferenceDefinitions = (markdown: string) => {
  let fence: string | null = null
  const definitions: Array<string> = []
  for (const line of normalizeLineEndings(markdown).split("\n")) {
    const insideCode = fence !== null || advanceFence(line, null) !== null
    fence = advanceFence(line, fence)
    if (!insideCode && LINK_REFERENCE_DEFINITION.test(line))
      definitions.push(line)
  }
  return definitions.join("\n")
}

export const EMPTY_TASK_ITEM =
  /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\])[ \t]*$/

export const withEmptyTaskItems = (markdown: string) => {
  let fence: string | null = null
  return normalizeLineEndings(markdown)
    .split("\n")
    .map((line) => {
      const insideCode = fence !== null || advanceFence(line, null) !== null
      fence = advanceFence(line, fence)
      return insideCode ? line : line.replace(EMPTY_TASK_ITEM, "$1 &nbsp;")
    })
    .join("\n")
}

export const taskLineOf = (element: Element) => {
  const line = element
    .closest("li[data-task-line]")
    ?.getAttribute("data-task-line")
  return line === null || line === undefined ? null : Number(line)
}
