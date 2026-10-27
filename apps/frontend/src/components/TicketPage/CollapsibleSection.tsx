import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useState, type ReactNode } from "react"

import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

export function CollapsibleSection({
  heading,
  children
}: Readonly<{
  heading: string
  children: ReactNode
}>) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section className="mt-8 space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="group flex items-center gap-2 text-lg font-semibold transition-[color,scale] duration-100 hover:text-muted-foreground active:scale-[0.97]"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          className={cn(
            "size-4 transition-transform duration-200",
            !collapsed && "rotate-90"
          )}
        />
        <span>{heading}</span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transitions.layout}
            className="overflow-y-clip"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
