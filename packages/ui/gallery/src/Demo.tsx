import { Button } from "@pp/ui/button"
import { Code2, Maximize2, X } from "@pp/ui/icons"
import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { Suspense, use, useRef, useState } from "react"

import { AccessibilityBadge } from "./AccessibilityBadge"
import { CodeView } from "./CodeView"
import { PageContext } from "./context"
import { IconSwap } from "./IconSwap"
import { Loaded } from "./Loaded"
import { demos } from "./registry"

export function Demo({
  name,
  title,
  className
}: Readonly<{ name: string; title: string; className?: string }>) {
  const page = use(PageContext)
  const demo = demos.get(`${page}/${name}`)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [showCode, setShowCode] = useState(false)

  if (demo === undefined)
    return (
      <p className="text-body text-destructive">
        No demo named {name} in {page}.
      </p>
    )

  return (
    <figure className="my-8 rounded-[20px] bg-surface-2 p-1.5 corner-squircle">
      <div
        ref={canvasRef}
        className={cn(
          "grid min-h-44 place-items-center rounded-[14px] bg-page p-10 corner-squircle",
          className
        )}
      >
        <Suspense fallback={null}>
          <Loaded loadable={demo.Component}>
            {(Component) => <Component />}
          </Loaded>
        </Suspense>
      </div>
      <figcaption className="mt-1.5 flex h-10 items-center gap-2 rounded-[14px] bg-surface-4 pr-1.5 pl-3.5 corner-squircle">
        <span className="text-caption font-semibold">{title}</span>
        <AccessibilityBadge target={canvasRef} />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="secondary"
            size="square-7"
            aria-label={showCode ? "Hide code" : "Show code"}
            aria-pressed={showCode}
            onPointerEnter={() => void demo.source.load()}
            onClick={() => setShowCode(!showCode)}
            className="rounded-[8px] corner-squircle"
          >
            <IconSwap swapKey={showCode ? "hide" : "show"}>
              {showCode ? (
                <X className="size-3.5" strokeWidth={2} />
              ) : (
                <Code2 className="size-3.5" strokeWidth={2} />
              )}
            </IconSwap>
          </Button>
          <Button
            variant="secondary"
            size="square-7"
            aria-label="Open on its own"
            render={<a href={`/demo/${demo.id}`} />}
            className="rounded-[8px] corner-squircle"
          >
            <Maximize2 className="size-3.5" strokeWidth={2} />
          </Button>
        </div>
      </figcaption>
      <AnimatePresence initial={false}>
        {showCode ? (
          <motion.div
            key="code"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: spring.moderate }}
            exit={{
              opacity: 0,
              y: -6,
              transition: { type: "tween", ...spring.moderate.exit }
            }}
          >
            <Suspense fallback={null}>
              <Loaded loadable={demo.source}>
                {(source) => (
                  <CodeView
                    source={source}
                    className="mt-1.5 max-h-[28rem] overflow-y-auto rounded-[14px] bg-surface-3 corner-squircle"
                  />
                )}
              </Loaded>
            </Suspense>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </figure>
  )
}
