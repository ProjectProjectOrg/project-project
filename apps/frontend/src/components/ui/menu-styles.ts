export const menuPopupClass =
  "relative z-50 max-h-[var(--available-height)] min-w-[8rem] origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-xl border border-border/60 bg-card p-1 text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.02)] outline-none select-none data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:data-[closed]:animate-none motion-reduce:data-[open]:animate-none dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"

export const menuItemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md border-y border-transparent bg-clip-padding px-2 py-[7px] text-[13px] leading-5 text-muted-foreground outline-hidden transition-colors data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-[stroke-width,color] [&_svg]:duration-80 data-[highlighted]:[&_svg]:stroke-[2] [&_svg:not([class*='size-'])]:size-4"

export const menuLabelClass = "px-2 py-1.5 text-[11px] text-muted-foreground"

export const menuSeparatorClass =
  "-mx-1 my-1 h-px bg-border/60 first:hidden last:hidden"

export const menuChoiceItemClass =
  "data-[checked]:bg-active data-[checked]:text-foreground data-[selected]:bg-active data-[selected]:text-foreground"

export const menuChoiceIndicatorClass =
  "invisible ml-auto flex size-4 shrink-0 items-center justify-center [[data-checked]>&]:visible [[data-menu-meta]+&]:ml-2 [[data-selected]>&]:visible"

export const menuItemMetaClass =
  "ml-auto font-mono text-[11px] text-muted-foreground tabular-nums"
