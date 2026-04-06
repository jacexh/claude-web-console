import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, MessageSquare, Terminal, ArrowUp, HelpCircle, Pencil, GitBranch } from "lucide-react"
import { MessageBubble } from "./MessageBubble"
import { EventCard } from "./EventCard"
import { QuestionCard } from "./QuestionCard"
import { SubAgentCard } from "./SubAgentCard"
import { ElicitationCard } from "./ElicitationCard"
import { CommandMenu, filterCommands } from "./CommandMenu"
import { FileMention, type FileEntry } from "./FileMention"
import { StatusBar, type SessionStatusInfo } from "./StatusBar"
import type { ChatItem, ModelInfo, EffortLevel } from "../types"

interface ChatPanelProps {
  messages: ChatItem[]
  history: ChatItem[]
  loading: boolean
  onSend: (content: string) => void
  onPermissionDecision: (toolUseId: string, approved: boolean, alwaysAllow?: boolean) => void
  onSelectArtifact: (toolName: string, input: Record<string, unknown>, result?: unknown) => void
  activeSessionId: string | null
  activeSessionSummary?: string
  sessionRunning: boolean
  onResume: (sessionId: string) => void
  sessionStatus: SessionStatusInfo
  availableModels: ModelInfo[]
  onSetModel: (model: string) => void
  fileList: FileEntry[]
  onRequestFiles: (prefix: string) => void
  commandList?: { name: string; description: string }[]
  onRename?: (sessionId: string, title: string) => void
  onFork?: (sessionId: string, upToMessageId: string) => void
  effortLevel?: EffortLevel
  onSetEffortLevel?: (level: EffortLevel) => void
  subagentMessages?: Record<string, ChatItem[]>
  onGetSubagentMessages?: (sessionId: string, agentId: string) => void
  onElicitationResponse?: (id: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown>) => void
  onOpenSettings?: () => void
}

/** Extract a /command being typed (after space or at start) */
function getSlashCommand(text: string): { prefix: string; start: number } | null {
  const match = text.match(/(^|\s)(\/[^\s]*)$/)
  if (!match) return null
  return { prefix: match[2], start: match.index! + match[1].length }
}

/** Extract the @mention being typed at the cursor position */
function getAtMention(text: string): { prefix: string; start: number } | null {
  const match = text.match(/@([^\s]*)$/)
  if (!match) return null
  return { prefix: match[1], start: match.index! }
}

