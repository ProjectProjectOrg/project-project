import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TRANSITION = { duration: 0.15, ease: [0.215, 0.61, 0.355, 1] } as const
const CONFIRM_DURATION_MS = 1200

export function CopyButton({
  value,
  className,
  iconClassName,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  variant = "ghost",
  size = "icon-xs"
}: {
  value: string
  className?: string
  iconClassName?: string
  copyLabel?: string
  copiedLabel?: string
} & Pick<ButtonProps, "variant" | "size">) {
  const [copied, setCopied] = useState(false)
  const reduceMotion = useReducedMotion()

  async function copy(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), CONFIRM_DURATION_MS)
    } catch {}
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      data-copied={copied || undefined}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : copyLabel}
      className={className}
    >
      <AnimatePresence initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={
              reduceMotion ? undefined : { opacity: 0, filter: "blur(4px)" }
            }
            transition={TRANSITION}
            className="absolute inset-0 grid place-items-center"
          >
            <Check className={cn(iconClassName)} strokeWidth={2} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={
              reduceMotion ? undefined : { opacity: 0, filter: "blur(4px)" }
            }
            transition={TRANSITION}
            className="absolute inset-0 grid place-items-center"
          >
            <Copy className={cn(iconClassName)} strokeWidth={1.75} />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  )
}
