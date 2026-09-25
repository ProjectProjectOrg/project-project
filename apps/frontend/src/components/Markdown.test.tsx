import { formatAttachmentMarkdown } from "@pp/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "./Markdown"

afterEach(cleanup)

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"

describe("Markdown attachments", () => {
  it("renders an attachment image with a lazy loading hint", () => {
    render(<Markdown>{`![shot](/api/attachments/acme/${ID})`}</Markdown>)
    const img = screen.getByAltText("shot")
    expect(img.getAttribute("src")).toBe(`/api/attachments/acme/${ID}`)
    expect(img.getAttribute("loading")).toBe("lazy")
  })

  it("keeps an external image working", () => {
    render(<Markdown>{"![ext](https://example.test/a.png)"}</Markdown>)
    expect(screen.getByAltText("ext").getAttribute("src")).toBe(
      "https://example.test/a.png"
    )
  })

  it("still renders mention chips", () => {
    render(<Markdown>{"[T-1](mention:ticket/T-1)"}</Markdown>)
    expect(screen.getByText("T-1")).toBeDefined()
  })

  it("strips a javascript: image url", () => {
    render(<Markdown>{"![x](javascript:alert(1))"}</Markdown>)
    const src = screen.getByAltText("x").getAttribute("src") ?? ""
    expect(src.startsWith("javascript:")).toBe(false)
  })
})

describe("Markdown attachment density", () => {
  it("renders compact images as chips without an expanded image", () => {
    render(
      <Markdown>{`![shot](/api/attachments/acme/${ID}?w=320&d=compact)`}</Markdown>
    )
    expect(screen.getByText("shot")).toBeDefined()
    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.getByRole("link").getAttribute("download")).toBe("shot")
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      `/api/attachments/acme/${ID}?download=1`
    )
  })

  it("renders compact file attachments as download chips", () => {
    render(
      <Markdown>{`[archive.zip](/api/attachments/acme/${ID}?d=compact)`}</Markdown>
    )
    expect(screen.getByText("archive.zip")).toBeDefined()
    expect(screen.getByRole("link").getAttribute("download")).toBe(
      "archive.zip"
    )
  })

  it("keeps rich image width", () => {
    render(<Markdown>{`![shot](/api/attachments/acme/${ID}?w=320)`}</Markdown>)
    expect(screen.getByAltText("shot").style.width).toBe("320px")
  })

  it("does not treat external image parameters as attachment density", () => {
    render(
      <Markdown>{"![ext](https://example.test/a.png?d=compact)"}</Markdown>
    )
    expect(screen.getByAltText("ext")).toBeDefined()
  })

  it("preserves ordinary and rich attachment links", () => {
    render(
      <Markdown>{`[archive.zip](/api/attachments/acme/${ID}) and [external](https://example.test/?d=compact)`}</Markdown>
    )
    expect(
      screen.getByRole("link", { name: "archive.zip" }).hasAttribute("download")
    ).toBe(false)
    expect(
      screen.getByRole("link", { name: "external" }).getAttribute("href")
    ).toBe("https://example.test/?d=compact")
  })
})

it("preserves filenames containing markdown syntax in compact chips", () => {
  const filename = "a*bold*_name_`code`&copy;.zip"
  render(
    <Markdown>
      {formatAttachmentMarkdown({
        kind: "file",
        alt: filename,
        url: `/api/attachments/acme/${ID}`,
        density: "compact"
      })}
    </Markdown>
  )
  expect(screen.getByText(filename)).toBeDefined()
  expect(screen.getByRole("link").getAttribute("download")).toBe(filename)
})

it("keeps formatted labels readable on hand-authored compact links", () => {
  render(
    <Markdown>{`[**report**.pdf](/api/attachments/acme/${ID}?d=compact)`}</Markdown>
  )
  expect(screen.getByText("report.pdf")).toBeDefined()
})

it("preserves links around compact images without nesting download links", () => {
  render(
    <Markdown>{`[**![shot](/api/attachments/acme/${ID}?d=compact)**](https://example.test)`}</Markdown>
  )
  expect(screen.getAllByRole("link")).toHaveLength(1)
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://example.test"
  )
  expect(screen.getByText("shot")).toBeDefined()
  expect(screen.queryByRole("img")).toBeNull()
})

