import type { TemplateDefinition, TemplateKey, TicketType } from "@pp/shared"
import { CircleDashed } from "lucide-react"
import { useMemo, useState, type KeyboardEvent } from "react"

import { matchesSlashQuery } from "@/components/Lexical/blocks/slashMenuItems"
import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import { LibraryMenuRow } from "@/components/Library/LibraryMenuRow"
import { MenuHighlight } from "@/components/ui/menu-highlight"
import { m } from "@/paraglide/messages"

import type { TemplateChoice } from "./useTemplateChoice"

export function TemplateGlyph({
  template
}: Readonly<{ template: TemplateDefinition | null }>) {
  return template === null ? (
    <CircleDashed
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground"
      strokeWidth={1.75}
    />
  ) : (
    <BlockIconGlyph icon={template.icon} color={template.color} />
  )
}

export const templateLabel = (template: TemplateDefinition | null): string =>
  template === null ? m.templates_creator_blank() : template.name

export const templateMeta = (
  template: TemplateDefinition | null,
  defaultKey: TemplateKey | null
): string | null =>
  template !== null && template.key === defaultKey
    ? m.templates_creator_default()
    : null

export type TemplateSlash = Readonly<{
  open: boolean
  options: ReadonlyArray<TemplateDefinition | null>
  highlight: number
  onTitleChange: (previous: string, next: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean
  choose: (template: TemplateDefinition | null) => void
  setHighlight: (index: number) => void
  close: () => void
}>

const BLANK_TERMS = (): ReadonlyArray<string> => [
  m.templates_creator_blank(),
  "blank"
]

export const slashOptions = (
  query: string,
  templates: ReadonlyArray<TemplateDefinition>
): ReadonlyArray<TemplateDefinition | null> => [
  ...(matchesSlashQuery(query, BLANK_TERMS()) ? [null] : []),
  ...templates.filter((template) =>
    matchesSlashQuery(query, [
      template.name,
      template.key,
      template.description
    ])
  )
]

export function useTemplateSlash({
  title,
  choice,
  onChoose
}: Readonly<{
  title: string
  choice: TemplateChoice
  onChoose: (
    template: TemplateDefinition | null,
    ticketType: TicketType | null
  ) => void
}>): TemplateSlash {
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const open = active && choice.ready && title.startsWith("/")
  const options = useMemo(
    () => (open ? slashOptions(title.slice(1), choice.templates) : []),
    [open, title, choice.templates]
  )
  const safeHighlight = options.length === 0 ? 0 : highlight % options.length

  const close = () => {
    setActive(false)
    setHighlight(0)
  }

  const choose = (template: TemplateDefinition | null) => {
    choice.pick(template?.key ?? null)
    close()
    onChoose(
      template,
      template === null ? null : choice.ticketTypeOf(template.key)
    )
  }

  const onTitleChange = (previous: string, next: string) => {
    if (previous === "" && next.startsWith("/")) {
      setActive(true)
      setHighlight(0)
    } else if (!next.startsWith("/")) {
      close()
    } else {
      setHighlight(0)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): boolean => {
    if (!open) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setHighlight(
        options.length === 0
          ? 0
          : (safeHighlight + step + options.length) % options.length
      )
      return true
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      if (options.length > 0) choose(options[safeHighlight])
      return true
    }
    if (event.key === "Escape") {
      event.preventDefault()
      close()
      return true
    }
    return false
  }

  return {
    open,
    options,
    highlight: safeHighlight,
    onTitleChange,
    onKeyDown,
    choose,
    setHighlight,
    close
  }
}

export function TemplateSlashList({
  slash,
  choice
}: Readonly<{ slash: TemplateSlash; choice: TemplateChoice }>) {
  if (!slash.open) return null
  return (
    <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
      {slash.options.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground">
          {m.templates_creator_no_match()}
        </p>
      ) : (
        <div
          role="listbox"
          aria-label={m.templates_creator_list_label()}
          className="relative flex max-h-72 flex-col overflow-y-auto p-1"
        >
          <MenuHighlight />
          {slash.options.map((template, index) => (
            <LibraryMenuRow
              key={template?.key ?? "blank"}
              icon={<TemplateGlyph template={template} />}
              name={templateLabel(template)}
              meta={templateMeta(template, choice.defaultKey)}
              highlighted={index === slash.highlight}
              onHighlight={() => slash.setHighlight(index)}
              onSelect={() => slash.choose(template)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
