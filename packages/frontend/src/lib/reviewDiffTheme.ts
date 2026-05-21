import { registerCustomTheme } from "@pierre/diffs"
import { useEffect, useState } from "react"

export const REVIEW_DIFF_THEME = {
  light: "projectproject-diff-light",
  dark: "projectproject-diff-dark"
} as const

export const REVIEW_DIFF_UNSAFE_CSS = `
:host {
  --diffs-font-family: var(--font-mono);
  --diffs-header-font-family: var(--font-mono);
  --diffs-font-size: 14px;
  --diffs-line-height: 20px;
  --diffs-gap-inline: 8px;
  --diffs-scrollbar-gutter-override: 0px;
  --diffs-tab-size: 2;
  background: transparent;
}

pre {
  background-color: transparent;
}

[data-diffs-header='custom'] {
  background-color: var(--muted);
  border-radius: var(--radius-lg);
  overflow: hidden;
  padding: 0;
  z-index: 3;
}

[data-diffs-header='custom'][data-sticky] {
  background-color: var(--muted);
}

[data-diffs-header='custom'] > slot,
[data-diffs-header='custom'] > slot::slotted(*) {
  display: block;
}

[data-diffs-header='custom'] ~ [data-diff],
[data-diffs-header='custom'] ~ [data-file] {
  background-color: var(--diffs-bg);
  border: 1px solid var(--border);
  border-top: 0;
  border-radius: 0 0 4px 4px;
  margin-inline: 12px;
  overflow: clip;
  width: calc(100% - 24px);
}

[data-diffs-header='custom'] ~ [data-diff] [data-code],
[data-diffs-header='custom'] ~ [data-file] [data-code] {
  background-color: transparent;
}

[data-diffs-header='default'] [data-header-content] {
  gap: 6px;
}

[data-diffs-header='default'] slot[name='header-prefix'] {
  align-items: center;
  display: inline-flex;
}

[data-diffs-header] [data-title],
[data-diffs-header] [data-prev-name] {
  font-family: var(--diffs-font-family);
  font-size: 12px;
  font-weight: 500;
}

[data-diffs-header] [data-metadata] {
  font-family: var(--diffs-font-family);
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-size: 12px;
  line-height: 20px;
}

[data-diffs-header] [data-change-icon],
[data-diffs-header] [data-rename-icon] {
  width: 14px;
  height: 14px;
}
`

const lightTokenColors = [
  {
    scope: ["comment", "punctuation.definition.comment"],
    settings: { foreground: "#737373", fontStyle: "italic" }
  },
  {
    scope: ["keyword", "storage", "storage.type", "storage.modifier"],
    settings: { foreground: "#c41562" }
  },
  {
    scope: ["string", "string.quoted", "string.template", "string.regexp"],
    settings: { foreground: "#127d32" }
  },
  {
    scope: ["constant", "constant.numeric", "constant.language"],
    settings: { foreground: "#005fd7" }
  },
  {
    scope: ["entity.name.function", "support.function", "meta.function-call"],
    settings: { foreground: "#7d00b8" }
  },
  {
    scope: ["variable.parameter", "meta.parameter"],
    settings: { foreground: "#a24f00" }
  },
  {
    scope: [
      "variable.other.property",
      "support.type.property-name",
      "entity.name.tag",
      "meta.object-literal.key"
    ],
    settings: { foreground: "#005fd7" }
  },
  {
    scope: ["entity.name.type", "entity.name.class", "support.type"],
    settings: { foreground: "#005fd7" }
  },
  {
    scope: ["punctuation", "meta.brace", "meta.bracket", "variable"],
    settings: { foreground: "#171717" }
  },
  {
    scope: ["entity.other.attribute-name", "entity.other.attribute-name.jsx"],
    settings: { foreground: "#a24f00" }
  },
  {
    scope: ["markup.deleted", "punctuation.definition.deleted"],
    settings: { foreground: "#b4232f" }
  },
  {
    scope: ["markup.inserted", "punctuation.definition.inserted"],
    settings: { foreground: "#2a7f38" }
  }
]

