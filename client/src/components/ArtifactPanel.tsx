import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, FileCode, Terminal, Pencil, PanelRightClose, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import { CodeBlock, langFromPath } from "./CodeBlock"
import { MermaidDiagram } from "./MermaidDiagram"

export interface Artifact {
  toolName: string
  input: Record<string, unknown>
  result?: unknown
}

interface ArtifactPanelProps {
  artifact: Artifact | null
  onClose: () => void
}

function renderTitle(artifact: Artifact): string {
  const { toolName, input } = artifact
  if (input.file_path) return `${toolName}: ${String(input.file_path).split("/").pop()}`
  if (input.command) return `${toolName}: command`
  if (input.pattern) return `${toolName}: ${String(input.pattern)}`
  return toolName
}

function ToolIcon({ toolName }: { toolName: string }) {
  if (toolName === "Bash") return <Terminal className="h-4 w-4 text-amber-500" />
  if (toolName === "Edit" || toolName === "Write") return <Pencil className="h-4 w-4 text-violet-500" />
  return <FileCode className="h-4 w-4 text-blue-500" />
}

/** Detect if a string looks like HTML */
function isHtml(text: string): boolean {
  const trimmed = text.trimStart()
  return /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || /^<(?:div|section|article|main|body|head|p|h[1-6]|table|ul|ol|form|nav|header|footer)\b/i.test(trimmed)
}

