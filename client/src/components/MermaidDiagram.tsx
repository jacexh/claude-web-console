import { useEffect, useRef, useState } from "react"

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

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const id = `mermaid-${++idCounter}`
    let cancelled = false

    loadMermaid().then((mod) => {
      if (cancelled) return
      return mod.default.render(id, chart.trim())
    }).then((result) => {
      if (!cancelled && el && result) {
        el.innerHTML = result.svg
        setError(null)
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(String(err?.message ?? err))
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
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
    <div ref={containerRef} className="flex justify-center py-2 [&_svg]:max-w-full">
      {loading && <span className="text-xs text-slate-400 animate-pulse">Loading diagram...</span>}
    </div>
  )
}
