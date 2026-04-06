import { useEffect, useState } from "react"

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
  const [error, setError] = useState<string | null>(null)
  const [svgHtml, setSvgHtml] = useState<string | null>(null)

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
    <div className="flex justify-center py-2 [&_svg]:max-w-full">
      {svgHtml == null ? (
        <span className="text-xs text-slate-400 animate-pulse">Loading diagram...</span>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
      )}
    </div>
  )
}
