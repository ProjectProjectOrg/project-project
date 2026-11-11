export type BoardKeyboardColumn = Readonly<{
  ticketIds: ReadonlyArray<string>
  reveal: (index: number) => void
}>

type Position = Readonly<{
  status: string
  ticketId: string | null
}>

const focusableSelector =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'

const cardSelector = "[data-board-card]"
const primarySelector = "[data-board-card] > [data-row-link]"

const available = (element: HTMLElement): boolean =>
  !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
  !element.matches(":disabled")

const columnElements = (board: HTMLElement) =>
  Array.from(board.querySelectorAll<HTMLElement>("[data-board-column]"))

const columnElement = (board: HTMLElement, status: string) =>
  columnElements(board).find(
    (element) => element.dataset.boardColumn === status
  )

const primary = (
  board: HTMLElement,
  position: Position
): HTMLElement | null => {
  const column = columnElement(board, position.status)
  if (!column) return null
  if (position.ticketId === null) {
    return column.querySelector<HTMLElement>(
      "button[data-column-header], [data-column-header] button"
    )
  }
  return (
    Array.from(column.querySelectorAll<HTMLElement>(primarySelector)).find(
      (element) =>
        element.parentElement?.dataset.boardCard === position.ticketId
    ) ?? null
  )
}

const positionOf = (element: HTMLElement): Position | null => {
  const column = element.closest<HTMLElement>("[data-board-column]")
  const status = column?.dataset.boardColumn
  if (status === undefined) return null
  return {
    status,
    ticketId:
      element.closest<HTMLElement>(cardSelector)?.dataset.boardCard ?? null
  }
}

function nextPosition({
  key,
  position,
  statuses,
  columns
}: Readonly<{
  key: string
  position: Position
  statuses: ReadonlyArray<string>
  columns: ReadonlyMap<string, BoardKeyboardColumn>
}>): Position | null | undefined {
  const columnIndex = statuses.indexOf(position.status)
  const ticketIds = columns.get(position.status)?.ticketIds ?? []
  const index =
    position.ticketId === null ? -1 : ticketIds.indexOf(position.ticketId)
  let next: Position | null = null
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const status = statuses[columnIndex + (key === "ArrowRight" ? 1 : -1)]
    if (status !== undefined) {
      const otherIds = columns.get(status)?.ticketIds ?? []
      next = {
        status,
        ticketId:
          index < 0
            ? null
            : (otherIds[Math.min(index, otherIds.length - 1)] ?? null)
      }
    }
  } else if (key === "ArrowUp" && index >= 0) {
    next = { status: position.status, ticketId: ticketIds[index - 1] ?? null }
  } else if (key === "ArrowDown" && index + 1 < ticketIds.length) {
    next = { status: position.status, ticketId: ticketIds[index + 1] ?? null }
  } else if (key === "Home") {
    next = { status: position.status, ticketId: ticketIds[0] ?? null }
  } else if (key === "End") {
    next = { status: position.status, ticketId: ticketIds.at(-1) ?? null }
  } else if (!key.startsWith("Arrow")) {
    return undefined
  }
  return next
}

const firstPosition = (board: HTMLElement): Position | null => {
  const status = columnElements(board)[0]?.dataset.boardColumn
  if (status === undefined) return null
  const firstCard = Array.from(
    columnElement(board, status)?.querySelectorAll<HTMLElement>(
      primarySelector
    ) ?? []
  ).find(available)
  return {
    status,
    ticketId: firstCard?.parentElement?.dataset.boardCard ?? null
  }
}

