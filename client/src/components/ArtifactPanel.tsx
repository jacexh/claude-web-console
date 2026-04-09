import { memo, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { X, FileCode, Terminal, Pencil, PanelRightClose, Maximize2, Minimize2 } from "lucide-react"
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
  return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(path)
}

/** Render HTML content in a sandboxed iframe with fullscreen toggle */
function HtmlPreview({ html }: { html: string }) {
  const [fullscreen, setFullscreen] = useState(false)
  const srcDoc = useMemo(() => html, [html])

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
        <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] rounded-xl overflow-hidden bg-white shadow-2xl">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFullscreen(false)}
            className="absolute top-3 right-3 z-10 h-8 w-8 bg-white/80 hover:bg-white shadow-md rounded-lg"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <iframe
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="w-full h-full bg-white"
            style={{ border: "none" }}
            title="HTML Preview"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setFullscreen(true)}
        className="absolute top-2 right-2 z-10 h-7 w-7 bg-white/70 hover:bg-white shadow-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full rounded-md bg-white"
        style={{ border: "none", height: "calc(100vh - 7rem)" }}
        title="HTML Preview"
      />
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
  // Image file
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
