import type { PinTarget, SidebarPin } from "@pp/shared"
import { SidebarRowGroup, SidebarSubRows } from "@pp/ui/sidebar"

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
// sidebar's sub-row line), as many levels as there are. The sub-rows stay
// mounted while empty so a sub-ticket's row grows in like a top-level one.
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
      <SidebarSubRows>
        <SidebarRowGroup>
          {children.map((child) => (
            <PinTree
              key={child.row.key}
              orgSlug={orgSlug}
              slug={slug}
              node={child}
            />
          ))}
        </SidebarRowGroup>
      </SidebarSubRows>
    </>
  )
}

// The pins at the top of a tree, in order: what the list reorders.
export const topPins = (nodes: ReadonlyArray<PinNode<PinRowSpec>>) =>
  nodes.flatMap((node) => (node.row.pin === null ? [] : [node.row.pin]))