export function createBoardKeyboardNavigation(
  board: HTMLElement,
  columns: ReadonlyMap<string, BoardKeyboardColumn>
) {
  const originalTabIndexes = new Map<HTMLElement, string | null>()
  let active: Position | null = null
  let controls: HTMLElement | null = null
  let pendingFocus = false
  let disposed = false
  let hadFocus = false
  let visited = false

  const ids = (status: string) => columns.get(status)?.ticketIds ?? []

  const reconcile = () => {
    if (!visited || active === null || !columnElement(board, active.status)) {
      active = firstPosition(board)
    } else if (
      active.ticketId !== null &&
      !ids(active.status).includes(active.ticketId)
    ) {
      active = { status: active.status, ticketId: null }
      controls = null
    }
    if (active && !hadFocus && !pendingFocus && !primary(board, active)) {
      const mounted = columnElement(
        board,
        active.status
      )?.querySelector<HTMLElement>(primarySelector)
      active = {
        status: active.status,
        ticketId: mounted?.parentElement?.dataset.boardCard ?? null
      }
    }
  }

  const elements = () =>
    Array.from(board.querySelectorAll<HTMLElement>(focusableSelector))

  const isControl = (element: HTMLElement, entry: HTMLElement | null) =>
    controls !== null &&
    controls.contains(element) &&
    element !== entry &&
    originalTabIndexes.get(element) !== "-1" &&
    !element.matches('[data-slot="scroll-area-viewport"]') &&
    (!controls.matches("[data-board-column]") || !element.closest(cardSelector))

  const sync = () => {
    if (disposed) return
    reconcile()
    const entry = active === null ? null : primary(board, active)
    for (const element of elements()) {
      if (!originalTabIndexes.has(element)) {
        originalTabIndexes.set(element, element.getAttribute("tabindex"))
      }
      const enabled =
        available(element) &&
        (controls === null ? element === entry : isControl(element, entry))
      const next = enabled ? "0" : "-1"
      if (element.getAttribute("tabindex") !== next)
        element.setAttribute("tabindex", next)
    }
    for (const element of originalTabIndexes.keys()) {
      if (!board.contains(element)) originalTabIndexes.delete(element)
    }
    if (pendingFocus && entry && available(entry)) {
      pendingFocus = false
      entry.focus({ preventScroll: true })
      entry.scrollIntoView({ block: "nearest", inline: "nearest" })
    } else if (
      hadFocus &&
      !board.contains(document.activeElement) &&
      document.activeElement === document.body &&
      entry
    ) {
      entry.focus({ preventScroll: true })
    }
  }

  const focusPosition = (position: Position) => {
    active = position
    visited = true
    controls = null
    pendingFocus = true
    const index =
      position.ticketId === null
        ? -1
        : ids(position.status).indexOf(position.ticketId)
    if (index >= 0) columns.get(position.status)?.reveal(index)
    sync()
  }

  const onFocus = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLElement)) return
    const position = positionOf(event.target)
    if (!position) return
    active = position
    hadFocus = true
    visited = true
    pendingFocus = false
    const entry = primary(board, position)
    controls =
      event.target === entry
        ? null
        : (event.target.closest<HTMLElement>(cardSelector) ??
          columnElement(board, position.status) ??
          null)
    sync()
  }

  const onBlur = (event: FocusEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      board.contains(event.relatedTarget)
    )
      return
    hadFocus =
      event.relatedTarget === null && document.activeElement === document.body
    if (event.relatedTarget !== null) {
      controls = null
      pendingFocus = false
      sync()
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    if (!(event.target instanceof HTMLElement) || !board.contains(event.target))
      return
    const position = positionOf(event.target)
    if (!position) return
    if (event.key === "Escape" && controls !== null) {
      event.preventDefault()
      event.stopPropagation()
      focusPosition(position)
      return
    }
    if (controls !== null) return
    if (event.key === "F2") {
      const container =
        event.target.closest<HTMLElement>(cardSelector) ??
        columnElement(board, position.status)
      if (!container) return
      const entry = primary(board, position)
      controls = container
      const first = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      ).find((element) => isControl(element, entry) && available(element))
      if (!first) {
        controls = null
        return
      }
      event.preventDefault()
      event.stopPropagation()
      sync()
      first.focus()
      return
    }
    const next = nextPosition({
      key: event.key,
      position,
      statuses: columnElements(board).flatMap(
        (element) => element.dataset.boardColumn ?? []
      ),
      columns
    })
    if (next === undefined) return
    event.preventDefault()
    event.stopPropagation()
    if (next) focusPosition(next)
  }

  const observer = new MutationObserver(sync)
  observer.observe(board, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["tabindex", "disabled", "inert", "hidden"]
  })
  board.addEventListener("focusin", onFocus)
  board.addEventListener("focusout", onBlur)
  sync()

  return {
    refresh: sync,
    onKeyDown,
    dispose: () => {
      disposed = true
      observer.disconnect()
      board.removeEventListener("focusin", onFocus)
      board.removeEventListener("focusout", onBlur)
      for (const [element, value] of originalTabIndexes) {
        if (value === null) element.removeAttribute("tabindex")
        else element.setAttribute("tabindex", value)
      }
    }
  }
}