/** Detect if a string looks like Markdown */
function isMarkdown(text: string): boolean {
  // Check for common markdown patterns
  return /^#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /\[.*?\]\(.*?\)/.test(text) ||
    /^>\s/m.test(text) ||
    /\|.*\|.*\|/m.test(text) ||
    /^```/m.test(text)
}

/** Detect if a string looks like unified diff output */
function isDiff(text: string): boolean {
  // Must have @@ hunk headers or diff/--- /+++ header lines
  return /^@@\s/m.test(text) ||
    (/^---\s/m.test(text) && /^\+\+\+\s/m.test(text)) ||
    /^diff\s--git\s/m.test(text)
}

/** Detect if a file path indicates an image */
function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(path)
}

/** Detect if content is raw SVG markup */
function isSvgContent(text: string): boolean {
  const trimmed = text.trimStart()
  return /^<svg[\s>]/i.test(trimmed) || (/^<\?xml/i.test(trimmed) && /<svg[\s>]/i.test(trimmed))
}

/** Detect if a file path is an SVG */
function isSvgPath(path: string): boolean {
  return /\.svg$/i.test(path)
}

/** Hook for native browser fullscreen on a container element */
function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggle = useCallback(() => {
    if (!ref.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      ref.current.requestFullscreen()
    }
  }, [])

  return { ref, isFullscreen, toggle }
}

/** Render HTML content in a sandboxed iframe with fullscreen toggle */
function HtmlPreview({ html }: { html: string }) {
  const { ref, isFullscreen, toggle } = useFullscreen()
  const srcDoc = useMemo(() => html, [html])

  return (
    <div ref={ref} className="relative group bg-white rounded-md">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="absolute top-2 right-2 z-10 h-7 w-7 bg-white/70 hover:bg-white shadow-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </Button>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full bg-white rounded-md"
        style={{ border: "none", height: isFullscreen ? "100vh" : "calc(100vh - 7rem)" }}
        title="HTML Preview"
      />
    </div>
  )
}

/** Render SVG with zoom/pan controls and fullscreen support */
function SvgPreview({ svg }: { svg: string }) {
  const { ref: fsRef, isFullscreen, toggle: toggleFs } = useFullscreen()
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.min(5, Math.max(0.1, s - e.deltaY * 0.001)))
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [translate])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setTranslate({ x: dragging.current.origX + (e.clientX - dragging.current.startX), y: dragging.current.origY + (e.clientY - dragging.current.startY) })
  }, [])

  const onPointerUp = useCallback(() => { dragging.current = null }, [])

  return (
    <div ref={fsRef} className="flex flex-col bg-white rounded-md" style={{ height: isFullscreen ? "100vh" : "calc(100vh - 7rem)" }}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-slate-100 shrink-0">
        <button onClick={() => setScale((s) => Math.min(5, s + 0.25))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-400 w-12 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.max(0.1, s - 0.25))} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button onClick={reset} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Reset">
          <RotateCcw className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onClick={toggleFs} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Fullscreen">
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      {/* Canvas */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="h-full w-full flex items-center justify-center [&_svg]:max-w-none [&_svg]:max-h-none"
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
        >
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    </div>
  )
}

/** Render unified diff with line-level coloring */
function DiffView({ content }: { content: string }) {
  const lines = content.split("\n")
  return (
    <pre className="rounded-md bg-secondary p-3 text-[13px] font-mono leading-relaxed overflow-auto max-h-[calc(100vh-120px)]">
      {lines.map((line, i) => {
        let bg = ""
        let color = "text-foreground"
        if (line.startsWith("+") && !line.startsWith("+++")) {
          bg = "bg-emerald-50"
          color = "text-emerald-800"
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          bg = "bg-red-50"
          color = "text-red-700"
        } else if (line.startsWith("@@")) {
          color = "text-blue-600"
        } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
          color = "text-slate-500 font-semibold"
        }
        return (
          <div key={i} className={`${bg} ${color} px-2 -mx-2 whitespace-pre-wrap break-all`}>
            {line}
          </div>
        )
      })}
    </pre>
  )
}

/** Render Markdown content */
function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="prose-custom text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "")
            const text = String(children)
            if (match?.[1] === "mermaid") {
              return <MermaidDiagram chart={text} />
            }
            if (match || text.includes("\n")) {
              return <CodeBlock language={match?.[1]}>{text}</CodeBlock>
            }
            return <code className={className} {...props}>{children}</code>
          },
        }}
      >{markdown}</ReactMarkdown>
    </div>
  )
}

/** Extract plain text from SDK structured content (string or [{type:"text",text:"..."}]) */
function extractText(raw: unknown): string {
  let text: string
  if (typeof raw === "string") {
    text = raw
  } else if (Array.isArray(raw)) {
    text = raw
      .filter((b: Record<string, unknown>) => b.type === "text" && typeof b.text === "string")
      .map((b: Record<string, unknown>) => b.text)
      .join("\n")
  } else {
    text = JSON.stringify(raw, null, 2)
  }
  return text
}

/** Strip line number prefixes from Read tool output (e.g. "  1\tcontent" → "content") */
function stripLineNumbers(text: string): string {
  const lines = text.split("\n")
  // Check if most lines match the pattern: optional spaces + number + tab
  const numbered = lines.filter((l) => /^\s*\d+\t/.test(l))
  if (numbered.length > lines.length * 0.5) {
    return lines.map((l) => l.replace(/^\s*\d+\t/, "")).join("\n")
  }
  return text
}

/** Smart content renderer — detects format and renders appropriately */
function SmartContent({ content, filePath }: { content: string; filePath?: string }) {
  // SVG file or content — render visually
  if ((filePath && isSvgPath(filePath) && isSvgContent(content)) || (!filePath && isSvgContent(content))) {
    return <SvgPreview svg={content} />
  }

  // Image file (non-SVG, base64 encoded)
  if (filePath && isImagePath(filePath)) {
    return (
      <div className="flex items-center justify-center p-4">
        <img
          src={`data:image/*;base64,${content}`}
          alt={filePath}
          className="max-w-full rounded-md"
          onError={(e) => {
            // Fallback: not base64, show as text
            (e.target as HTMLImageElement).style.display = "none"
          }}
        />
      </div>
    )
  }

  // If filePath has a known code extension, render as code directly (skip content detection
  // which can misidentify e.g. Python # comments as Markdown headers)
  if (filePath && !(/\.(md|html?|diff|patch)$/i.test(filePath))) {
    const lang = langFromPath(filePath)
    if (lang) {
      return <CodeBlock language={lang}>{content}</CodeBlock>
    }
  }

  // HTML content
  if (isHtml(content)) {
    return <HtmlPreview html={content} />
  }

  // Diff content — check before markdown since `-` lines trigger bullet detection
  if ((filePath && /\.(diff|patch)$/i.test(filePath)) || isDiff(content)) {
    return <DiffView content={content} />
  }

  // Markdown content (for .md files or detected markdown)
  if ((filePath && /\.md$/i.test(filePath)) || isMarkdown(content)) {
    return <MarkdownPreview markdown={content} />
  }

  // Default: code block with syntax highlighting
  const lang = filePath ? langFromPath(filePath) : undefined
  return <CodeBlock language={lang}>{content}</CodeBlock>
}

function renderContent(artifact: Artifact) {
  const { toolName, input, result } = artifact
  const filePath = input.file_path as string | undefined

  if (toolName === "Edit") {
    const oldStr = input.old_string as string | undefined
    const newStr = input.new_string as string | undefined
    return (
      <div className="space-y-4">
        {filePath && (
          <div className="text-xs text-muted-foreground font-mono">{filePath}</div>
        )}
        {oldStr && (
          <div>
            <div className="text-[11px] text-destructive font-semibold uppercase tracking-[0.05em] mb-1.5">- removed</div>
            <pre className="rounded-md bg-destructive/5 p-3 text-[13px] text-foreground font-mono leading-relaxed overflow-auto whitespace-pre-wrap break-all max-h-[calc(100vh-120px)]">
              {oldStr}
            </pre>
          </div>
        )}
        {newStr && (
          <div>
            <div className="text-[11px] text-success font-semibold uppercase tracking-[0.05em] mb-1.5">+ added</div>
            <pre className="rounded-md bg-success/5 p-3 text-[13px] text-foreground font-mono leading-relaxed overflow-auto whitespace-pre-wrap break-all max-h-[calc(100vh-120px)]">
              {newStr}
            </pre>
          </div>
        )}
      </div>
    )
  }

  if (toolName === "Write") {
    const content = String(input.content ?? "")
    return (
      <div className="space-y-3">
        {filePath && (
          <div className="text-xs text-muted-foreground font-mono">{filePath}</div>
        )}
        <SmartContent content={content} filePath={filePath} />
      </div>
    )
  }

  if (toolName === "Bash") {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[11px] text-amber-600 font-semibold uppercase tracking-[0.05em] mb-1.5">$ command</div>
          <pre className="rounded-md bg-secondary p-3 text-[13px] text-foreground font-mono leading-relaxed overflow-auto whitespace-pre-wrap break-all">
            {String(input.command ?? "")}
          </pre>
        </div>
        {result != null && (
          <div>
            <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-[0.05em] mb-1.5">output</div>
            <SmartContent content={extractText(result)} />
          </div>
        )}
      </div>
    )
  }

  // Read / Glob / Grep / other tools
  const rawText = result != null ? extractText(result) : null
  const resultStr = rawText != null && toolName === "Read"
    ? stripLineNumbers(rawText)
    : rawText

  return (
    <div className="space-y-3">
      {filePath && (
        <div className="text-xs text-muted-foreground font-mono">{filePath}</div>
      )}
      {input.pattern != null && (
        <div className="text-xs text-muted-foreground font-mono">pattern: {String(input.pattern)}</div>
      )}
      {resultStr != null ? (
        <SmartContent content={resultStr} filePath={filePath} />
      ) : (
        <div className="text-sm text-muted-foreground italic">No output</div>
      )}
    </div>
  )
}

export const ArtifactPanel = memo(function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  if (!artifact) {
    return (
      <div className="w-10 bg-slate-50 shrink-0 flex flex-col items-center pt-4 border-l border-slate-200">
        <PanelRightClose className="h-4 w-4 text-slate-300" />
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[#f4f5f5] flex flex-col border-l border-slate-200">
      {/* Tab header */}
      <div className="flex h-10 border-b border-slate-200 bg-slate-50">
        <div className="px-4 flex items-center gap-2 border-r border-slate-200 bg-white text-sm font-semibold text-foreground shadow-[0_2px_0_0_white]">
          <ToolIcon toolName={artifact.toolName} />
          <span className="truncate max-w-[200px]">{renderTitle(artifact)}</span>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-none text-slate-400 hover:text-slate-600 hover:bg-slate-100" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        {renderContent(artifact)}
      </ScrollArea>
    </div>
  )
})
