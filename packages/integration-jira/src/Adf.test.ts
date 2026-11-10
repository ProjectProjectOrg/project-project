import type * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { convertAdfToMarkdown, rewriteJiraReferences } from "./Adf"

describe("convertAdfToMarkdown", () => {
  it("converts the supported block and inline nodes to deterministic Markdown", () => {
    const document: Schema.Json = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Migration notes" }]
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Plain " },
            { type: "text", text: "bold", marks: [{ type: "strong" }] },
            { type: "text", text: ", " },
            { type: "text", text: "emphasis", marks: [{ type: "em" }] },
            { type: "text", text: ", " },
            { type: "text", text: "removed", marks: [{ type: "strike" }] },
            { type: "text", text: ", " },
            { type: "text", text: "const x = 1", marks: [{ type: "code" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "a link",
              marks: [
                { type: "link", attrs: { href: "https://example.com/docs" } }
              ]
            }
          ]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }]
                },
                {
                  type: "orderedList",
                  attrs: { order: 3 },
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { state: "TODO" },
              content: [{ type: "text", text: "Open task" }]
            },
            {
              type: "taskItem",
              attrs: { state: "DONE" },
              content: [{ type: "text", text: "Closed task" }]
            }
          ]
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Name" }]
                    }
                  ]
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "State" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Parser" }]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Ready" }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        { type: "rule" },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const value = 1\n" }]
        }
      ]
    }

    const expected = [
      "## Migration notes",
      "",
      "Plain **bold**, *emphasis*, ~~removed~~, `const x = 1`  ",
      "[a link](https://example.com/docs)",
      "",
      "- First",
      "  3. Nested",
      "- Second",
      "",
      "- [ ] Open task",
      "- [x] Closed task",
      "",
      "| Name | State |",
      "| --- | --- |",
      "| Parser | Ready |",
      "",
      "---",
      "",
      "```ts",
      "const value = 1",
      "```"
    ].join("\n")

    expect(convertAdfToMarkdown(document)).toEqual({
      markdown: expected,
      warnings: [],
      references: []
    })
    expect(convertAdfToMarkdown(document)).toEqual(
      convertAdfToMarkdown(document)
    )
  })

  it("extracts every Jira reference with stable document-order placeholders", () => {
    const document: Schema.Json = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "inlineCard",
              attrs: { url: "https://jira.example.com/browse/ABC-12" }
            },
            { type: "text", text: " and " },
            {
              type: "text",
              text: "outside [project]",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://jira.example.com/browse/OTHER-4" }
                }
              ]
            }
          ]
        },
        {
          type: "mediaSingle",
          content: [
            {
              type: "media",
              attrs: {
                id: "attachment-7",
                alt: "diagram [final].png",
                url: "https://jira.example.com/secure/attachment/7/file.png"
              }
            }
          ]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: { id: "account-1", text: "@Ada [Admin]" }
            },
            { type: "text", text: " and " },
            {
              type: "mention",
              attrs: { id: "account-2", text: "@Former User" }
            },
            { type: "text", text: " again " },
            {
              type: "inlineCard",
              attrs: { url: "https://jira.example.com/browse/ABC-12" }
            }
          ]
        }
      ]
    }

    const result = convertAdfToMarkdown(document)

    expect(result.references).toEqual([
      {
        kind: "jira-issue",
        sourceId: "ABC-12",
        placeholder: "\uE000jira-reference:000000\uE001",
        originalUrl: "https://jira.example.com/browse/ABC-12",
        fallbackText: "ABC-12"
      },
      {
        kind: "jira-issue",
        sourceId: "OTHER-4",
        placeholder: "\uE000jira-reference:000001\uE001",
        originalUrl: "https://jira.example.com/browse/OTHER-4",
        fallbackText: "outside [project]"
      },
      {
        kind: "jira-attachment",
        sourceId: "attachment-7",
        placeholder: "\uE000jira-reference:000002\uE001",
        originalUrl: "https://jira.example.com/secure/attachment/7/file.png",
        fallbackText: "diagram [final].png"
      },
      {
        kind: "jira-user",
        sourceId: "account-1",
        placeholder: "\uE000jira-reference:000003\uE001",
        originalUrl: null,
        fallbackText: "@Ada [Admin]"
      },
      {
        kind: "jira-user",
        sourceId: "account-2",
        placeholder: "\uE000jira-reference:000004\uE001",
        originalUrl: null,
        fallbackText: "@Former User"
      },
      {
        kind: "jira-issue",
        sourceId: "ABC-12",
        placeholder: "\uE000jira-reference:000005\uE001",
        originalUrl: "https://jira.example.com/browse/ABC-12",
        fallbackText: "ABC-12"
      }
    ])
    expect(convertAdfToMarkdown(document)).toEqual(result)
  })

  it("rewrites destinations and readable unresolved fallbacks without placeholders", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "inlineCard",
              attrs: { url: "https://jira.example.com/browse/ABC-12" }
            },
            { type: "text", text: " / " },
            {
              type: "inlineCard",
              attrs: { url: "https://jira.example.com/browse/OTHER-4" }
            }
          ]
        },
        {
          type: "mediaSingle",
          content: [
            {
              type: "media",
              attrs: { id: "attachment-7", alt: "diagram.png" }
            }
          ]
        },
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "account-1", text: "@Ada" } },
            { type: "text", text: " / " },
            {
              type: "mention",
              attrs: { id: "account-2", text: "@Former User" }
            }
          ]
        }
      ]
    })
    const destinations = new Map([
      [
        result.references[0].placeholder,
        { url: "/orgs/acme/projects/app/tickets/ABC-12", text: "Moved [issue]" }
      ],
      [result.references[2].placeholder, { url: "/attachments/a (1)" }],
      [result.references[3].placeholder, { url: "mention:user/user-1" }]
    ])

    const markdown = rewriteJiraReferences(result, destinations)

    expect(markdown).toBe(
      "[Moved \\[issue\\]](/orgs/acme/projects/app/tickets/ABC-12) / " +
        "[OTHER-4](https://jira.example.com/browse/OTHER-4)\n\n" +
        "[diagram.png](/attachments/a%20\\(1\\))\n\n" +
        "[@Ada](mention:user/user-1) / @Former User"
    )
    expect(markdown).not.toContain("jira-reference:")
  })

  it("keeps a panel as a labelled quote with its inline status text", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "panel",
          attrs: { panelType: "info" },
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Still readable " },
                { type: "status", attrs: { text: "IN REVIEW" } }
              ]
            }
          ]
        }
      ]
    })

    expect(result).toEqual({
      markdown: "> **Info**\n> Still readable IN REVIEW",
      warnings: [],
      references: []
    })
  })

  it("returns a structured warning instead of throwing for invalid documents", () => {
    const expected = {
      markdown: "",
      warnings: [{ path: [], nodeType: "doc", reason: "invalid-document" }],
      references: []
    }

    expect(convertAdfToMarkdown(null)).toEqual(expected)
    expect(
      convertAdfToMarkdown({ type: "doc", content: "not-an-array" })
    ).toEqual(expected)
    expect(convertAdfToMarkdown({ type: "paragraph", content: [] })).toEqual(
      expected
    )
  })

  it("neutralizes only reserved comment markers and reports their text paths", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "<!-- comments:start --> <!-- comment:c_fake --> <!-- comments:end --> <!-- ordinary -->"
            }
          ]
        },
        {
          type: "codeBlock",
          content: [
            {
              type: "text",
              text: "<!-- comments:start -->\n<!-- ordinary-code -->"
            }
          ]
        }
      ]
    })

    expect(result.markdown).toBe(
      "&lt;!-- comments:start --> &lt;!-- comment:c\\_fake --> " +
        "&lt;!-- comments:end --> \\<!-- ordinary -->\n\n" +
        "```\n&lt;!-- comments:start -->\n<!-- ordinary-code -->\n```"
    )
    expect(result.warnings).toEqual([
      {
        path: ["content", 0, "content", 0],
        nodeType: "text",
        reason: "reserved-marker-neutralized"
      }
    ])
    expect(result.markdown).toContain("<!-- ordinary -->")
  })

  it("extracts attachments from valid media single and media group blocks", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "mediaSingle",
          content: [
            {
              type: "media",
              attrs: { id: "one", alt: "one.png", type: "file" }
            }
          ]
        },
        {
          type: "mediaGroup",
          content: [
            {
              type: "media",
              attrs: { id: "two", alt: "two.pdf", type: "file" }
            }
          ]
        }
      ]
    })

    expect(
      result.references.map(({ kind, sourceId, fallbackText }) => ({
        kind,
        sourceId,
        fallbackText
      }))
    ).toEqual([
      { kind: "jira-attachment", sourceId: "one", fallbackText: "one.png" },
      { kind: "jira-attachment", sourceId: "two", fallbackText: "two.pdf" }
    ])
    expect(result.warnings).toEqual([])
  })

  it("neutralizes reserved markers in every readable fallback path", () => {
    const marker = "<!-- comments:start -->"
    const ordinary = "<!-- ordinary -->"
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `${marker} ${ordinary}`,
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://jira.example.com/browse/ABC-1" }
                }
              ]
            },
            { type: "mention", attrs: { id: "user", text: marker } },
            { type: "emoji", attrs: { shortName: marker } }
          ]
        },
        {
          type: "mediaSingle",
          content: [{ type: "media", attrs: { id: "file", alt: marker } }]
        }
      ]
    })
    const markdown = rewriteJiraReferences(result, new Map())

    expect(markdown).not.toContain(marker)
    expect(markdown.match(/&lt;!-- comments:start -->/g)).toHaveLength(4)
    expect(markdown).toContain(ordinary)
    expect(
      result.warnings.filter(
        ({ reason }) => reason === "reserved-marker-neutralized"
      )
    ).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  it("preserves consecutive blank lines inside fenced code", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "first\n\n\nsecond" }]
        }
      ]
    })

    expect(result.markdown).toBe("```\nfirst\n\n\nsecond\n```")
  })

  it("preserves raw punctuation and backticks inside inline code", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a*b", marks: [{ type: "code" }] },
            { type: "text", text: " and " },
            { type: "text", text: "`tick`", marks: [{ type: "code" }] }
          ]
        }
      ]
    })

    expect(result.markdown).toBe("`a*b` and `` `tick` ``")
  })

  it("renders an emoji by its short name when it has no text", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "emoji", attrs: { shortName: ":wave:" } }]
        }
      ]
    })

    expect(result.markdown).toBe(":wave:")
    expect(result.warnings).toEqual([])
  })

  it("preserves non-link marks on Jira-linked text", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "ABC-1",
              marks: [
                { type: "strong" },
                { type: "em" },
                { type: "link", attrs: { href: "https://jira/browse/ABC-1" } }
              ]
            }
          ]
        }
      ]
    })

    expect(rewriteJiraReferences(result, new Map())).toBe(
      "[***ABC-1***](https://jira/browse/ABC-1)"
    )
  })
})

