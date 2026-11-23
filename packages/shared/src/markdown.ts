export const unescapeMarkdown = (text: string) =>
  text.replace(/\\([!-/:-@[-`{-~])/g, "$1")