const darkTokenColors = [
  {
    scope: ["comment", "punctuation.definition.comment"],
    settings: { foreground: "#a3a3a3", fontStyle: "italic" }
  },
  {
    scope: ["keyword", "storage", "storage.type", "storage.modifier"],
    settings: { foreground: "#ff5f91" }
  },
  {
    scope: ["string", "string.quoted", "string.template", "string.regexp"],
    settings: { foreground: "#8ed28f" }
  },
  {
    scope: ["constant", "constant.numeric", "constant.language"],
    settings: { foreground: "#7cb7ff" }
  },
  {
    scope: ["entity.name.function", "support.function", "meta.function-call"],
    settings: { foreground: "#d08cff" }
  },
  {
    scope: ["variable.parameter", "meta.parameter"],
    settings: { foreground: "#ffb05c" }
  },
  {
    scope: [
      "variable.other.property",
      "support.type.property-name",
      "entity.name.tag",
      "meta.object-literal.key"
    ],
    settings: { foreground: "#7cb7ff" }
  },
  {
    scope: ["entity.name.type", "entity.name.class", "support.type"],
    settings: { foreground: "#7cb7ff" }
  },
  {
    scope: ["punctuation", "meta.brace", "meta.bracket", "variable"],
    settings: { foreground: "#ededed" }
  },
  {
    scope: ["entity.other.attribute-name", "entity.other.attribute-name.jsx"],
    settings: { foreground: "#ffb05c" }
  },
  {
    scope: ["markup.deleted", "punctuation.definition.deleted"],
    settings: { foreground: "#f3a19b" }
  },
  {
    scope: ["markup.inserted", "punctuation.definition.inserted"],
    settings: { foreground: "#a6d79c" }
  }
]

const projectProjectDiffLight = {
  name: REVIEW_DIFF_THEME.light,
  type: "light" as const,
  settings: lightTokenColors,
  tokenColors: lightTokenColors,
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#171717",
    foreground: "#171717",
    "editorLineNumber.foreground": "#9a9a9a",
    "editorLineNumber.activeForeground": "#666666",
    "editor.selectionBackground": "#d8e5ff80",
    "editor.lineHighlightBackground": "#f2f2f24d",
    "diffEditor.insertedTextBackground": "#2a7f3824",
    "diffEditor.deletedTextBackground": "#b4232f24",
    "gitDecoration.addedResourceForeground": "#2a7f38",
    "gitDecoration.deletedResourceForeground": "#b4232f",
    "gitDecoration.modifiedResourceForeground": "#4d78c8",
    "sideBar.background": "#f7f7f7",
    "sideBar.foreground": "#666666",
    "sideBar.border": "#e5e5e5",
    "panel.background": "#f7f7f7",
    "panel.border": "#e5e5e5",
    "input.background": "#f5f5f5",
    "input.foreground": "#171717",
    "input.border": "#e5e5e5"
  }
}

const projectProjectDiffDark = {
  name: REVIEW_DIFF_THEME.dark,
  type: "dark" as const,
  settings: darkTokenColors,
  tokenColors: darkTokenColors,
  colors: {
    "editor.background": "#252525",
    "editor.foreground": "#ededed",
    foreground: "#ededed",
    "editorLineNumber.foreground": "#777777",
    "editorLineNumber.activeForeground": "#b0b0b0",
    "editor.selectionBackground": "#3c4f7280",
    "editor.lineHighlightBackground": "#33333366",
    "diffEditor.insertedTextBackground": "#a6d79c24",
    "diffEditor.deletedTextBackground": "#f3a19b24",
    "gitDecoration.addedResourceForeground": "#a6d79c",
    "gitDecoration.deletedResourceForeground": "#f3a19b",
    "gitDecoration.modifiedResourceForeground": "#8fb7ff",
    "sideBar.background": "#202020",
    "sideBar.foreground": "#b0b0b0",
    "sideBar.border": "#3a3a3a",
    "panel.background": "#202020",
    "panel.border": "#3a3a3a",
    "input.background": "#2d2d2d",
    "input.foreground": "#ededed",
    "input.border": "#404040"
  }
}

let reviewDiffThemesRegistered = false

function readResolvedThemeType(): "light" | "dark" {
  if (typeof document === "undefined") return "light"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function useReviewDiffThemeType(): "light" | "dark" {
  const [themeType, setThemeType] = useState(readResolvedThemeType)

  useEffect(() => {
    const root = document.documentElement
    const update = () => setThemeType(readResolvedThemeType())
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return themeType
}

export function registerReviewDiffThemes(): void {
  if (reviewDiffThemesRegistered) return
  registerCustomTheme(REVIEW_DIFF_THEME.light, () =>
    Promise.resolve(projectProjectDiffLight)
  )
  registerCustomTheme(REVIEW_DIFF_THEME.dark, () =>
    Promise.resolve(projectProjectDiffDark)
  )
  reviewDiffThemesRegistered = true
}
