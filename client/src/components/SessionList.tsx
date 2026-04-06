import { useState, useRef, useMemo, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Zap, ChevronsLeft, HelpCircle, Settings, ChevronLeft, ChevronRight, Search, Square, Pencil, FolderOpen } from "lucide-react"
import type { SessionInfo } from "../types"

const PAGE_SIZE = 20
const PROJECT_STORAGE_KEY = "cc-web-console:selectedProject"

interface SessionListProps {
  sessions: SessionInfo[]
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onCreate: (projectCwd?: string) => void
  connected: boolean
  onToggleCollapse: () => void
  onClose: (sessionId: string) => void
  onRename: (sessionId: string, title: string) => void
  defaultCwd: string
  onOpenDirectory: () => void
}

/** Extract the last directory name from a path for display */
function projectName(cwd: string): string {
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

interface ProjectInfo {
  cwd: string
  label: string
  sessionCount: number
  runningCount: number
  lastActive: number
}

function deriveProjects(sessions: SessionInfo[]): ProjectInfo[] {
  const map = new Map<string, SessionInfo[]>()
  for (const s of sessions) {
    const key = s.cwd || 'Unknown'
    const arr = map.get(key)
    if (arr) arr.push(s)
    else map.set(key, [s])
  }
  return Array.from(map.entries())
    .map(([cwd, items]) => ({
      cwd,
      label: projectName(cwd),
      sessionCount: items.length,
      runningCount: items.filter(s => s.status === 'running').length,
      lastActive: Math.max(...items.map(s => s.lastModified)),
    }))
    .sort((a, b) => b.lastActive - a.lastActive)
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function SessionList({ sessions, activeSessionId, onSelect, onCreate, connected, onToggleCollapse, onClose, onRename, defaultCwd, onOpenDirectory }: SessionListProps) {
  const [page, setPage] = useState(0)
  const [jumpId, setJumpId] = useState("")
  const [showJump, setShowJump] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const [selectedProject, setSelectedProject] = useState<string | null>(() => {
    return localStorage.getItem(PROJECT_STORAGE_KEY)
  })

  const projects = useMemo(() => deriveProjects(sessions), [sessions])

  // Validate persisted project still exists
  useEffect(() => {
    if (selectedProject && projects.length > 0 && !projects.some(p => p.cwd === selectedProject)) {
      setSelectedProject(null)
      localStorage.removeItem(PROJECT_STORAGE_KEY)
    }
  }, [selectedProject, projects])

  // Auto-switch project when active session changes (e.g. after fork/create)
  useEffect(() => {
    if (activeSessionId) {
      const activeSession = sessions.find(s => s.sessionId === activeSessionId)
      if (activeSession?.cwd && activeSession.cwd !== selectedProject) {
        selectProject(activeSession.cwd)
      }
    }
  }, [activeSessionId, sessions])

  const selectProject = (cwd: string | null) => {
    setSelectedProject(cwd)
    if (cwd) localStorage.setItem(PROJECT_STORAGE_KEY, cwd)
    else localStorage.removeItem(PROJECT_STORAGE_KEY)
    setPage(0)
  }

  // Filtered sessions for Mode B
  const filteredSessions = useMemo(() => {
    if (!selectedProject) return []
    return sessions
      .filter(s => (s.cwd || 'Unknown') === selectedProject)
      .sort((a, b) => b.lastModified - a.lastModified)
  }, [sessions, selectedProject])

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE))
  const pagedSessions = filteredSessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleJump = () => {
    const id = jumpId.trim()
    if (!id) return
    const searchScope = selectedProject
      ? sessions.filter(s => (s.cwd || 'Unknown') === selectedProject)
      : sessions
    const match = searchScope.find((s) => s.sessionId.startsWith(id))
    if (match) {
      if (!selectedProject && match.cwd) {
        selectProject(match.cwd)
      }
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

      {selectedProject === null ? (
        /* ===== Mode A: Project Picker ===== */
        <>
          <ScrollArea className="flex-1">
            {projects.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <FolderOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 mb-1">No projects yet</p>
                <p className="text-[11px] text-slate-400">Create a new session to get started</p>
              </div>
            ) : (
              <div className="flex flex-col px-2 py-2 gap-1">
                {projects.map((project) => (
                  <button
                    key={project.cwd}
                    onClick={() => selectProject(project.cwd)}
                    className="w-full px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                    title={project.cwd}
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-primary transition-colors" />
                      <span className="text-sm font-medium text-slate-700 truncate">{project.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-slate-400">
                      <span>{project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}</span>
                      {project.runningCount > 0 && (
                        <span className="text-success">{project.runningCount} active</span>
                      )}
                      <span className="ml-auto">{formatRelativeTime(project.lastActive)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer: Open Directory */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <Button
              onClick={onOpenDirectory}
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm"
            >
              <Plus className="h-5 w-5" />
              New Session
            </Button>
            <div className="flex items-center justify-between text-slate-400 mt-3">
              <button className="hover:text-slate-600">
                <HelpCircle className="w-5 h-5" />
              </button>
              <button className="hover:text-slate-600">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ===== Mode B: Session List (filtered by project) ===== */
        <>
          {/* Project header + New Session */}
          <div className="px-4 pt-3 pb-2">
            <button
              onClick={() => selectProject(null)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-2 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              All Projects
            </button>
            <div className="flex items-center gap-2" title={selectedProject}>
              <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
              <span className="text-sm font-semibold text-slate-700 truncate">
                {projectName(selectedProject)}
              </span>
            </div>
          </div>

          <div className="px-4 pb-2 space-y-2">
            <Button
              onClick={() => onCreate(selectedProject)}
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
            {pagedSessions.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="text-[11px] text-slate-400">No sessions in this project</p>
              </div>
            )}

            <div className="flex flex-col px-2 gap-1">
              {pagedSessions.map((session) => {
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
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                        onFocus={(e) => e.target.select()}
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
                      ID: <span
                        className="cursor-pointer hover:underline"
                        title={`Click to copy: ${session.sessionId}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(session.sessionId)
                        }}
                      >{session.sessionId.slice(0, 8)}</span>
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
          </ScrollArea>

          {/* Footer with pagination */}
          <div className="p-4 border-t border-slate-100 bg-white">
            {filteredSessions.length > PAGE_SIZE && (
              <>
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
                  Showing {pagedSessions.length} of {filteredSessions.length} sessions
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-slate-400">
              <button className="hover:text-slate-600">
                <HelpCircle className="w-5 h-5" />
              </button>
              <button className="hover:text-slate-600">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
