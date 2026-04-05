import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

interface CollapsibleContextValue {
  open: boolean
  toggle: () => void
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

interface CollapsibleProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function Collapsible({ open: controlledOpen, onOpenChange, children, className }: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const toggle = useCallback(() => {
    const next = !open
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }, [open, isControlled, onOpenChange])

  return (
    <CollapsibleContext.Provider value={{ open, toggle }}>
      <div className={className}>{children}</div>
    </CollapsibleContext.Provider>
  )
}

export function CollapsibleTrigger({ children, className, ...props }: React.ComponentProps<"button">) {
  const ctx = useContext(CollapsibleContext)
  if (!ctx) throw new Error("CollapsibleTrigger must be used within Collapsible")

  return (
    <button
      type="button"
      className={className}
      onClick={ctx.toggle}
      {...props}
    >
      {children}
    </button>
  )
}

export function CollapsibleContent({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(CollapsibleContext)
  if (!ctx) throw new Error("CollapsibleContent must be used within Collapsible")

  if (!ctx.open) return null

  return <div className={className}>{children}</div>
}
