# Dither Button Variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `variant="dither"` to the existing `Button` primitive that renders a WebGL-dithered gradient or image as the button backdrop, viewport-gated for performance, with CSS gradient fallback for SSR / lost-context cases.

**Architecture:** New cva variant on `Button`, plus internal `<DitherBackdrop>` component that layers a CSS gradient (always-on, SSR-safe) underneath a viewport-gated Paper shader (`Dithering` for gradients, `ImageDithering` for images). Discriminated `ButtonProps` keeps the new dither props from leaking into other variants' API.

**Tech Stack:** TanStack Start + React 19, Tailwind, cva, `@paper-design/shaders-react` (new), `IntersectionObserver`.

**Note on tests:** Per `CLAUDE.md` and the approved spec, no unit tests are added for this purely visual primitive. The TDD step from the skill template is replaced with **build → typecheck → visual smoke** loops.

---

## File Structure

- **Create:** `packages/frontend/src/lib/use-in-viewport.ts` — `IntersectionObserver` hook returning `[ref, inView]`.
- **Create:** `packages/frontend/src/components/ui/button-dither.tsx` — `<DitherBackdrop>` internal component (CSS fallback + lazy shader).
- **Modify:** `packages/frontend/src/components/ui/button.tsx` — add `"dither"` cva variant, extend `ButtonProps` discriminated typing, render `<DitherBackdrop>` when active.
- **Modify:** `packages/frontend/package.json` — add `@paper-design/shaders-react` dependency.

---

## Task 1: Install the Paper shaders dependency

**Files:**

- Modify: `packages/frontend/package.json`

- [ ] **Step 1: Install `@paper-design/shaders-react` into the frontend workspace**

Run from repo root:

```bash
bun add @paper-design/shaders-react --filter=@projectproject/frontend
```

If the workspace package name differs, fall back to:

```bash
cd packages/frontend && bun add @paper-design/shaders-react
```

Expected: `package.json` gets a `dependencies` entry for `@paper-design/shaders-react` (latest, ≥ 0.0.76), and `bun.lock` updates.

- [ ] **Step 2: Verify the import resolves**

Run from repo root:

```bash
bun --filter=@projectproject/frontend tsc --noEmit
```

If that command shape isn't right for this workspace, use:

```bash
cd packages/frontend && bun run typecheck
```

Expected: typecheck passes (no new errors). The package being installed is enough — no code yet imports it.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/package.json bun.lock
git commit -m "chore(frontend): add @paper-design/shaders-react dep for dither button"
```

---

## Task 2: Add `useInViewport` hook

**Files:**

- Create: `packages/frontend/src/lib/use-in-viewport.ts`

- [ ] **Step 1: Create the hook**

Write `packages/frontend/src/lib/use-in-viewport.ts`:

```ts
"use client"

import { useEffect, useRef, useState } from "react"

interface Options {
  rootMargin?: string
  threshold?: number | number[]
}

export function useInViewport<T extends Element>(
  options: Options = {}
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting)
        }
      },
      {
        rootMargin: options.rootMargin ?? "100px",
        threshold: options.threshold ?? 0
      }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [options.rootMargin, options.threshold])

  return [ref, inView]
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd packages/frontend && bun run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/use-in-viewport.ts
git commit -m "feat(frontend): add useInViewport hook"
```

---

## Task 3: Create `<DitherBackdrop>` component

**Files:**

- Create: `packages/frontend/src/components/ui/button-dither.tsx`

- [ ] **Step 1: Write the component**

Write `packages/frontend/src/components/ui/button-dither.tsx`:

```tsx
"use client"

import { Dithering, ImageDithering } from "@paper-design/shaders-react"
import { useInViewport } from "@/lib/use-in-viewport"

export type DitherDirection = "r" | "l" | "t" | "b" | "tr" | "tl" | "br" | "bl"

export interface DitherBackdropProps {
  from?: string
  to?: string
  direction?: DitherDirection
  image?: string
}

const DIRECTION_TO_CSS_ANGLE: Record<DitherDirection, string> = {
  r: "to right",
  l: "to left",
  t: "to top",
  b: "to bottom",
  tr: "to top right",
  tl: "to top left",
  br: "to bottom right",
  bl: "to bottom left"
}

const DEFAULT_FROM = "#000000"
const DEFAULT_TO = "#ffffff"
const DEFAULT_DIRECTION: DitherDirection = "r"

function cssGradient(
  from: string,
  to: string,
  direction: DitherDirection
): string {
  return `linear-gradient(${DIRECTION_TO_CSS_ANGLE[direction]}, ${from}, ${to})`
}

