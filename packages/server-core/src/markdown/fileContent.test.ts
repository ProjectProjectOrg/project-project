import { afterEach, describe, expect, it, vi } from "vitest"

import { markdownFileContent, parseMarkdownFile } from "./fileContent"

afterEach(() => vi.unstubAllGlobals())

describe("markdownFileContent", () => {
  it.each(["javascript", "js", "JavaScript", "JS"])(
    "preserves a %s frontmatter-looking body without executing it",
    (language) => {
      const executed = vi.fn()
      vi.stubGlobal("__ppFrontmatterExecuted", executed)
      const body = `---${language}\n(globalThis.__ppFrontmatterExecuted(), {})\n---\nBody\n`

      expect(markdownFileContent({ title: "Ticket" }, body)).toBe(
        `---\ntitle: Ticket\n---\n${body}`
      )
      expect(executed).not.toHaveBeenCalled()
    }
  )

  it("keeps YAML-looking body text separate from file metadata", () => {
    const body = "---\nassignees: [injected]\n---\nExample\n"

    expect(markdownFileContent({ title: "Ticket" }, body)).toBe(
      `---\ntitle: Ticket\n---\n${body}`
    )
  })
})

describe("parseMarkdownFile", () => {
  it.each(["javascript", "js", "JavaScript", "JS", " js "])(
    "rejects %s frontmatter without executing it, including repeated reads",
    (language) => {
      const executed = vi.fn()
      vi.stubGlobal("__ppFrontmatterExecuted", executed)
      const raw = `\uFEFF---${language}\r\n(globalThis.__ppFrontmatterExecuted(), {})\r\n---\r\nBody`

      for (let i = 0; i < 2; i++) {
        expect(() => parseMarkdownFile(raw)).toThrow(
          "JavaScript frontmatter is not supported"
        )
      }
      expect(executed).not.toHaveBeenCalled()
    }
  )

  it.each(["", "yaml", "yml", "json"])(
    "continues to read %s data frontmatter",
    (language) => {
      const data = { title: "Ticket", tags: ["bug"], archived: false }
      const raw = `---${language}\n${JSON.stringify(data)}\n---\nBody\n`

      expect(parseMarkdownFile(raw)).toEqual({ data, content: "Body\n" })
    }
  )

  it("round-trips nested YAML metadata and ordinary markdown", () => {
    const data = { title: "Ticket", settings: { enabled: true }, tags: ["bug"] }
    const content = "# Heading\n\nA paragraph.\n"

    expect(parseMarkdownFile(markdownFileContent(data, content))).toEqual({
      data,
      content
    })
  })

  it("reads markdown without frontmatter", () => {
    expect(parseMarkdownFile("# Heading\n")).toEqual({
      data: {},
      content: "# Heading\n"
    })
  })
})
