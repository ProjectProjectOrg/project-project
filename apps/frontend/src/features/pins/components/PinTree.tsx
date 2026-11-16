import type { PinTarget, SidebarPin } from "@pp/shared"
import { SidebarSubRows } from "@pp/ui/sidebar"

import { PinRow } from "@/features/pins/components/PinRow"
import type { PinNode, PinPrediction } from "@/features/pins/lib/pins"

// One row of the Pinned list: a pin, or the live row for what you're viewing.
export type PinRowSpec = Readonly<{
  key: string
  target: PinTarget
  display: PinPrediction
  // The pin itself, when pinned (for reordering).
  pin: SidebarPin | null
  active: boolean
  highlight?: boolean
  onPinned?: () => void
}>

// A row and, under it, the rows of its sub-tickets (indented, with the
// sidebar's sub-row line), as many levels as there are.
export function PinTree({
  orgSlug,
  slug,
  node
}: Readonly<{ orgSlug: string; slug: string; node: PinNode<PinRowSpec> }>) {
  const { row, children } = node
  return (
    <>
      <PinRow
        orgSlug={orgSlug}
        slug={slug}
        target={row.target}
        display={row.display}
        pinned={row.pin !== null}
        active={row.active}
        highlight={row.highlight}
        onPinned={row.onPinned}
      />
      {children.length === 0 ? null : (
        <SidebarSubRows>
          {children.map((child) => (
            <PinTree
              key={child.row.key}
              orgSlug={orgSlug}
              slug={slug}
              node={child}
            />
          ))}
        </SidebarSubRows>
      )}
    </>
  )
}

// The pins at the top of a tree, in order: what the list reorders.
export const topPins = (
  nodes: ReadonlyArray<PinNode<PinRowSpec>>
): ReadonlyArray<SidebarPin> =>
  nodes.flatMap((node) => (node.row.pin === null ? [] : [node.row.pin]))
