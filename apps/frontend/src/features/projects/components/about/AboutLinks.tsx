import { useAtomSet } from "@effect/atom-react"
import type { ProjectLink } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { CopyButton } from "@pp/ui/copy-button"
import { FigmaGlyph } from "@pp/ui/editor/figma/figma-chip"
import { PaperGlyph } from "@pp/ui/editor/paper/paper-glyph"
import {
  GitBranch,
  Globe,
  Laptop,
  Pencil,
  Plus,
  type IconType
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useRef, useState, type ReactElement } from "react"

import { useLinkPreview } from "@/features/link-previews/hooks/useLinkPreview"
import { updateProject } from "@/features/projects/atoms/projects"
import { ProjectLinkForm } from "@/features/projects/forms/project-link"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  displayUrl,
  linkKind,
  type ProjectLinkKind
} from "@/features/projects/lib/projectLinks"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

const KIND_ICONS: Readonly<
  Record<Exclude<ProjectLinkKind, "figma" | "paper" | "web">, IconType>
> = {
  github: GitBranch,
  local: Laptop
}

function LinkGlyph({ url }: Readonly<{ url: string }>) {
  const kind = linkKind(url)
  if (kind === "figma") return <FigmaGlyph className="h-3.5" />
  if (kind === "paper") return <PaperGlyph className="size-3.5" />
  if (kind === "web") return <WebFavicon url={url} />
  const Icon = KIND_ICONS[kind]
  return <Icon className="size-3.5" strokeWidth={1.75} />
}

function WebFavicon({ url }: Readonly<{ url: string }>) {
  const { favicon } = useLinkPreview(url)
  if (favicon.kind !== "image") {
    return <Globe className="size-3.5" strokeWidth={1.75} />
  }
  return (
    <img
      src={favicon.src}
      alt=""
      referrerPolicy="no-referrer"
      className={cn(
        "size-3.5 rounded-[2px] object-contain",
        favicon.rendering === "monochrome" && "brightness-0 dark:invert"
      )}
    />
  )
}

export function AboutLinks({
  links,
  canEdit
}: Readonly<{ links: ReadonlyArray<ProjectLink>; canEdit: boolean }>) {
  const { projectReq } = useProjectRoute()
  const update = useAtomSet(updateProject(projectReq), {
    mode: "promiseExit"
  })
  const [adding, setAdding] = useState(false)
  if (!canEdit && links.length === 0) return null

  const save = async (next: ReadonlyArray<ProjectLink>) =>
    mutationErrorText(AsyncResult.fromExit(await update({ links: next })))

  return (
    <MetaRow
      inset="link"
      label={m.project_about_links_label()}
      action={
        canEdit ? (
          <LinkPopover
            open={adding}
            onOpenChange={setAdding}
            onSave={(link) =>
              save([...links.filter((other) => other.url !== link.url), link])
            }
            trigger={
              <Button
                variant="ghost"
                size="square-7"
                aria-label={m.project_links_add_title()}
                title={m.project_links_add_title()}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
              </Button>
            }
          />
        ) : null
      }
    >
      {links.map((link, index) => (
        <LinkRow
          key={link.url}
          link={link}
          canEdit={canEdit}
          onChange={(next) => save(links.with(index, next))}
          onRemove={() => save(links.toSpliced(index, 1))}
        />
      ))}
      {links.length === 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit max-w-full justify-start px-1.5"
          leadingIcon={Plus}
          onClick={() => setAdding(true)}
        >
          {m.project_about_links_empty()}
        </Button>
      ) : null}
    </MetaRow>
  )
}

const isTruncated = (root: HTMLElement | null): boolean =>
  root !== null &&
  [...root.querySelectorAll<HTMLElement>("[data-truncate]")].some(
    (element) => element.scrollWidth > element.clientWidth
  )

function LinkRow({
  link,
  canEdit,
  onChange,
  onRemove
}: Readonly<{
  link: ProjectLink
  canEdit: boolean
  onChange: (link: ProjectLink) => Promise<string | null>
  onRemove: () => Promise<string | null>
}>) {
  const [editing, setEditing] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const rowRef = useRef<HTMLAnchorElement>(null)
  const measure = () => setTruncated(isTruncated(rowRef.current))
  return (
    <div
      className="group/reveal relative w-full min-w-0"
      onPointerEnter={measure}
      onFocus={measure}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-auto w-full flex-col items-stretch justify-start gap-0 rounded-lg px-1.5 pt-0.5 pb-1.5 group-hover/reveal:bg-hover group-hover/reveal:text-foreground"
              render={
                <a
                  ref={rowRef}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={link.label}
                />
              }
            />
          }
        >
          <span
            className={cn(
              "flex h-6 min-w-0 items-center gap-2",
              canEdit && "pr-13"
            )}
          >
            <span data-truncate className="min-w-0 truncate">
              {link.label}
            </span>
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              <LinkGlyph url={link.url} />
            </span>
          </span>
          <span
            data-truncate
            className="min-w-0 truncate text-caption text-muted-foreground"
          >
            {displayUrl(link.url)}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-80 font-mono break-all"
        >
          {truncated ? link.url : null}
        </TooltipContent>
      </Tooltip>
      {canEdit ? (
        <div className="absolute top-0.5 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/reveal:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
          <CopyButton
            value={link.url}
            variant="ghost"
            size="square-6"
            iconClassName="size-3.5"
            copyLabel={m.project_links_copy_aria_label({ label: link.label })}
            copiedLabel={m.project_links_copied()}
            nativeTitle={false}
          />
          <LinkPopover
            open={editing}
            onOpenChange={setEditing}
            initial={link}
            onSave={onChange}
            onRemove={onRemove}
            trigger={
              <Button
                variant="ghost"
                size="square-6"
                aria-label={m.project_links_edit_aria_label({
                  label: link.label
                })}
              >
                <Pencil className="size-3.5" strokeWidth={1.75} />
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  )
}

function LinkPopover({
  open,
  onOpenChange,
  initial,
  onSave,
  onRemove,
  trigger
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: ProjectLink
  onSave: (link: ProjectLink) => Promise<string | null>
  onRemove?: () => Promise<string | null>
  trigger: ReactElement
}>) {
  const [error, setError] = useState<string | null>(null)
  const changeOpen = (next: boolean) => {
    setError(null)
    onOpenChange(next)
  }
  const settle = async (pending: Promise<string | null>) => {
    const failure = await pending
    if (failure === null) changeOpen(false)
    else setError(failure)
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72"
        finalFocus={false}
      >
        <ProjectLinkForm
          initial={initial}
          error={error}
          onSave={(link) => settle(onSave(link))}
          onRemove={onRemove ? () => settle(onRemove()) : undefined}
        />
      </PopoverContent>
    </Popover>
  )
}
