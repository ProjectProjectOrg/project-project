import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  BLOCK_ICONS,
  TagName,
  type BlockIconName,
  type Library,
  type LibraryColor,
  type LibraryOrigin,
  type TemplateKey,
  type TicketPriority,
  type TicketType
} from "@pp/shared"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Check, ChevronDown, Plus, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { ColorPicker } from "@/components/ColorPicker"
import { MetaRow } from "@/components/TicketPage/MetaRow"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/lib/priority-meta"
import { springs } from "@/lib/springs"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import { TICKET_TYPES, defaultTypesFor } from "./libraryModel"
import { failureText } from "./LibraryRow"
import { setDefaultsAtom, type LibraryScope } from "./libraryScope"

export function AsideField({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return <MetaRow label={label}>{children}</MetaRow>
}

type CommitInputProps = Readonly<{
  value: string
  onCommit: (value: string) => void
  ariaLabel: string
  placeholder?: string
  maxLength?: number
  required?: boolean
  disabled?: boolean
  className?: string
}>

export function CommitInput({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  maxLength,
  required = false,
  disabled = false,
  className
}: CommitInputProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (required && next === "") return
    if (next !== value) onCommit(next)
  }
  return (
    <Input
      variant="inline"
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className={cn("-mx-2", className)}
    />
  )
}

