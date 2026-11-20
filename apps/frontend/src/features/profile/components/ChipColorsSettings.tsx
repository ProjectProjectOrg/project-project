import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TAG_DEFAULT_PALETTE, type ChipColors } from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { Chip, ChipDots } from "@pp/ui/chip"
import { cn } from "@pp/ui/lib/utils"
import { ListRow, ListRowTitle, listGridClassName } from "@pp/ui/list-row"
import { StatusGlyph } from "@pp/ui/status-glyph"
import { TicketKey } from "@pp/ui/ticket-key"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSegmented } from "@/components/shell/settings/SettingsTextField"
import { updateChipColors } from "@/features/auth/atoms/auth"
import {
  PULL_REQUEST_BADGE_TONES,
  PULL_REQUEST_LOOKS,
  type Checks,
  type PullRequestKind
} from "@/features/sprints/components/gitLooks"
import { ChecksDot } from "@/features/sprints/components/GitStackChip"
import { TagChip } from "@/features/tags/components/TagChip"
import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

const CHIP_COLOR_OPTIONS = [
  { key: "flat", label: m.profile_chip_colors_option_flat },
  { key: "rich", label: m.profile_chip_colors_option_rich }
] as const satisfies ReadonlyArray<
  Readonly<{ key: ChipColors; label: () => string }>
>

type PreviewTag = Readonly<{ label: () => string; color: string | undefined }>

type PreviewTicket = Readonly<{
  id: string
  status: string
  title: () => string
  tags: ReadonlyArray<PreviewTag>
  pr: Readonly<{ kind: PullRequestKind; number: number; checks?: Checks }>
}>

const PREVIEW_TICKETS: ReadonlyArray<PreviewTicket> = [
  {
    id: "PP-12",
    status: "in_progress",
    title: m.profile_chip_colors_preview_first_title,
    tags: [
      {
        label: m.profile_chip_colors_preview_tag_bug,
        color: TAG_DEFAULT_PALETTE[1]
      }
    ],
    pr: { kind: "open", number: 128, checks: "failing" }
  },
  {
    id: "PP-9",
    status: "done",
    title: m.profile_chip_colors_preview_second_title,
    tags: [
      {
        label: m.profile_chip_colors_preview_tag_design,
        color: TAG_DEFAULT_PALETTE[11]
      }
    ],
    pr: { kind: "merged", number: 121 }
  }
]

export function ChipColorsSettings({
  selected
}: Readonly<{ selected: ChipColors }>) {
  const update = useAtomSet(updateChipColors)
  const updateState = useAtomValue(updateChipColors)

  function choose(next: ChipColors) {
    if (next === selected) return
    update(next)
  }

  return (
    <SettingsSection>
      <SettingsGroup>
        <ChipColorsPreview rich={selected === "rich"} />
        <SettingsRow
          label={m.profile_chip_colors_title()}
          description={m.profile_chip_colors_description()}
          error={mutationErrorText(updateState, () =>
            m.profile_chip_colors_update_error()
          )}
        >
          <SettingsSegmented
            items={CHIP_COLOR_OPTIONS.map(({ key, label }) => ({
              key,
              label: label()
            }))}
            value={selected}
            waiting={updateState.waiting}
            onValueChange={choose}
          />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}

function ChipColorsPreview({ rich }: Readonly<{ rich: boolean }>) {
  return (
    <div aria-hidden inert className="p-3">
      <div
        className={cn(
          listGridClassName,
          "grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto_auto_auto] rounded-xl bg-page p-1"
        )}
        style={{ "--ticket-key-width": "5ch" }}
      >
        {PREVIEW_TICKETS.map((ticket) => (
          <PreviewRow key={ticket.id} ticket={ticket} rich={rich} />
        ))}
      </div>
    </div>
  )
}

function PreviewRow({
  ticket,
  rich
}: Readonly<{ ticket: PreviewTicket; rich: boolean }>) {
  const status = statusMetaFor(ticket.status, [])
  const priority = PRIORITY_META.med
  const PriorityIcon = priority.icon
  return (
    <ListRow
      status={<StatusGlyph icon={status.icon} color={status.color} />}
      priority={
        <span className="grid size-6 place-items-center">
          <PriorityIcon
            className={cn("size-3.5", priority.className)}
            strokeWidth={1.75}
          />
        </span>
      }
      ticketKey={
        <TicketKey value={ticket.id} className="min-w-(--ticket-key-width)" />
      }
      title={<ListRowTitle>{ticket.title()}</ListRowTitle>}
      trailing={
        <>
          {ticket.tags.map((tag) => (
            <PreviewTagChip key={tag.label()} tag={tag} rich={rich} />
          ))}
          <PreviewPullRequestChip pr={ticket.pr} rich={rich} />
        </>
      }
    />
  )
}

function PreviewTagChip({
  tag,
  rich
}: Readonly<{ tag: PreviewTag; rich: boolean }>) {
  return rich ? (
    <TagChip color={tag.color}>{tag.label()}</TagChip>
  ) : (
    <Chip kind="label">
      <ChipDots colors={[tag.color]} />
      {tag.label()}
    </Chip>
  )
}

function PreviewPullRequestChip({
  pr,
  rich
}: Readonly<{ pr: PreviewTicket["pr"]; rich: boolean }>) {
  const look = PULL_REQUEST_LOOKS[pr.kind]
  const Icon = look.icon
  const content = (
    <>
      <Icon
        className={rich ? undefined : cn("size-3 shrink-0", look.tone)}
        strokeWidth={1.75}
      />
      <span className="tabular-nums">#{pr.number}</span>
      {pr.checks !== undefined && <ChecksDot checks={pr.checks} />}
    </>
  )
  return rich ? (
    <Badge tone={PULL_REQUEST_BADGE_TONES[pr.kind]}>{content}</Badge>
  ) : (
    <Chip shape="count">{content}</Chip>
  )
}