export function ChatPanel({ messages, history, loading, onSend, onPermissionDecision, onSelectArtifact, activeSessionId, activeSessionSummary, sessionRunning, onResume, sessionStatus, availableModels, onSetModel, fileList, onRequestFiles, commandList, onRename, onFork, effortLevel, onSetEffortLevel, subagentMessages, onGetSubagentMessages, onElicitationResponse, onOpenSettings }: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [menuIndex, setMenuIndex] = useState(0)
  const [fileMenuIndex, setFileMenuIndex] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slashCmd = getSlashCommand(input)
  const showCmdMenu = slashCmd != null
  const menuItems = showCmdMenu ? filterCommands(slashCmd.prefix, commandList) : []

  const atMention = !showCmdMenu ? getAtMention(input) : null
  const showFileMenu = atMention != null && fileList.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    setMenuIndex(0)
    setFileMenuIndex(0)
  }, [input])

  // Request file suggestions when @ is typed
  useEffect(() => {
    if (atMention) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onRequestFiles(atMention.prefix)
      }, 150)
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [atMention?.prefix, onRequestFiles])

  const selectCommand = (cmd: string) => {
    if (!slashCmd) return
    const before = input.slice(0, slashCmd.start)
    setInput(before + cmd + " ")
  }

  const selectFile = (path: string) => {
    if (!atMention) return
    const before = input.slice(0, atMention.start)
    setInput(before + "@" + path + " ")
  }

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || !activeSessionId) return
    onSend(trimmed)
    setInput("")
    // Reset textarea height after send
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Command menu navigation
    if (showCmdMenu && menuItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMenuIndex((i) => (i + 1) % menuItems.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length)
        return
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        selectCommand(menuItems[menuIndex].name)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        if (slashCmd) setInput(input.slice(0, slashCmd.start))
        return
      }
    }

    // File mention navigation
    if (showFileMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setFileMenuIndex((i) => (i + 1) % fileList.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setFileMenuIndex((i) => (i - 1 + fileList.length) % fileList.length)
        return
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        selectFile(fileList[fileMenuIndex].path)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        if (atMention) setInput(input.slice(0, atMention.start))
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const renderChatItem = useCallback((item: ChatItem) => {
    switch (item.type) {
      case "user":
        return <MessageBubble key={item.id} role="user" content={item.content as string} />
      case "assistant":
        return (
          <div key={item.id} className="relative group">
            <MessageBubble role="assistant" content={item.content as string} />
            {onFork && item.uuid && activeSessionId && (
              <button
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 cursor-pointer"
                onClick={() => onFork(activeSessionId, item.uuid!)}
                title="Fork from here"
              >
                <GitBranch size={14} className="text-slate-500" />
              </button>
            )}
          </div>
        )
      case "tool_use": {
        const data = item.content as {
          name: string
          input: Record<string, unknown>
          result?: unknown
          permission?: { status: 'pending' | 'approved' | 'denied'; title?: string; description?: string; hasSuggestions?: boolean }
        }
        if (data.name === "AskUserQuestion") {
          return (
            <QuestionCard
              key={item.id}
              input={data.input}
              answered={data.result != null}
              onAnswer={(answer) => {
                // Resolve the pending canUseTool permission so SDK continues
                onPermissionDecision(item.id, true)
                // Send the answer as next message for Claude to process
                onSend(answer)
              }}
            />
          )
        }
        if (data.name === 'Agent' && item.agentId && activeSessionId && onGetSubagentMessages) {
          const toolInput = item.toolInput ?? data.input
          const agentName = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type : undefined
          const promptStr = typeof toolInput.prompt === 'string' ? toolInput.prompt : undefined
          const descriptionStr = typeof toolInput.description === 'string' ? toolInput.description : undefined
          const description = descriptionStr ?? (promptStr ? promptStr.split('\n')[0] : undefined) ?? data.name
          const hasResult = data.result != null
          const isError = Array.isArray(data.result) &&
            (data.result as Array<{ type: string; is_error?: boolean }>).some(b => b.is_error === true)
          const status: 'running' | 'done' | 'error' = isError ? 'error' : hasResult ? 'done' : sessionRunning ? 'running' : 'done'
          const resultContent = data.result
          let resultText: string | undefined
          if (resultContent != null) {
            if (typeof resultContent === 'string') {
              resultText = resultContent
            } else if (Array.isArray(resultContent)) {
              const textBlock = (resultContent as Array<{ type: string; text?: string }>).find(b => b.type === 'text')
              if (textBlock?.text) resultText = textBlock.text
            }
          }
          return (
            <SubAgentCard
              key={item.id}
              agentId={item.agentId}
              sessionId={activeSessionId}
              agentName={agentName}
              description={description}
              status={status}
              resultPreview={resultText ? resultText.slice(0, 120) : undefined}
              resultText={resultText}
              subagentMessages={subagentMessages?.[`${activeSessionId}:${item.agentId}`]}
              allSubagentMessages={subagentMessages}
              onExpand={onGetSubagentMessages}
              onSelectArtifact={onSelectArtifact}
            />
          )
        }
        return (
          <EventCard
            key={item.id}
            toolUseId={item.id}
            toolName={data.name}
            input={data.input}
            result={data.result}
            permission={data.permission}
            onPermissionDecision={onPermissionDecision}
            onSelect={() => onSelectArtifact(data.name, data.input, data.result)}
          />
        )
      }
      case "system": {
        const data = item.content as { command?: string }
        if (data.command) {
          return (
            <div key={item.id} className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs font-mono text-slate-400 bg-white px-2">
                {data.command} sent
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )
        }
        return null
      }
      case "elicitation": {
        if (!onElicitationResponse) return null
        return (
          <ElicitationCard
            key={item.id}
            id={item.id}
            serverName={item.serverName ?? ''}
            message={item.elicitationMessage ?? ''}
            mode={item.mode}
            requestedSchema={item.requestedSchema}
            url={item.url}
            resolved={item.resolved}
            resolvedAction={item.resolvedAction}
            onResponse={onElicitationResponse}
          />
        )
      }
      default:
        return null
    }
  }, [onPermissionDecision, onSend, onSelectArtifact, onFork, activeSessionId, sessionRunning, subagentMessages, onGetSubagentMessages, onElicitationResponse])

  const renderedHistory = useMemo(() => history.map(renderChatItem), [history, renderChatItem])
  const renderedMessages = useMemo(() => messages.map(renderChatItem), [messages, renderChatItem])

  if (!activeSessionId) {
    return (
      <div className="h-full flex items-center justify-center min-w-0 bg-white">
        <div className="flex flex-col items-center gap-5 text-center px-8">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-soft">
            <MessageSquare className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="text-xl font-semibold text-foreground tracking-[-0.02em]">Claude Web Console</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-[300px] leading-relaxed">
              Select a session from the sidebar or create a new one to get started
            </p>
          </div>
          <a
            href="https://github.com/jacexh/talgent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-4"
          >
            github.com/jacexh/talgent
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-w-0 bg-white relative overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-slate-100 flex items-center justify-between px-6 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-muted-foreground">
            <Terminal className="w-4 h-4" />
          </div>
          {editingTitle ? (
            <input
              type="text"
              value={titleInput}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = titleInput.trim()
                  if (val && activeSessionId && onRename) onRename(activeSessionId, val)
                  setEditingTitle(false)
                } else if (e.key === 'Escape') {
                  setEditingTitle(false)
                }
              }}
              onBlur={() => {
                const val = titleInput.trim()
                if (val && activeSessionId && onRename) onRename(activeSessionId, val)
                setEditingTitle(false)
              }}
              className="text-base font-semibold bg-white border-b border-primary outline-none text-foreground min-w-[120px]"
            />
          ) : (
            <div className="flex items-center gap-1 group/title">
              <h1
                className="text-base font-semibold text-foreground border-b border-dashed border-slate-400 cursor-pointer hover:border-primary hover:text-primary transition-colors"
                onClick={() => {
                  setEditingTitle(true)
                  setTitleInput(activeSessionSummary || "Untitled")
                }}
              >
                {activeSessionSummary || "Untitled"}
              </h1>
              <button
                className="text-slate-300 hover:text-primary opacity-0 group-hover/title:opacity-100 transition-opacity"
                title="Rename session"
                onClick={() => {
                  setEditingTitle(true)
                  setTitleInput(activeSessionSummary || "Untitled")
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
            sessionRunning
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-400"
          )}>
            {sessionRunning ? "running" : "idle"}
          </span>
          <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded">
            ID: {activeSessionId}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-slate-400 hover:text-slate-600">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Chat area */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6 pb-32">
          {history.length > 0 && (
            <>
              {renderedHistory}
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs font-semibold tracking-wider uppercase text-slate-400 bg-white px-2">
                  previous messages
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            </>
          )}

          {renderedMessages}

          {/* Loading dots */}
          {loading && (
            <div className="flex gap-1 ml-12 py-2">
              <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce [animation-delay:0ms]" />
              <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 rounded-full bg-slate-200 animate-bounce [animation-delay:300ms]" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Bottom input area */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4">
        <div className="max-w-4xl mx-auto">
          {sessionRunning ? (
            <>
              <StatusBar status={sessionStatus} loading={loading} availableModels={availableModels} onSetModel={onSetModel} effortLevel={effortLevel ?? 'medium'} onSetEffortLevel={onSetEffortLevel ?? (() => {})} onOpenSettings={onOpenSettings} />
              <div className="relative">
                {showCmdMenu && menuItems.length > 0 && (
                  <CommandMenu
                    commands={menuItems}
                    selectedIndex={menuIndex}
                    onSelect={selectCommand}
                  />
                )}
                {showFileMenu && (
                  <FileMention
                    files={fileList}
                    selectedIndex={fileMenuIndex}
                    onSelect={selectFile}
                  />
                )}
                <div className={`flex items-end gap-2 border rounded-xl px-4 py-3 bg-white transition-all ${
                  loading
                    ? "border-slate-200"
                    : "border-slate-300 shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
                }`}>
                  <div className="text-slate-400 shrink-0 mb-0.5">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      const ta = e.target
                      ta.style.height = 'auto'
                      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={loading ? "Claude is working..." : "Message Claude…  Type / for commands"}
                    rows={1}
                    disabled={loading}
                    className="flex-1 bg-transparent border-none outline-none text-foreground text-sm font-sans resize-none leading-relaxed placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 p-0"
                    style={{ maxHeight: 200 }}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim() || loading}
                    className="shrink-0 bg-slate-200 text-white rounded-lg p-1.5 disabled:opacity-40 enabled:bg-primary enabled:hover:bg-primary/90 transition-colors"
                  >
                    <ArrowUp className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <button
              onClick={() => activeSessionId && onResume(activeSessionId)}
              className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-colors"
            >
              Resume Session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