export function BlockIconPicker({
  value,
  color,
  onChange,
  disabled = false
}: Readonly<{
  value: BlockIconName
  color: LibraryColor
  onChange: (icon: BlockIconName) => void
  disabled?: boolean
}>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current
      if (root !== null && !root.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        aria-label={m.templates_editor_icon_aria()}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-md border border-input bg-background transition-all duration-100 hover:bg-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <BlockIconGlyph icon={value} color={color} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={springs.moderate}
            className="absolute top-10 left-0 z-50 w-[228px] rounded-md border border-border bg-popover p-2 shadow-md"
          >
            <div className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
              {BLOCK_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={m.templates_editor_icon_option_aria({ name })}
                  aria-pressed={name === value}
                  onClick={() => {
                    onChange(name)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex size-7 items-center justify-center rounded transition-all duration-100 hover:bg-accent active:scale-[0.97]",
                    name === value && "bg-accent"
                  )}
                >
                  <BlockIconGlyph
                    icon={name}
                    color={color}
                    className="size-3.5"
                  />
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function IconAndColorField({
  icon,
  color,
  onIcon,
  onColor,
  disabled = false
}: Readonly<{
  icon: BlockIconName
  color: LibraryColor
  onIcon: (icon: BlockIconName) => void
  onColor: (color: LibraryColor) => void
  disabled?: boolean
}>) {
  return (
    <div className="flex items-center gap-2">
      <BlockIconPicker
        value={icon}
        color={color}
        onChange={onIcon}
        disabled={disabled}
      />
      {disabled ? null : (
        <>
          <ColorPicker
            value={color ?? ""}
            onChange={onColor}
            ariaLabel={m.templates_editor_color_aria()}
          />
          {color === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onColor(null)}
            >
              {m.templates_editor_color_clear()}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function ChoiceTrigger({
  label,
  icon,
  disabled,
  ariaLabel
}: Readonly<{
  label: string
  icon?: ReactNode
  disabled: boolean
  ariaLabel: string
}>) {
  return (
    <DropdownMenuTrigger
      disabled={disabled}
      aria-label={ariaLabel}
      render={
        <Button type="button" variant="chip" size="sm" className="-ml-1.5">
          {icon}
          <span>{label}</span>
          {disabled ? null : (
            <ChevronDown
              className="size-3.5 text-muted-foreground"
              strokeWidth={1.75}
            />
          )}
        </Button>
      }
    />
  )
}

const noneLabel = () => m.templates_editor_none()

export function NullableTypeField({
  value,
  onChange,
  disabled = false
}: Readonly<{
  value: TicketType | null
  onChange: (type: TicketType | null) => void
  disabled?: boolean
}>) {
  const Icon = value === null ? null : TYPE_META[value].icon
  const label = value === null ? noneLabel() : TYPE_LABELS[value]()
  return (
    <DropdownMenu>
      <ChoiceTrigger
        label={label}
        disabled={disabled}
        ariaLabel={m.templates_editor_type_aria({ label })}
        icon={
          Icon === null ? null : (
            <Icon className="size-3.5" strokeWidth={1.75} />
          )
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-40">
        {[null, ...TICKET_TYPES].map((type) => {
          const TypeIcon = type === null ? null : TYPE_META[type].icon
          return (
            <DropdownMenuItem
              key={type ?? "none"}
              onClick={() => {
                if (type !== value) onChange(type)
              }}
              className="cursor-pointer"
            >
              {TypeIcon === null ? (
                <span className="size-4" aria-hidden />
              ) : (
                <TypeIcon className="size-4" strokeWidth={1.75} />
              )}
              {type === null ? noneLabel() : TYPE_LABELS[type]()}
              {type === value && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NullablePriorityField({
  value,
  onChange,
  disabled = false
}: Readonly<{
  value: TicketPriority | null
  onChange: (priority: TicketPriority | null) => void
  disabled?: boolean
}>) {
  const meta = value === null ? null : PRIORITY_META[value]
  const label = value === null ? noneLabel() : PRIORITY_LABELS[value]()
  const Icon = meta?.icon ?? null
  return (
    <DropdownMenu>
      <ChoiceTrigger
        label={label}
        disabled={disabled}
        ariaLabel={m.templates_editor_priority_aria({ label })}
        icon={
          Icon === null ? null : (
            <Icon
              className={cn("size-3.5", meta?.className)}
              strokeWidth={1.75}
            />
          )
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        {[null, ...PRIORITY_ORDER].map((priority) => {
          const itemMeta = priority === null ? null : PRIORITY_META[priority]
          const ItemIcon = itemMeta?.icon ?? null
          return (
            <DropdownMenuItem
              key={priority ?? "none"}
              onClick={() => {
                if (priority !== value) onChange(priority)
              }}
              className="cursor-pointer"
            >
              {ItemIcon === null ? (
                <span className="size-4" aria-hidden />
              ) : (
                <ItemIcon
                  className={cn("size-4", itemMeta?.className)}
                  strokeWidth={1.75}
                />
              )}
              {priority === null ? noneLabel() : PRIORITY_LABELS[priority]()}
              {priority === value && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const isTagName = Schema.is(TagName)

function TagChips({
  tags,
  onRemove
}: Readonly<{
  tags: ReadonlyArray<TagName>
  onRemove: ((tag: TagName) => void) | null
}>) {
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs text-foreground"
        >
          {tag}
          {onRemove === null ? null : (
            <button
              type="button"
              aria-label={m.templates_editor_tag_remove_aria({ tag })}
              onClick={() => onRemove(tag)}
              className="text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-[0.97]"
            >
              <X className="size-3" strokeWidth={1.75} />
            </button>
          )}
        </span>
      ))}
    </>
  )
}

function ProjectTagPicker({
  orgSlug,
  slug,
  value,
  onChange
}: Readonly<{
  orgSlug: string
  slug: string
  value: ReadonlyArray<TagName>
  onChange: (tags: ReadonlyArray<TagName>) => void
}>) {
  const result = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const names = AsyncResult.isSuccess(result)
    ? result.value.map((tag) => tag.name)
    : []
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            leadingIcon={Plus}
            aria-label={m.templates_editor_tag_add()}
          >
            {m.templates_editor_tag_add()}
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-48">
        {names.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {m.templates_editor_tags_empty()}
          </p>
        ) : (
          names.map((name) => (
            <DropdownMenuCheckboxItem
              key={name}
              checked={value.includes(name)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value, name]
                    : value.filter((tag) => tag !== name)
                )
              }
            >
              {name}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FreeTagInput({
  value,
  onChange
}: Readonly<{
  value: ReadonlyArray<TagName>
  onChange: (tags: ReadonlyArray<TagName>) => void
}>) {
  const [draft, setDraft] = useState("")
  const next = draft.trim().toLowerCase()
  const invalid = next !== "" && !isTagName(next)
  return (
    <Input
      variant="inline"
      aria-label={m.templates_editor_tag_add()}
      aria-invalid={invalid}
      placeholder={m.templates_editor_tag_add()}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || next === "" || !isTagName(next)) return
        event.preventDefault()
        if (!value.includes(next)) onChange([...value, next])
        setDraft("")
      }}
      className="-mx-2 w-32 text-xs"
    />
  )
}

export function TemplateTagsField({
  scope,
  value,
  onChange,
  disabled = false
}: Readonly<{
  scope: LibraryScope
  value: ReadonlyArray<TagName>
  onChange: (tags: ReadonlyArray<TagName>) => void
  disabled?: boolean
}>) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.length === 0 && disabled ? (
        <span className="text-[13px] text-muted-foreground">{noneLabel()}</span>
      ) : null}
      <TagChips
        tags={value}
        onRemove={
          disabled
            ? null
            : (tag) => onChange(value.filter((entry) => entry !== tag))
        }
      />
      {disabled ? null : scope.layer === "project" ? (
        <ProjectTagPicker
          orgSlug={scope.req.params.orgSlug}
          slug={scope.req.params.slug}
          value={value}
          onChange={onChange}
        />
      ) : (
        <FreeTagInput value={value} onChange={onChange} />
      )}
    </div>
  )
}

export function DefaultForField({
  scope,
  library,
  templateKey
}: Readonly<{
  scope: LibraryScope
  library: Library
  templateKey: TemplateKey
}>) {
  const mutation = setDefaultsAtom(scope)
  const setDefaults = useAtomSet(mutation)
  const state = useAtomValue(mutation)
  const error = failureText(state)
  const current = defaultTypesFor(library.defaults, templateKey)
  const others = TICKET_TYPES.filter((type) => !current.includes(type))
  const add = (type: TicketType) =>
    setDefaults({ defaults: { [type]: templateKey } })
  const remove = (type: TicketType) =>
    setDefaults(
      library.ownDefaults[type] === templateKey
        ? { defaults: {}, reset: [type] }
        : { defaults: { [type]: null } }
    )

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1",
          state.waiting && "animate-pulse"
        )}
      >
        {current.length === 0 && !library.canEdit ? (
          <span className="text-[13px] text-muted-foreground">
            {noneLabel()}
          </span>
        ) : null}
        {current.map((type) => (
          <span
            key={type}
            data-default-for={type}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-1.5 text-xs text-foreground"
          >
            {TYPE_LABELS[type]()}
            {library.canEdit ? (
              <button
                type="button"
                aria-label={m.templates_editor_default_remove_aria({
                  type: TYPE_LABELS[type]()
                })}
                onClick={() => remove(type)}
                className="text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-[0.97]"
              >
                <X className="size-3" strokeWidth={1.75} />
              </button>
            ) : null}
          </span>
        ))}
        {library.canEdit && others.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  leadingIcon={Plus}
                  aria-label={m.templates_editor_default_add()}
                >
                  {current.length === 0
                    ? m.templates_editor_default_add()
                    : null}
                </Button>
              }
            />
            <DropdownMenuContent align="start" sideOffset={6} className="w-40">
              {others.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => add(type)}
                  className="cursor-pointer"
                >
                  {TYPE_LABELS[type]()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const ORIGIN_LABELS: Record<LibraryOrigin, () => string> = {
  org: m.templates_settings_origin_org,
  project: m.templates_settings_origin_project
}

export const originLabel = (origin: LibraryOrigin): string =>
  ORIGIN_LABELS[origin]()

export function MutedValue({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>
}
