import {
  type ProjectStatus,
  type TicketPriority,
  type TicketType,
  type UpdateTicketInput
} from "@pp/shared"
import * as Match from "effect/Match"
import { createContext, type ReactNode, use, useMemo, useState } from "react"
import { Linking, View } from "react-native"
import { EnrichedMarkdownText } from "react-native-enriched-markdown"
import Animated, { FadeIn } from "react-native-reanimated"
import { useCSSVariable } from "uniwind"

import type { SymbolName } from "@/components/icons/Symbol"
import { Menu } from "@/components/ui/menu"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { transitions } from "@/lib/motion"

import type { TicketView } from "./atoms"
import { statusSymbol } from "./StatusIcon"

type TicketContextValue = Readonly<{
  state: TicketView
  actions: Readonly<{ update: (patch: UpdateTicketInput) => void }>
  meta: Readonly<{ laidOut: boolean; markLaidOut: () => void }>
}>

const TicketContext = createContext<TicketContextValue | null>(null)

const useTicket = () => {
  const value = use(TicketContext)
  if (value === null) throw new Error("Ticket parts need a Ticket.Provider")
  return value
}

function TicketProvider({
  state,
  actions,
  children
}: Pick<TicketContextValue, "state" | "actions"> &
  Readonly<{ children: ReactNode }>) {
  const [laidOut, setLaidOut] = useState(false)
  const value = useMemo(
    () => ({
      state,
      actions,
      meta: { laidOut, markLaidOut: () => setLaidOut(true) }
    }),
    [state, actions, laidOut]
  )
  return <TicketContext value={value}>{children}</TicketContext>
}

function TicketFrame({ children }: Readonly<{ children: ReactNode }>) {
  const { meta } = useTicket()
  return <View style={{ opacity: meta.laidOut ? 1 : 0 }}>{children}</View>
}

function TicketHeader() {
  const { state } = useTicket()
  return (
    <View className="gap-1.5 px-5 pt-2">
      <View className="flex-row items-center gap-2">
        <Text variant="caption" className="font-mono">
          {state.ticket.id}
        </Text>
        <Text variant="caption">·</Text>
        <Text variant="caption" numberOfLines={1}>
          {state.project.icon} {state.project.name}
        </Text>
      </View>
      <Text variant="headline" selectable>
        {state.ticket.title}
      </Text>
    </View>
  )
}

function TicketProperties({ children }: Readonly<{ children: ReactNode }>) {
  const { meta } = useTicket()
  return (
    <View
      className="px-5 pt-4"
      onLayout={({ nativeEvent }) => {
        if (!meta.laidOut && nativeEvent.layout.height > 16) meta.markLaidOut()
      }}
    >
      <Menu.Bar>{children}</Menu.Bar>
    </View>
  )
}

const fallbackStatus = (slug: string): ProjectStatus["icon"] =>
  slug === "done" ? "CircleCheck" : "Circle"

