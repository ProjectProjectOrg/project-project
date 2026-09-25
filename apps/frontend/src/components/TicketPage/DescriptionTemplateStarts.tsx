import type { Library, TemplateDefinition, TicketType } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { type MouseEvent } from "react"

import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { templateStarts } from "./descriptionTemplates"

const keepEditorFocus = (event: MouseEvent) => event.preventDefault()

export function DescriptionTemplateStarts({
  orgSlug,
  slug,
  library,
  ticketType,
  body,
  onStart,
  onMore,
  className
}: Readonly<{
  orgSlug: string
  slug: string
  library: Library
  ticketType: TicketType
  body: string
  onStart: (template: TemplateDefinition) => void
  onMore: () => void
  className?: string
}>) {
  if (body.trim() !== "") return null
  const starts = templateStarts(library, ticketType)
  return (
    <div
      role="group"
      aria-label={m.templates_starts_label()}
      className={cn(
        "pointer-events-none flex flex-col gap-2 text-xs leading-6 text-muted-foreground",
        className
      )}
    >
      <p className="text-muted-foreground/70">{m.templates_starts_teaser()}</p>
      {starts.templates.length === 0 ? (
        <p className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <span>{m.templates_starts_empty()}</span>
          <span aria-hidden>·</span>
          <Button
            variant="template-more"
            onMouseDown={keepEditorFocus}
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/settings/templates"
                params={{ orgSlug, slug }}
              />
            }
          >
            {m.templates_starts_empty_gallery()}
          </Button>
        </p>
      ) : (
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 self-start">
          <span className="mr-0.5">{m.templates_starts_label()}</span>
          {starts.templates.map((template) => (
            <Button
              key={template.key}
              type="button"
              variant="template-start"
              onMouseDown={keepEditorFocus}
              onClick={() => onStart(template)}
            >
              <BlockIconGlyph
                icon={template.icon}
                color={template.color}
                className="size-3.5"
              />
              {template.name}
            </Button>
          ))}
          {starts.more && (
            <Button
              type="button"
              variant="template-more"
              onMouseDown={keepEditorFocus}
              onClick={onMore}
            >
              {m.templates_starts_more()}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
