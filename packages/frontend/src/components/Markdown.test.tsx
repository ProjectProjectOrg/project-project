import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Markdown } from "./Markdown"

describe("Markdown", () => {
  it("escapes HTML comments by default", () => {
    const html = renderToStaticMarkup(
      <Markdown>{"before\n\n<!-- hidden -->\n\nafter"}</Markdown>
    )

    expect(html).toContain("before")
    expect(html).toContain("&lt;!-- hidden --&gt;")
    expect(html).toContain("after")
  })

  it("skips HTML comments when requested", () => {
    const html = renderToStaticMarkup(
      <Markdown htmlPolicy="skip">
        {"before\n\n<!-- hidden -->\n\nafter"}
      </Markdown>
    )

    expect(html).toContain("before")
    expect(html).not.toContain("hidden")
    expect(html).not.toContain("&lt;!-- hidden --&gt;")
    expect(html).toContain("after")
  })

  it("renders GFM list content with skipped HTML", () => {
    const html = renderToStaticMarkup(
      <Markdown htmlPolicy="skip">
        {
          "<!-- generated -->\n\n## Summary by CodeRabbit\n\n- **New Features**\n  - Added user information retrieval."
        }
      </Markdown>
    )

    expect(html).toContain("Summary by CodeRabbit")
    expect(html).toContain("<strong>New Features</strong>")
    expect(html).toContain("Added user information retrieval.")
    expect(html).not.toContain("generated")
  })

  it("keeps normal markdown links with skipped HTML", () => {
    const html = renderToStaticMarkup(
      <Markdown htmlPolicy="skip">
        {
          "<!-- review_stack_entry_start -->\n\n[Review Change Stack →](https://example.com)\n\n<!-- review_stack_entry_end -->"
        }
      </Markdown>
    )

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain("Review Change Stack")
    expect(html).not.toContain("review_stack_entry_start")
    expect(html).not.toContain("review_stack_entry_end")
  })
})
