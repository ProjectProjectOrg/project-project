import { describe, expect, it } from "vite-plus/test"
import { convertAdfToMarkdown, rewriteJiraReferences } from "./Adf"

describe("convertAdfToMarkdown", () => {
  it("converts the supported block and inline nodes to deterministic Markdown", () => {
    const document = {
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
    const document = {
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
          type: "paragraph",
          content: [
            {
              type: "media",
              attrs: {
                id: "attachment-7",
                alt: "diagram [final].png",
                url: "https://jira.example.com/secure/attachment/7/file.png"
              }
            },
            { type: "text", text: " " },
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
            },
            { type: "text", text: " / " },
            {
              type: "media",
              attrs: { id: "attachment-7", alt: "diagram.png" }
            },
            { type: "text", text: " / " },
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
        "[OTHER-4](https://jira.example.com/browse/OTHER-4) / " +
        "[diagram.png](/attachments/a%20\\(1\\)) / " +
        "[@Ada](mention:user/user-1) / @Former User"
    )
    expect(markdown).not.toContain("jira-reference:")
  })

  it("preserves readable descendants and fallbacks for unknown nodes with paths", () => {
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
      markdown: "Still readable IN REVIEW",
      warnings: [
        { path: ["content", 0], nodeType: "panel", reason: "unsupported-node" },
        {
          path: ["content", 0, "content", 0, "content", 1],
          nodeType: "status",
          reason: "unsupported-node"
        }
      ],
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
        "&lt;!-- comments:end --> <!-- ordinary -->\n\n" +
        "```\n&lt;!-- comments:start -->\n<!-- ordinary-code -->\n```"
    )
    expect(result.warnings).toEqual([
      {
        path: ["content", 0, "content", 0],
        nodeType: "text",
        reason: "reserved-marker-neutralized"
      },
      {
        path: ["content", 0, "content", 0],
        nodeType: "text",
        reason: "reserved-marker-neutralized"
      },
      {
        path: ["content", 0, "content", 0],
        nodeType: "text",
        reason: "reserved-marker-neutralized"
      },
      {
        path: ["content", 1, "content", 0],
        nodeType: "text",
        reason: "reserved-marker-neutralized"
      }
    ])
    expect(result.markdown).toContain("<!-- ordinary -->")
  })
})
