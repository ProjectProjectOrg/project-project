import { Linking } from "react-native"
import {
  EnrichedMarkdownText,
  type MarkdownStyle
} from "react-native-enriched-markdown"
import { useCSSVariable } from "uniwind"

const webBase = 14
const base = 15
const scaled = (webPixels: number) => Math.round((webPixels * base) / webBase)
const em = (ratio: number, size = base) => Math.round(ratio * size)

const blockSpacing = em(0.85)

const fonts = {
  regular: "Geist",
  italic: "Geist-Italic",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold: "Geist-Bold",
  mono: "GeistMono-Regular"
} as const

const heading = (size: number, lineHeight: number) => ({
  fontFamily: fonts.semibold,
  fontSize: size,
  lineHeight: em(lineHeight, size),
  marginTop: em(0.85, size) - blockSpacing,
  marginBottom: blockSpacing
})

const useMarkdownStyle = () => {
  const [
    foreground,
    muted,
    subtle,
    border,
    background,
    comment,
    punctuation,
    constant,
    string,
    operator,
    keyword,
    fn,
    variable
  ] = useCSSVariable([
    "--color-foreground",
    "--color-muted-foreground",
    "--color-muted",
    "--color-border",
    "--color-background",
    "--color-syntax-comment",
    "--color-syntax-punctuation",
    "--color-syntax-constant",
    "--color-syntax-string",
    "--color-syntax-operator",
    "--color-syntax-keyword",
    "--color-syntax-function",
    "--color-syntax-variable"
  ]).map(String)
  const body = {
    fontFamily: fonts.regular,
    fontSize: base,
    lineHeight: em(1.65),
    color: foreground
  }
  const codeSize = em(0.875)
  const tableSize = scaled(13)
  const style: MarkdownStyle = {
    paragraph: { ...body, marginBottom: blockSpacing },
    h1: { ...heading(scaled(24), 1.25), color: foreground },
    h2: { ...heading(scaled(19.2), 1.3), color: foreground },
    h3: { ...heading(scaled(16), 1.35), color: foreground },
    list: {
      ...body,
      marginBottom: blockSpacing,
      bulletColor: foreground,
      markerColor: muted,
      itemSpacing: em(0.25)
    },
    blockquote: {
      ...body,
      fontFamily: fonts.italic,
      color: muted,
      borderColor: border,
      borderWidth: 2,
      gapWidth: base,
      marginBottom: blockSpacing
    },
    code: {
      fontFamily: fonts.mono,
      fontSize: codeSize,
      color: foreground,
      backgroundColor: subtle,
      borderColor: subtle
    },
    codeBlock: {
      fontFamily: fonts.mono,
      fontSize: codeSize,
      lineHeight: em(1.55, codeSize),
      color: foreground,
      backgroundColor: subtle,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 8,
      padding: em(0.85, codeSize),
      marginBottom: blockSpacing,
      syntaxColors: {
        comment,
        punctuation,
        property: constant,
        tag: constant,
        number: constant,
        constant,
        string,
        attribute: string,
        operator,
        keyword,
        function: fn,
        type: fn,
        variable,
        embedded: foreground
      }
    },
    link: { color: foreground, underline: true },
    strong: { fontFamily: fonts.bold, fontWeight: "normal" },
    em: { fontFamily: fonts.italic, fontStyle: "normal" },
    thematicBreak: {
      color: border,
      height: 1,
      marginTop: em(1.5),
      marginBottom: em(1.5)
    },
    table: {
      fontFamily: fonts.regular,
      fontSize: tableSize,
      lineHeight: em(1.5, tableSize),
      color: foreground,
      marginBottom: blockSpacing,
      headerFontFamily: fonts.medium,
      headerTextColor: muted,
      headerBackgroundColor: background,
      rowEvenBackgroundColor: background,
      rowOddBackgroundColor: background,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 0,
      cellPaddingHorizontal: 12,
      cellPaddingVertical: 10
    },
    taskList: {
      checkedColor: foreground,
      checkmarkColor: background,
      borderColor: muted,
      checkedTextColor: muted,
      checkedStrikethrough: true
    }
  }
  return style
}

export function Markdown({ children }: Readonly<{ children: string }>) {
  const markdownStyle = useMarkdownStyle()
  return (
    <EnrichedMarkdownText
      flavor="github"
      markdown={children}
      markdownStyle={markdownStyle}
      enableTaskListItemToggle={false}
      onLinkPress={({ url }) => void Linking.openURL(url)}
    />
  )
}