function TicketStatusMenu() {
  const { state, actions } = useTicket()
  const current = state.statuses.find(
    (status) => status.slug === state.ticket.status
  )
  return (
    <Menu
      accessibilityLabel={copy.ticketStatusLabel}
      icon={statusSymbol(current?.icon ?? fallbackStatus(state.ticket.status))}
      iconColor={current?.color}
      label={current?.label ?? state.ticket.status}
    >
      <Menu.RadioGroup
        value={state.ticket.status}
        onValueChange={(status) => actions.update({ status })}
      >
        {state.statuses.map((status) => (
          <Menu.RadioItem
            key={status.slug}
            value={status.slug}
            icon={statusSymbol(status.icon)}
          >
            {status.label}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu>
  )
}

const priorities: ReadonlyArray<TicketPriority> = ["low", "med", "high"]

function TicketPriorityMenu() {
  const { state, actions } = useTicket()
  return (
    <Menu
      accessibilityLabel={copy.ticketPriorityLabel}
      icon="cellularbars"
      iconLevel={priorityLevel[state.ticket.priority]}
      label={copy.ticketPriority[state.ticket.priority]}
    >
      <Menu.RadioGroup
        value={state.ticket.priority}
        onValueChange={(priority) => actions.update({ priority })}
      >
        {priorities.map((priority) => (
          <Menu.RadioItem key={priority} value={priority}>
            {copy.ticketPriority[priority]}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu>
  )
}

const priorityLevel: Readonly<Record<TicketPriority, number>> = {
  low: 0.34,
  med: 0.67,
  high: 1
}

const types: ReadonlyArray<TicketType> = ["feat", "bug", "chore", "other"]

const typeSymbol: Readonly<Record<TicketType, SymbolName>> = {
  feat: "sparkles",
  bug: "ladybug",
  chore: "wrench.and.screwdriver",
  other: "circle.dashed"
}

function TicketTypeMenu() {
  const { state, actions } = useTicket()
  return (
    <Menu
      accessibilityLabel={copy.ticketTypeLabel}
      icon={typeSymbol[state.ticket.type]}
      label={copy.ticketType[state.ticket.type]}
    >
      <Menu.RadioGroup
        value={state.ticket.type}
        onValueChange={(type) => actions.update({ type })}
      >
        {types.map((type) => (
          <Menu.RadioItem key={type} value={type} icon={typeSymbol[type]}>
            {copy.ticketType[type]}
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Menu>
  )
}

function TicketAssigneeMenu() {
  const { state, actions } = useTicket()
  const people = state.people ?? []
  const firstAssigned = people.find((person) =>
    state.ticket.assignees.includes(person.id)
  )
  const count = state.ticket.assignees.length
  const label = Match.value(count).pipe(
    Match.when(0, () => copy.ticketUnassigned),
    Match.when(1, () => firstAssigned?.name ?? copy.ticketAssigneeCount(1)),
    Match.orElse(() => copy.ticketAssigneeCount(count))
  )
  const toggle = (id: string, checked: boolean) =>
    actions.update({
      assignees: checked
        ? [...state.ticket.assignees, id]
        : state.ticket.assignees.filter((assignee) => assignee !== id)
    })
  return (
    <Menu
      accessibilityLabel={copy.ticketAssigneesLabel}
      icon={count === 0 ? "person.crop.circle.dashed" : "person.crop.circle"}
      label={label}
    >
      {people.map((person) => (
        <Menu.CheckboxItem
          key={person.id}
          checked={state.ticket.assignees.includes(person.id)}
          onCheckedChange={(checked) => toggle(person.id, checked)}
        >
          {person.name}
        </Menu.CheckboxItem>
      ))}
    </Menu>
  )
}

function TicketGit() {
  const { state } = useTicket()
  const { branch, pr, prState } = state.ticket
  if (branch === null && pr === null) return null
  return (
    <View className="mx-5 mt-4 gap-2 rounded-lg bg-surface-1 px-4 py-3">
      {branch === null ? null : (
        <Text
          variant="caption"
          className="font-mono text-foreground"
          selectable
        >
          {branch}
        </Text>
      )}
      {pr === null ? null : (
        <Text variant="caption" className="font-mono">
          {copy.ticketPullRequest(
            pr,
            copy.ticketPullRequestState[prState ?? "open"]
          )}
        </Text>
      )}
    </View>
  )
}

const useMarkdownStyle = () => {
  const [foreground, muted, subtle, border] = useCSSVariable([
    "--color-foreground",
    "--color-muted-foreground",
    "--color-muted",
    "--color-border"
  ]).map(String)
  const body = {
    fontFamily: "Geist",
    fontSize: 16,
    lineHeight: 24,
    color: foreground
  }
  const heading = {
    fontFamily: "Geist-SemiBold",
    color: foreground,
    marginTop: 16,
    marginBottom: 6
  }
  return {
    paragraph: { ...body, marginBottom: 12 },
    h1: { ...heading, fontSize: 22 },
    h2: { ...heading, fontSize: 19 },
    h3: { ...heading, fontSize: 17 },
    list: { ...body, bulletColor: muted, markerColor: muted, itemSpacing: 4 },
    blockquote: {
      ...body,
      color: muted,
      borderColor: border,
      borderWidth: 2,
      gapWidth: 12
    },
    code: {
      fontFamily: "GeistMono-Regular",
      color: foreground,
      backgroundColor: subtle
    },
    codeBlock: {
      fontFamily: "GeistMono-Regular",
      fontSize: 13,
      lineHeight: 20,
      color: foreground,
      backgroundColor: subtle,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12
    },
    link: { color: foreground, underline: true },
    strong: { fontFamily: "Geist-SemiBold", fontWeight: "normal" },
    table: { fontSize: 14, borderColor: border, headerBackgroundColor: subtle }
  } as const
}

function TicketDescription() {
  const { state } = useTicket()
  const markdownStyle = useMarkdownStyle()
  const [arrivedLate] = useState(state.ticket.body === null)
  if (state.ticket.body === null) return null
  const body = state.ticket.body.trim()
  return (
    <Animated.View
      className="px-5 pt-5"
      entering={
        arrivedLate
          ? FadeIn.duration(transitions.fade.duration).easing(
              transitions.fade.easing
            )
          : undefined
      }
    >
      {body.length === 0 ? (
        <Text variant="muted">{copy.ticketNoDescription}</Text>
      ) : (
        <EnrichedMarkdownText
          flavor="github"
          markdown={body}
          markdownStyle={markdownStyle}
          enableTaskListItemToggle={false}
          onLinkPress={({ url }) => void Linking.openURL(url)}
        />
      )}
    </Animated.View>
  )
}

export const Ticket = {
  Provider: TicketProvider,
  Frame: TicketFrame,
  Header: TicketHeader,
  Properties: TicketProperties,
  Status: TicketStatusMenu,
  Priority: TicketPriorityMenu,
  Type: TicketTypeMenu,
  Assignees: TicketAssigneeMenu,
  Git: TicketGit,
  Description: TicketDescription
}