export function DitherBackdrop({
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  direction = DEFAULT_DIRECTION,
  image
}: DitherBackdropProps) {
  const [ref, inView] = useInViewport<HTMLSpanElement>()
  const fallback = image ? undefined : cssGradient(from, to, direction)

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{
        backgroundImage: fallback,
        backgroundSize: image ? "cover" : undefined,
        backgroundPosition: image ? "center" : undefined,
        backgroundColor: image ? "#000" : undefined
      }}
    >
      {inView && image && (
        <ImageDithering
          image={image}
          type="4x4"
          size={20}
          colorSteps={2}
          fit="cover"
          originalColors
          colorBack="#00000000"
          style={{ width: "100%", height: "100%" }}
        />
      )}
      {inView && !image && (
        <Dithering
          type="4x4"
          size={20}
          colorSteps={2}
          colorBack={from}
          colorFront={to}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd packages/frontend && bun run typecheck
```

Expected: passes. If `Dithering` / `ImageDithering` prop names differ in the installed version, adjust to match the package's types — the shape used here matches the example Wouter provided (0.0.76).

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/ui/button-dither.tsx
git commit -m "feat(button): add DitherBackdrop shader component"
```

---

## Task 4: Wire `"dither"` variant into `Button`

**Files:**

- Modify: `packages/frontend/src/components/ui/button.tsx`

- [ ] **Step 1: Extend the cva variants with `dither`**

In `packages/frontend/src/components/ui/button.tsx`, update the `variant` object inside `buttonVariants`:

```ts
variant: {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
  secondary:
    "bg-accent text-foreground hover:bg-accent/80 active:bg-accent",
  tertiary:
    "border border-border text-foreground bg-transparent hover:bg-muted active:bg-muted/60",
  ghost:
    "text-muted-foreground bg-transparent hover:bg-muted hover:text-foreground active:bg-muted/60",
  chip:
    "text-foreground bg-transparent hover:bg-accent hover:text-foreground active:bg-accent/80",
  dither: "bg-transparent overflow-hidden"
},
```

- [ ] **Step 2: Add a discriminated `ButtonProps` union**

Replace the existing `ButtonProps` interface block with:

```ts
import type { DitherDirection } from "./button-dither"
import { DitherBackdrop } from "./button-dither"

type BaseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> &
  Omit<
    VariantProps<typeof buttonVariants>,
    "variant" | "iconLeft" | "iconRight"
  > & {
    asChild?: boolean
    loading?: boolean
    leadingIcon?: IconComponent
    trailingIcon?: IconComponent
  }

type NonDitherVariant = Exclude<
  NonNullable<VariantProps<typeof buttonVariants>["variant"]>,
  "dither"
>

type NonDitherProps = BaseButtonProps & {
  variant?: NonDitherVariant
  ditherFrom?: never
  ditherTo?: never
  ditherDirection?: never
  ditherImage?: never
}

type DitherProps = BaseButtonProps & {
  variant: "dither"
  ditherFrom?: string
  ditherTo?: string
  ditherDirection?: DitherDirection
  ditherImage?: string
}

type ButtonProps = NonDitherProps | DitherProps
```

Keep the existing `IconComponent` and `cn`/`useShape` imports untouched.

- [ ] **Step 3: Update the `Button` component to render the dither backdrop**

Replace the `Button` `forwardRef` body's destructuring and final return blocks so that dither props are pulled off and the backdrop is rendered as the first child in the non-loading branches. The full updated component:

```tsx
const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    leadingIcon: LeadingIcon,
    trailingIcon: TrailingIcon,
    disabled,
    children,
    style,
    ...rest
  } = props

  const isDither = variant === "dither"
  const ditherFrom = isDither ? (props as DitherProps).ditherFrom : undefined
  const ditherTo = isDither ? (props as DitherProps).ditherTo : undefined
  const ditherDirection = isDither
    ? (props as DitherProps).ditherDirection
    : undefined
  const ditherImage = isDither ? (props as DitherProps).ditherImage : undefined

  const buttonHtmlProps = (() => {
    if (!isDither) return rest
    const r = { ...rest } as Record<string, unknown>
    delete r.ditherFrom
    delete r.ditherTo
    delete r.ditherDirection
    delete r.ditherImage
    return r as typeof rest
  })()

  const Comp = asChild ? Slot : "button"
  const isIconOnly =
    size === "icon" ||
    size === "icon-xs" ||
    size === "icon-sm" ||
    size === "icon-lg"
  const iconSize =
    size === "xs" ? 12 : size === "sm" ? 14 : size === "lg" ? 20 : 16
  const shape = useShape()

  const compClassName = cn(
    buttonVariants({
      variant,
      size,
      iconLeft: !isIconOnly && !!LeadingIcon,
      iconRight: !isIconOnly && !!TrailingIcon
    }),
    shape.button,
    className
  )

  const leadingIconNode = LeadingIcon && (
    <LeadingIcon
      size={iconSize}
      strokeWidth={1.5}
      className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
    />
  )
  const trailingIconNode = TrailingIcon && (
    <TrailingIcon
      size={iconSize}
      strokeWidth={1.5}
      className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
    />
  )

  const ditherBackdrop = isDither && (
    <DitherBackdrop
      from={ditherFrom}
      to={ditherTo}
      direction={ditherDirection}
      image={ditherImage}
    />
  )

  if (loading) {
    return (
      <Comp
        ref={ref}
        className={compClassName}
        disabled={disabled || loading}
        style={style}
        {...buttonHtmlProps}
      >
        {ditherBackdrop}
        <span className="relative z-10 flex items-center justify-center gap-[inherit] opacity-0">
          {LeadingIcon && !isIconOnly && (
            <LeadingIcon size={iconSize} strokeWidth={2} />
          )}
          {children}
          {TrailingIcon && !isIconOnly && (
            <TrailingIcon size={iconSize} strokeWidth={2} />
          )}
        </span>
        <span className="absolute inset-0 z-10 flex items-center justify-center">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none">
            <path
              d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
              stroke="currentColor"
              strokeWidth="1.125"
              strokeLinecap="round"
              pathLength="100"
              style={{
                strokeDasharray: "15 85",
                animation:
                  "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite"
              }}
            />
          </svg>
        </span>
      </Comp>
    )
  }

  if (isIconOnly) {
    return (
      <Comp
        ref={ref}
        className={compClassName}
        disabled={disabled}
        style={style}
        {...buttonHtmlProps}
      >
        {ditherBackdrop}
        <span className="relative z-10 [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]">
          {children}
        </span>
      </Comp>
    )
  }

  return (
    <Comp
      ref={ref}
      className={compClassName}
      disabled={disabled}
      style={style}
      {...buttonHtmlProps}
    >
      {ditherBackdrop}
      <span className="relative z-10 inline-flex items-center gap-[inherit]">
        {leadingIconNode}
        <Slottable>{children}</Slottable>
        {trailingIconNode}
      </span>
    </Comp>
  )
})
```

Keep `Button.displayName`, the `export { Button, buttonVariants }`, and `export type { ButtonProps }` blocks at the bottom.

- [ ] **Step 4: Typecheck**

Run:

```bash
cd packages/frontend && bun run typecheck
```

Expected: passes. Specifically verify:

- `<Button variant="dither" ditherFrom="#000" />` typechecks.
- `<Button variant="primary" ditherFrom="#000" />` is a TS error (ditherFrom is `never` on non-dither).

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/ui/button.tsx
git commit -m "feat(button): add dither variant with shader backdrop"
```

---

## Task 5: Manual visual smoke

**Files:**

- (Temporary) one existing route file with a CTA — or a brand-new sandbox route if convenient.

- [ ] **Step 1: Pick a host page**

Search for an existing route that already renders a `<Button>` you can temporarily swap to `variant="dither"`:

```bash
rg -n "<Button" packages/frontend/src/routes | head -20
```

Pick one (e.g. an empty state or a CTA in `routes/_app/`).

- [ ] **Step 2: Swap it to dither temporarily**

Edit one button instance to:

```tsx
<Button
  variant="dither"
  leadingIcon={Plus}
  ditherFrom="#0a0a0a"
  ditherTo="#6B97FF"
  ditherDirection="r"
  className="text-white"
>
  Connect GitHub
</Button>
```

- [ ] **Step 3: Run the dev server and verify**

Run:

```bash
cd packages/frontend && bun run dev
```

Open the route in a browser. Verify:

1. The button renders with a dithered gradient backdrop (icon side dark, text side blue).
2. Pressing the button gives the standard `active:scale-[0.97]` press feel.
3. Focus ring appears on keyboard focus.
4. Scrolling the button off-screen and back: CSS gradient remains visible while off-screen; shader re-mounts when back in view.
5. Disabled state (temporarily add `disabled`) dims the whole button.

- [ ] **Step 4: Revert the temporary swap**

Restore the original button code at the smoke-test site.

```bash
git checkout -- <that file>
```

- [ ] **Step 5: Final typecheck + commit nothing (smoke only)**

Run:

```bash
cd packages/frontend && bun run typecheck && cd ../.. && git status
```

Expected: typecheck passes, working tree clean.

---

## Self-review notes

- Spec coverage: API (Task 4), `<DitherBackdrop>` (Task 3), perf gating via `useInViewport` (Task 2), dep install (Task 1), visual smoke (Task 5). Out-of-scope items are not implemented, as intended.
- No placeholders: every step contains either exact code, exact commands, or both.
- Type consistency: `DitherDirection` is defined once in `button-dither.tsx` and re-imported by `button.tsx`. `DitherBackdrop` props use `from` / `to` / `direction` / `image` internally; `Button` exposes them as `ditherFrom` / `ditherTo` / `ditherDirection` / `ditherImage` (intentional, namespaced on Button's surface).
