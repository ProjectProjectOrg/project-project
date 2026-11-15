import { useSyncExternalStore } from "react"

// Shortcut strings ("mod+shift+p", "g+b", "esc") to the caps a keyboard
// shows: glyphs on a Mac (⌘ ⇧ P), the app's labels elsewhere (Ctrl Shift P).
// Kbd's KbdShortcut and the command menu render these.

export const MODIFIER_TOKENS: ReadonlyMap<string, string> = new Map([
  ["mod", "mod"],
  ["cmd", "meta"],
  ["command", "meta"],
  ["meta", "meta"],
  ["win", "meta"],
  ["super", "meta"],
  ["ctrl", "ctrl"],
  ["control", "ctrl"],
  ["alt", "alt"],
  ["option", "alt"],
  ["opt", "alt"],
  ["shift", "shift"]
])

export const KEY_ALIASES: ReadonlyMap<string, string> = new Map([
  ["esc", "escape"],
  ["return", "enter"],
  ["space", " "],
  ["spacebar", " "],
  ["up", "arrowup"],
  ["down", "arrowdown"],
  ["left", "arrowleft"],
  ["right", "arrowright"],
  ["del", "delete"],
  ["plus", "+"]
])

export const shortcutTokens = (shortcut: string): ReadonlyArray<string> => {
  const trimmed = shortcut.trim()
  if (trimmed === "") return []
  const tokens = trimmed.split("+").map((t) => t.trim())
  const out: Array<string> = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "" && i > 0) {
      if (out[out.length - 1] !== "+") out.push("+")
      continue
    }
    if (tokens[i] !== "") out.push(tokens[i])
  }
  return out
}

export type KeyLabels = Readonly<{
  ctrl: string
  meta: string
  alt: string
  shift: string
  enter: string
  escape: string
  backspace: string
  delete: string
  tab: string
  space: string
}>

type CapLabel = Readonly<{ mac: string; other: string }>

const capLabels = (labels: KeyLabels): ReadonlyMap<string, CapLabel> =>
  new Map([
    ["mod", { mac: "⌘", other: labels.ctrl }],
    ["meta", { mac: "⌘", other: labels.meta }],
    ["ctrl", { mac: "⌃", other: labels.ctrl }],
    ["alt", { mac: "⌥", other: labels.alt }],
    ["shift", { mac: "⇧", other: labels.shift }],
    ["enter", { mac: "↵", other: labels.enter }],
    ["escape", { mac: labels.escape, other: labels.escape }],
    ["backspace", { mac: "⌫", other: labels.backspace }],
    ["delete", { mac: "⌦", other: labels.delete }],
    ["tab", { mac: "⇥", other: labels.tab }],
    [" ", { mac: labels.space, other: labels.space }],
    ["arrowup", { mac: "↑", other: "↑" }],
    ["arrowdown", { mac: "↓", other: "↓" }],
    ["arrowleft", { mac: "←", other: "←" }],
    ["arrowright", { mac: "→", other: "→" }]
  ])

const PREFORMATTED = /^[⌘⌃⌥⇧↵⌫⌦⇥↑↓←→]+[A-Za-z0-9]?$/

export function formatShortcut(
  shortcut: string,
  mac: boolean,
  labels: KeyLabels
): ReadonlyArray<string> {
  const labelled = capLabels(labels)
  const caps: Array<string> = []
  for (const token of shortcutTokens(shortcut)) {
    if (PREFORMATTED.test(token)) {
      caps.push(...Array.from(token))
      continue
    }
    const lower = token.toLowerCase()
    const name = MODIFIER_TOKENS.get(lower) ?? KEY_ALIASES.get(lower) ?? lower
    const cap = labelled.get(name)
    if (cap) caps.push(mac ? cap.mac : cap.other)
    else if (name.length === 1) caps.push(name.toUpperCase())
    else caps.push(name.charAt(0).toUpperCase() + name.slice(1))
  }
  return caps
}

const isMacPlatform = (): boolean => {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

let macPlatform: boolean | null = null
const readMac = () => (macPlatform ??= isMacPlatform())
const serverMac = () => true
const subscribeNever = () => () => {}

export const useIsMac = (): boolean =>
  useSyncExternalStore(subscribeNever, readMac, serverMac)
