import { useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Zap, ChevronsLeft, HelpCircle, Settings, ChevronLeft, ChevronRight, Search, Square, Pencil } from "lucide-react"
import type { SessionInfo } from "../types"

const PAGE_SIZE = 20

interface SessionListProps {
  sessions: SessionInfo[]
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onCreate: () => void
  connected: boolean
  onToggleCollapse: () => void
  onClose: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
}

/** Group sessions by date bucket (already sorted by time) */
function groupByDate(sessions: SessionInfo[]): { label: string; items: SessionInfo[] }[] {
  const now = Date.now()
  const today: SessionInfo[] = []
  const yesterday: SessionInfo[] = []
  const older: SessionInfo[] = []

  for (const s of sessions) {
    const diff = now - s.lastModified
    if (diff < 86_400_000) today.push(s)
    else if (diff < 172_800_000) yesterday.push(s)
    else older.push(s)
  }

  const groups: { label: string; items: SessionInfo[] }[] = []
  if (today.length) groups.push({ label: "Today", items: today })
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday })
  if (older.length) groups.push({ label: "Earlier", items: older })
  return groups
}

export function SessionList({ sessions, activeSessionId, onSelect, onCreate, connected, onToggleCollapse, onClose, onRename }: SessionListProps) {
  const [page, setPage] = useState(0)
  const [jumpId, setJumpId] = useState("")
  const [showJump, setShowJump] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Sort by lastModified descending
  const sorted = [...sessions].sort((a, b) => b.lastModified - a.lastModified)

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const groups = groupByDate(paged)

  const handleJump = () => {
    const id = jumpId.trim()
    if (!id) return
    // Match by prefix
    const match = sessions.find((s) => s.sessionId.startsWith(id))
    if (match) {
      onSelect(match.sessionId)
      setJumpId("")
      setShowJump(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-white border-r border-slate-200">
      {/* Sidebar header */}
      <div className="h-14 flex items-center px-4 border-b border-slate-100 justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary-container rounded text-primary flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-700">Claude Code</span>
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full ml-1",
              connected ? "bg-success" : "bg-destructive"
            )}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
        <button className="text-slate-400 hover:text-slate-600" onClick={onToggleCollapse}>
          <ChevronsLeft className="w-5 h-5" />
        </button>
      </div>

      {/* New Session + Jump */}
      <div className="px-4 pt-4 pb-2 space-y-2">
        <Button
          onClick={onCreate}
          className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="h-5 w-5" />
          New Session
        </Button>

        {/* Jump to session */}
        {showJump ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={jumpId}
              onChange={(e) => setJumpId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJump(); if (e.key === "Escape") setShowJump(false) }}
              placeholder="Session ID..."
              autoFocus
              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground outline-none placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleJump}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-xs font-medium transition-colors"
            >
              Go
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowJump(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Jump to session...
          </button>
        )}
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        {paged.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-[11px] text-slate-400">No sessions yet</p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {group.label}
            </div>
            <div className="flex flex-col px-2 gap-1">
              {group.items.map((session) => {
                const isActive = session.sessionId === activeSessionId
                const isEditing = editingId === session.sessionId
                return (
                  <div
                    key={session.sessionId}
                    onClick={() => !isEditing && onSelect(session.sessionId)}
                    className={cn(
                      "px-3 py-2 rounded-lg cursor-pointer transition-colors group relative",
                      isActive
                        ? "bg-[#eef3fc]"
                        : "hover:bg-slate-50"
                    )}
                  >
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        defaultValue={session.summary}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = e.currentTarget.value.trim()
                            if (val) onRename(session.sessionId, val)
                            setEditingId(null)
                          } else if (e.key === 'Escape') {
                            setEditingId(null)
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.currentTarget.value.trim()
                          if (val) onRename(session.sessionId, val)
                          setEditingId(null)
                        }}
                        className="w-full text-sm font-medium bg-white border border-primary rounded px-1.5 py-0.5 outline-none text-slate-700 focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <div className={cn(
                        "text-sm font-medium truncate pr-6",
                        isActive ? "text-primary" : "text-slate-700"
                      )}>
                        {session.summary}
                      </div>
                    )}
                    <div className={cn(
                      "text-xs font-mono mt-0.5 flex items-center gap-1",
                      isActive ? "text-primary/60" : "text-slate-400"
                    )}>
                      {session.status === "running" && (
                        <span className="inline-block h-1 w-1 rounded-full bg-success animate-pulse" />
                      )}
                      ID: {session.sessionId.slice(0, 8)}
                    </div>
                    {!isEditing && session.status !== 'running' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingId(session.sessionId)
                          setEditTitle(session.summary)
                        }}
                        className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-primary hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Rename session"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {!isEditing && session.status === 'running' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onClose(session.sessionId) }}
                        className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Stop session process"
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </ScrollArea>

      {/* Footer with pagination */}
      <div className="p-4 border-t border-slate-100 bg-white">
        {/* Pagination controls */}
        <div className="flex items-center justify-between text-sm text-slate-500 mb-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center text-xs text-slate-400 mb-3">
          Showing {paged.length} of {sessions.length} sessions
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <button className="hover:text-slate-600">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="hover:text-slate-600">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
