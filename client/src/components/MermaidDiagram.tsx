import { useEffect, useCallback, useRef, useState } from "react"
import { Maximize2, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"

let idCounter = 0
let mermaidPromise: Promise<typeof import("mermaid")> | null = null

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
      })
      return mod
    })
  }
  return mermaidPromise
}

function fitScale(svgHtml: string): number {
  const wMatch = svgHtml.match(/width="([\d.]+)/)
  const hMatch = svgHtml.match(/height="([\d.]+)/)
  if (!wMatch || !hMatch) return 1.5
  const svgW = parseFloat(wMatch[1])
  const svgH = parseFloat(hMatch[1])
  // leave 80px for toolbar and padding
  const vw = window.innerWidth * 0.9
  const vh = (window.innerHeight - 80) * 0.9
  return Math.min(vw / svgW, vh / svgH, 3)
}

function DiagramPreview({ svgHtml, onClose }: { svgHtml: string; onClose: () => void }) {
  const initialScale = useRef(fitScale(svgHtml))
  const [scale, setScale] = useState(initialScale.current)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const reset = useCallback(() => {
    setScale(initialScale.current)
    setTranslate({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.min(5, Math.max(0.2, s - e.deltaY * 0.001)))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [translate])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.startX
    const dy = e.clientY - dragging.current.startY
    setTranslate({ x: dragging.current.origX + dx, y: dragging.current.origY + dy })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/90 border-b shadow-sm" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium text-slate-600">Diagram Preview</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setScale((s) => Math.min(5, s + 0.25))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-400 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.max(0.2, s - 0.25))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={reset} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="h-full w-full flex items-center justify-center [&_svg]:max-w-none [&_svg]:max-h-none"
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
        >
          <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
        </div>
      </div>
    </div>
  )
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const [error, setError] = useState<string | null>(null)
  const [svgHtml, setSvgHtml] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    let cancelled = false

    setSvgHtml(null)
    setError(null)

    loadMermaid().then((mod) => {
      if (cancelled) return
      const id = `mermaid-${++idCounter}`
      return mod.default.render(id, chart.trim())
    }).then((result) => {
      if (!cancelled && result) {
        setSvgHtml(result.svg)
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(String(err?.message ?? err))
      }
    })

    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <pre className="rounded-md bg-red-50 p-3 text-xs text-red-600 font-mono overflow-auto">
        {error}
      </pre>
    )
  }

  return (
    <>
      <div className="group relative flex justify-center py-2 [&_svg]:max-w-full">
        {svgHtml == null ? (
          <span className="text-xs text-slate-400 animate-pulse">Loading diagram...</span>
        ) : (
          <>
            <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
            <button
              onClick={() => setPreview(true)}
              className="absolute top-3 right-2 p-1.5 rounded-md bg-white/80 border border-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-600 hover:bg-white transition-all shadow-sm"
              title="Preview"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {preview && svgHtml && <DiagramPreview svgHtml={svgHtml} onClose={() => setPreview(false)} />}
    </>
  )
}
