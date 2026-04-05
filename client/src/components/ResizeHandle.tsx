import { useCallback, useRef } from "react"

interface ResizeHandleProps {
  onResize: (delta: number) => void
  side?: "left" | "right"
}

export function ResizeHandle({ onResize, side = "right" }: ResizeHandleProps) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      lastX.current = e.clientX
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const delta = ev.clientX - lastX.current
        lastX.current = ev.clientX
        onResize(side === "right" ? delta : -delta)
      }

      const onMouseUp = () => {
        dragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [onResize, side],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize hover:bg-primary-container/40 active:bg-primary-container/60 transition-colors"
    />
  )
}