it("preserves readable text on an unsupported leaf without appending its raw payload", () => {
  const result = convertAdfToMarkdown({
    type: "doc",
    content: [
      {
        type: "appWidget",
        text: "Readable fallback",
        attrs: { secretImplementation: "opaque-app-payload" }
      }
    ]
  })
  expect(result.markdown).toBe("Readable fallback")
  expect(result.markdown).not.toContain("opaque-app-payload")
  expect(result.warnings).toEqual([
    { path: ["content", 0], nodeType: "appWidget", reason: "unsupported-node" }
  ])
})

describe("convertAdfToMarkdown block structure", () => {
  it("keeps quotes, panels, expands, decisions, cards, dates and header-less tables readable", () => {
    const text = (value: string, marks?: Schema.Json): Schema.Json =>
      marks === undefined
        ? { type: "text", text: value }
        : { type: "text", text: value, marks }
    const paragraph = (
      ...content: ReadonlyArray<Schema.Json>
    ): Schema.Json => ({
      type: "paragraph",
      content
    })
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        { type: "blockquote", content: [paragraph(text("Quoted"))] },
        {
          type: "panel",
          attrs: { panelType: "warning" },
          content: [paragraph(text("Careful"))]
        },
        {
          type: "expand",
          attrs: { title: "Details" },
          content: [paragraph(text("Hidden"))]
        },
        {
          type: "decisionList",
          content: [
            {
              type: "decisionItem",
              attrs: { state: "DECIDED" },
              content: [
                text("Ship "),
                text("it", [{ type: "strong" }]),
                text(" now", [{ type: "underline" }]),
                text(" today", [{ type: "underline" }])
              ]
            }
          ]
        },
        {
          type: "blockCard",
          attrs: { url: "https://example.com/spec" }
        },
        paragraph(
          { type: "date", attrs: { timestamp: "1767225600000" } },
          text(" # not a heading")
        ),
        paragraph(text("# Not a heading <b>either</b>")),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [paragraph(text("a"))] },
                {
                  type: "tableCell",
                  content: [paragraph(text("b")), paragraph(text("c"))]
                }
              ]
            }
          ]
        }
      ]
    })

    expect(result.markdown).toBe(
      [
        "> Quoted",
        "> **Warning**\n> Careful",
        "**Details**\n\nHidden",
        "- **Decision:** Ship **it** now today",
        "[https://example.com/spec](https://example.com/spec)",
        "2026-01-01 # not a heading",
        "\\# Not a heading \\<b>either\\</b>",
        "|  |  |\n| --- | --- |\n| a | b&#10;&#10;c |"
      ].join("\n\n")
    )
    expect(result.warnings).toEqual([
      {
        path: ["content", 3, "content", 0, "content", 2],
        nodeType: "underline",
        reason: "mark-dropped"
      }
    ])
  })

  it("turns plain-text Jira keys into references that can become ticket links", () => {
    const result = convertAdfToMarkdown({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "See APP-12 and https://x/browse/APP-13, not app-14"
            }
          ]
        }
      ]
    })

    expect(result.references).toEqual([
      expect.objectContaining({
        kind: "jira-issue",
        sourceId: "APP-12",
        originalUrl: null,
        fallbackText: "APP-12"
      })
    ])
    expect(
      rewriteJiraReferences(
        result,
        new Map([
          [
            result.references[0].placeholder,
            { url: "mention:ticket/OTHER-12", text: "OTHER-12" }
          ]
        ])
      )
    ).toBe(
      "See [OTHER-12](mention:ticket/OTHER-12) and https://x/browse/APP-13, not app-14"
    )
  })
})
