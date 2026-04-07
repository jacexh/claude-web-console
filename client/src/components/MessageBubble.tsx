import { memo, useState } from "react"
import { Bot, TerminalSquare, Bell, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import { stripSystemTags } from "@/lib/strip-system-tags"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import { CodeBlock } from "./CodeBlock"
import { MermaidDiagram } from "./MermaidDiagram"

interface MessageBubbleProps {
  role: "user" | "assistant"
  content: string
}

interface ParsedContent {
  text: string
  command: string | null
  stdout: string | null
  taskNotification: { taskId: string; status: string; summary: string } | null
}

/** Strip XML tags and return structured parts */
function parseUserContent(raw: string): ParsedContent {
  let text = raw
  let command: string | null = null
  let stdout: string | null = null
  let taskNotification: ParsedContent["taskNotification"] = null

  // Parse task-notification
  const taskMatch = text.match(/<task-notification>([\s\S]*?)<\/task-notification>/)
  if (taskMatch) {
    const block = taskMatch[1]
    const taskId = block.match(/<task-id>(.*?)<\/task-id>/)?.[1] ?? ""
    const status = block.match(/<status>(.*?)<\/status>/)?.[1] ?? ""
    const summary = block.match(/<summary>(.*?)<\/summary>/)?.[1] ?? ""
    taskNotification = { taskId, status, summary }
    text = text.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "").trim()
  }

  // Parse command
  const cmdMatch = text.match(/<command-name>(.*?)<\/command-name>/)
  if (cmdMatch) {
    command = cmdMatch[1]
    text = text
      .replace(/<command-name>.*?<\/command-name>/g, "")
      .trim()
  }

  // Parse stdout
  const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)
  if (stdoutMatch) {
    stdout = stdoutMatch[1].trim()
    text = text.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "").trim()
  }

  // Strip SDK-injected system tags + orphaned command/local tags
  text = stripSystemTags(text)
  text = text
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, "")
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
    .replace(/<tool-use-id>[\s\S]*?<\/tool-use-id>/g, "")
    .replace(/<output-file>[\s\S]*?<\/output-file>/g, "")
    .trim()

  return { text, command, stdout, taskNotification }
}

function TaskNotificationBadge({ taskId, status, summary }: { taskId: string; status: string; summary: string }) {
  const isFailed = status === "failed"
  return (
    <div className="ml-10 my-2">
      <div className={`inline-flex items-center gap-3 rounded-lg px-4 py-2.5 border shadow-soft ${
        isFailed
          ? "bg-[#fef2f2] border-[#f5c6c6]"
          : "bg-[#f0faf0] border-[#c6e6c6]"
      }`}>
        {isFailed ? (
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        ) : (
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">task/{taskId.slice(0, 8)}</span>
            <span className={`text-xs font-medium ${isFailed ? "text-red-700" : "text-emerald-700"}`}>
              {status}
            </span>
          </div>
          {summary && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">{summary}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({ role, content }: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false)

  if (role === "user") {
    const { text, command, stdout, taskNotification } = parseUserContent(content)
    const hasCommand = command != null
    const isLong = text.length > 300

    // Pure task notification, no other content
    if (taskNotification && !text && !hasCommand) {
      return <TaskNotificationBadge {...taskNotification} />
    }

    // Pure command
    if (hasCommand && !text) {
      return (
        <div className="flex flex-col items-end gap-2 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Command</span>
            <div className="bg-slate-100 text-foreground font-mono text-sm px-3 py-1.5 rounded-md border border-slate-200">
              {command}
            </div>
          </div>
          {stdout && stdout !== "(no content)" && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg max-w-2xl w-full overflow-hidden shadow-ambient">
              <div className="bg-slate-200 px-3 py-1.5 text-xs text-slate-600 font-semibold border-b border-slate-200">
                stdout
              </div>
              <div className="p-3 font-mono text-sm text-foreground overflow-x-auto whitespace-pre-wrap">
                {stdout}
              </div>
            </div>
          )}
        </div>
      )
    }

    const displayText = isLong && !expanded ? text.slice(0, 200) + '…' : text

    return (
      <div className="flex flex-col items-end gap-2 py-2">
        {taskNotification && <TaskNotificationBadge {...taskNotification} />}
        {hasCommand && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Command</span>
            <div className="bg-slate-100 text-foreground font-mono text-sm px-3 py-1.5 rounded-md border border-slate-200">
              {command}
            </div>
          </div>
        )}
        {text && (
          <div className="max-w-[75%] rounded-2xl rounded-br-md bg-slate-100 border border-slate-200 px-4 py-3 shadow-ambient">
            <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">{displayText}</div>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 mt-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Collapse' : 'Show more'}
              </button>
            )}
          </div>
        )}
        {stdout && stdout !== "(no content)" && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg max-w-2xl w-full overflow-hidden shadow-ambient">
            <div className="bg-slate-200 px-3 py-1.5 text-xs text-slate-600 font-semibold border-b border-slate-200">
              stdout
            </div>
            <div className="p-3 font-mono text-sm text-foreground overflow-x-auto whitespace-pre-wrap">
              {stdout}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex gap-4 max-w-4xl py-3">
      {/* Avatar */}
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary">
        <Bot className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-3 mt-2">
        <div className="prose-custom text-[15px] leading-relaxed text-slate-700">
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
          >{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
})
