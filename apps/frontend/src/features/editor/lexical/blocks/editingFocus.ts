const BLOCK_CHROME = "[data-block-gutter], [data-block-menu]"

export const isBlockChrome = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(BLOCK_CHROME) !== null

export const entersEditing = (
  host: Element,
  target: EventTarget | null
): boolean =>
  target instanceof Node && host.contains(target) && !isBlockChrome(target)

export const keepsEditing = (
  host: Element,
  next: EventTarget | null
): boolean =>
  next instanceof Node && (host.contains(next) || isBlockChrome(next))
