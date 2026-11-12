import type { TicketId } from "@pp/shared"
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react"

import { useReturnToTicket } from "@/features/tickets/hooks/useReturnToTicket"
import { listStep, stepTicket } from "@/features/tickets/lib/listKeyboard"
import { useKeyboardMode } from "@/hooks/useKeyboardMode"
import { hasModifier, ownsKeystrokes } from "@/lib/keyboard"

type ListKeyboardSection = Readonly<{
  ticketIds: ReadonlyArray<TicketId>
  reveal: (ticketId: TicketId) => void
}>

type Sections = Map<HTMLElement, ListKeyboardSection>

const ListKeyboardContext = createContext<Readonly<{
  register: (element: HTMLElement, section: ListKeyboardSection) => () => void
}> | null>(null)

const shownSections = (sections: Sections) =>
  [...sections]
    .filter(([element]) => element.isConnected && !element.closest("[inert]"))
    .toSorted(([a], [b]) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map(([, section]) => section)

const reveal = (sections: Sections, ticketId: TicketId) => {
  const section = shownSections(sections).find(({ ticketIds }) =>
    ticketIds.includes(ticketId)
  )
  section?.reveal(ticketId)
  return section !== undefined
}

const rowTicketId = (element: Element | null) =>
  element?.closest<HTMLElement>("[data-ticket-id]")?.dataset.ticketId ?? null

export function ListKeyboardProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null)
  const sections = useRef<Sections>(new Map())
  const last = useRef<string | null>(null)
  const [focusTicket] = useState(
    () => (ticketId: TicketId) => reveal(sections.current, ticketId)
  )
  const returnToTicket = useReturnToTicket(focusTicket)
  const startKeyboardMode = useKeyboardMode(root, (event, wasNavigating) => {
    const element = root.current
    if (!element) return
    const focused = document.activeElement
    if (
      wasNavigating &&
      focused instanceof HTMLElement &&
      focused.matches("[data-row-link]") &&
      element.contains(focused)
    )
      focused.blur()
    if (!(event.target instanceof Element) || !element.contains(event.target))
      return
    const hovered = rowTicketId(event.target)
    if (hovered !== null) last.current = hovered
  })
  const [context] = useState(() => ({
    register: (element: HTMLElement, section: ListKeyboardSection) => {
      sections.current.set(element, section)
      returnToTicket()
      return () => {
        if (sections.current.get(element) === section)
          sections.current.delete(element)
      }
    }
  }))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step = listStep(event.key)
      const target = event.target
      if (
        step === null ||
        event.defaultPrevented ||
        hasModifier(event) ||
        ownsKeystrokes(target)
      )
        return
      const focused =
        target instanceof Element && root.current?.contains(target)
          ? rowTicketId(target)
          : null
      if (
        event.key.startsWith("Arrow") &&
        focused === null &&
        target !== document.body
      )
        return
      const shown = shownSections(sections.current)
      const next = stepTicket(
        shown.map(({ ticketIds }) => ticketIds),
        focused ?? last.current,
        step
      )
      if (next === null) return
      event.preventDefault()
      startKeyboardMode()
      reveal(sections.current, next)
    }
    const onFocusIn = (event: FocusEvent) => {
      const ticketId = rowTicketId(
        event.target instanceof Element ? event.target : null
      )
      if (ticketId !== null) last.current = ticketId
    }
    const element = root.current
    document.addEventListener("keydown", onKeyDown)
    element?.addEventListener("focusin", onFocusIn)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      element?.removeEventListener("focusin", onFocusIn)
    }
  }, [startKeyboardMode])

  return (
    <ListKeyboardContext value={context}>
      <div ref={root} className="contents">
        {children}
      </div>
    </ListKeyboardContext>
  )
}

export function useListKeyboardSection(
  ref: RefObject<HTMLElement | null>,
  ticketIds: ReadonlyArray<TicketId>,
  reveal: (ticketId: TicketId) => void
): void {
  const context = use(ListKeyboardContext)
  useLayoutEffect(() => {
    const element = ref.current
    if (context === null || element === null) return undefined
    return context.register(element, { ticketIds, reveal })
  }, [context, ref, ticketIds, reveal])
}