describe("Markdown ticket blocks", () => {
  it("resolves a reference link inside a block from a definition outside it", () => {
    render(
      <Markdown>
        {
          '<block type="notes">\n\n## Notes\n\nSee [spec][1]\n\n</block>\n\n[1]: https://example.com/spec'
        }
      </Markdown>
    )
    expect(
      screen.getByRole("link", { name: "spec" }).getAttribute("href")
    ).toBe("https://example.com/spec")
    expect(screen.queryByText(/\[spec\]/)).toBeNull()
  })

  it("does not pick up a reference definition from a fence or a comment", () => {
    render(
      <Markdown>
        {
          'See [spec][1] and [plan][2]\n\n<block type="notes">\n\nx\n\n</block>\n\n```\n[1]: https://example.com/spec\n```\n\n<!--\n[2]: https://example.com/plan\n-->'
        }
      </Markdown>
    )
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("renders a block in a frame around its markdown", () => {
    const { container } = render(
      <Markdown>
        {
          'Intro.\n\n<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n- [ ] One\n\n</block>'
        }
      </Markdown>
    )
    const block = container.querySelector(".ticket-block")
    expect(block?.getAttribute("data-block-type")).toBe("acceptance-criteria")
    expect(block?.querySelector("h2")?.textContent).toBe("Acceptance criteria")
    expect(container.textContent).not.toContain("<block")
    expect(screen.getByText("Intro.")).toBeDefined()
  })

  it("parses markdown inside a block written without blank lines", () => {
    const { container } = render(
      <Markdown>{'<block type="notes">\n## Notes\n- item\n</block>'}</Markdown>
    )
    expect(container.querySelector(".ticket-block h2")?.textContent).toBe(
      "Notes"
    )
    expect(container.querySelector(".ticket-block li")?.textContent).toBe(
      "item"
    )
  })

  it("leaves a block inside an HTML comment to the comment", () => {
    const { container } = render(
      <Markdown>
        {'Intro.\n\n<!--\n<block type="notes">\n\nsecret\n\n</block>\n-->'}
      </Markdown>
    )
    expect(container.querySelector(".ticket-block")).toBeNull()
    expect(container.textContent).toContain('<block type="notes">')
  })

  it("shows a block example inside a code fence as code", () => {
    const { container } = render(
      <Markdown>{'```md\n<block type="notes">\n</block>\n```'}</Markdown>
    )
    expect(container.querySelector(".ticket-block")).toBeNull()
    expect(container.querySelector("code")?.textContent).toContain(
      '<block type="notes">'
    )
  })
})

describe("Markdown block frame", () => {
  it("shows the definition icon in the text colour for a known block", () => {
    const { container } = render(
      <Markdown>
        {
          '<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n- [ ] One\n\n</block>'
        }
      </Markdown>
    )
    const icon = container.querySelector(".ticket-block-icon")
    const glyph = icon?.querySelector("[data-block-icon]")
    expect(icon?.getAttribute("aria-label")).toBe("Acceptance criteria · org")
    expect(glyph?.getAttribute("data-block-icon")).toBe("ListChecks")
    expect(glyph?.getAttribute("style")).toBeNull()
    expect(container.firstElementChild?.classList).toContain("block-gutter")
  })

  it("falls back to generic chrome for an unknown block", () => {
    const { container } = render(
      <Markdown>
        {'<block type="release-notes">\n\n## Notes\n\nText\n\n</block>'}
      </Markdown>
    )
    const icon = container.querySelector(".ticket-block-icon")
    const glyph = icon?.querySelector("[data-block-icon]")
    expect(icon?.getAttribute("aria-label")).toBe("Release notes")
    expect(glyph?.getAttribute("data-block-icon")).toBe("Square")
    expect(glyph?.getAttribute("style")).toBeNull()
  })

  it("says not filled in under the heading of a blank block", () => {
    const { container } = render(
      <Markdown>
        {
          '<block type="steps-to-reproduce">\n\n## Steps to reproduce\n\n1. \n\n</block>'
        }
      </Markdown>
    )
    const block = container.querySelector(".ticket-block")
    expect(block?.querySelector("h2")?.textContent).toBe("Steps to reproduce")
    expect(block?.querySelector("ol")).toBeNull()
    expect(screen.getByText("Not filled in")).toBeDefined()
    expect(block?.hasAttribute("data-blank")).toBe(true)
  })

  it("keeps a filled block free of the blank note", () => {
    render(
      <Markdown>
        {'<block type="context">\n\n## Context\n\nWhy.\n\n</block>'}
      </Markdown>
    )
    expect(screen.queryByText("Not filled in")).toBeNull()
  })

  it("marks a synced block for the dashed outline", () => {
    const { container } = render(
      <Markdown>
        {
          '<block type="definition-of-done" sync>\n\n## Definition of done\n\n- [x] Reviewed\n\n</block>'
        }
      </Markdown>
    )
    expect(
      container.querySelector(".ticket-block")?.hasAttribute("data-sync")
    ).toBe(true)
  })

  it("renders blocks without chrome when flat", () => {
    const { container } = render(
      <Markdown blocks="flat">
        {'Intro.\n\n<block type="context">\n\n## Context\n\n</block>'}
      </Markdown>
    )
    expect(container.querySelector(".ticket-block")).toBeNull()
    expect(container.querySelector("h2")?.textContent).toBe("Context")
    expect(container.firstElementChild?.classList).not.toContain("block-gutter")
  })

  it("leaves plain markdown without a gutter", () => {
    const { container } = render(<Markdown>{"Just text."}</Markdown>)
    expect(container.firstElementChild?.classList).not.toContain("block-gutter")
  })
})

describe("Markdown empty task items", () => {
  const checklist = (items: string) =>
    `<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n${items}\n\n</block>`

  it.each([
    ["with a trailing space", "- [ ] Signed in\n- [ ] "],
    ["without a trailing space", "- [ ] Signed in\n- [ ]"],
    ["ticked", "- [ ] Signed in\n- [x]"]
  ])(
    "renders an empty item of a partly filled checklist as a checkbox %s",
    (_, items) => {
      for (const blocks of ["frame", "flat"] as const) {
        const { container } = render(
          <Markdown blocks={blocks}>{checklist(items)}</Markdown>
        )
        expect(
          container.querySelectorAll("li input[type=checkbox]")
        ).toHaveLength(2)
        expect(container.textContent).not.toContain("[ ]")
        expect(container.textContent).not.toContain("[x]")
        cleanup()
      }
    }
  )

  it("keeps an escaped marker as literal text", () => {
    const { container } = render(<Markdown>{"- \\[ ] literal"}</Markdown>)
    expect(container.querySelector("input")).toBeNull()
    expect(container.textContent).toContain("[ ] literal")
  })

  it("leaves task markers inside code alone", () => {
    const { container } = render(<Markdown>{"```md\n- [ ]\n```"}</Markdown>)
    expect(container.querySelector("code")?.textContent).toBe("- [ ]\n")
  })
})
