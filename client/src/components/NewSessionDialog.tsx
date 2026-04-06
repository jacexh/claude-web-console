import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Folder, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ModelInfo } from "../types"

interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

interface NewSessionDialogProps {
  open: boolean
  defaultCwd: string
  projectCwd: string | null
  availableModels: ModelInfo[]
  onConfirm: (cwd: string, model?: string, permissionMode?: string, executableArgs?: string[], env?: Record<string, string>) => void
  onCancel: () => void
  onRequestFiles: (prefix: string) => void
  fileList: FileEntry[]
}

const STORAGE_KEY = "cc-web-console:lastCwd"

export function NewSessionDialog({
  open,
  defaultCwd,
  projectCwd,
  availableModels,
  onConfirm,
  onCancel,
  onRequestFiles,
  fileList,
}: NewSessionDialogProps) {
  const [value, setValue] = useState("")
  const [selectedModel, setSelectedModel] = useState("")
  const [permissionMode, setPermissionMode] = useState("")
  const [argsText, setArgsText] = useState("")
  const [envText, setEnvText] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Only show directories in suggestions
  const dirEntries = fileList.filter((f) => f.isDir)

  const cwdLocked = projectCwd !== null

  // Initialize value when dialog opens
  useEffect(() => {
    if (open) {
      if (projectCwd) {
        setValue(projectCwd)
      } else {
        const saved = localStorage.getItem(STORAGE_KEY)
        setValue(saved || defaultCwd)
      }
      setSelectedModel("")
      setPermissionMode("")
      setArgsText("")
      setEnvText("")
      setShowSuggestions(false)
      setSelectedIndex(0)
      // Focus input after mount
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, defaultCwd, projectCwd])

  // Request directory listing when value changes (skip when cwd is locked)
  useEffect(() => {
    if (open && value && !cwdLocked) {
      onRequestFiles(value)
    }
  }, [open, value, cwdLocked, onRequestFiles])

  const handleConfirm = useCallback(() => {
    const cwd = value.trim() || defaultCwd
    localStorage.setItem(STORAGE_KEY, cwd)
    const args = argsText.trim() ? argsText.trim().split(/\s+/) : undefined
    const env = envText.trim()
      ? Object.fromEntries(
          envText.trim().split("\n").filter(Boolean).map((line) => {
            const idx = line.indexOf("=")
            return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] : null
          }).filter((e): e is [string, string] => e !== null),
        )
      : undefined
    onConfirm(cwd, selectedModel || undefined, permissionMode || undefined, args, env)
  }, [value, defaultCwd, selectedModel, permissionMode, argsText, envText, onConfirm])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (showSuggestions) {
        setShowSuggestions(false)
      } else {
        onCancel()
      }
      return
    }
    if (e.key === "Enter") {
      if (showSuggestions && dirEntries.length > 0) {
        const selected = dirEntries[selectedIndex]
        setValue(selected.path)
        setShowSuggestions(false)
        setSelectedIndex(0)
      } else {
        handleConfirm()
      }
      return
    }
    if (!showSuggestions) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, dirEntries.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }
  }

  // Scroll active suggestion into view
  useEffect(() => {
    const active = listRef.current?.querySelector("[data-active=true]")
    active?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 rounded-xl glass shadow-ambient p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">New Session</h2>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-xs text-muted-foreground mb-2">
          Working Directory
        </label>

        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              if (cwdLocked) return
              setValue(e.target.value)
              setShowSuggestions(true)
              setSelectedIndex(0)
            }}
            onFocus={() => { if (!cwdLocked) setShowSuggestions(true) }}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 150)
            }}
            onKeyDown={cwdLocked ? undefined : handleKeyDown}
            readOnly={cwdLocked}
            placeholder={defaultCwd}
            className={cn(
              "w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none",
              cwdLocked
                ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-surface-high/50 border-border text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary"
            )}
          />

          {/* Autocomplete dropdown */}
          {!cwdLocked && showSuggestions && dirEntries.length > 0 && (
            <div
              ref={listRef}
              className="absolute top-full left-0 right-0 mt-1 max-h-[200px] overflow-auto rounded-lg glass shadow-ambient z-10"
            >
              {dirEntries.map((entry, i) => (
                <div
                  key={entry.path}
                  data-active={i === selectedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setValue(entry.path)
                    setShowSuggestions(false)
                    setSelectedIndex(0)
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm",
                    i === selectedIndex
                      ? "bg-surface-high/60"
                      : "hover:bg-surface-high/30"
                  )}
                >
                  {entry.isDir ? (
                    <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-mono text-foreground truncate">
                    {entry.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {availableModels.length > 0 && (
          <>
            <label className="block text-xs text-muted-foreground mb-2 mt-4">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high/50 border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Auto (use account default)</option>
              {availableModels.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="block text-xs text-muted-foreground mb-2 mt-4">
          Permission Mode
        </label>
        <select
          value={permissionMode}
          onChange={(e) => setPermissionMode(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-surface-high/50 border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">default</option>
          <option value="auto">auto — fully autonomous</option>
          <option value="acceptEdits">acceptEdits — auto-accept file edits</option>
          <option value="plan">plan — planning only, no execution</option>
          <option value="bypassPermissions">bypassPermissions — skip all checks</option>
          <option value="dontAsk">dontAsk — deny if not pre-approved</option>
        </select>

        <label className="block text-xs text-muted-foreground mb-2 mt-4">
          Extra Arguments
        </label>
        <input
          type="text"
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          placeholder="e.g. --system-prompt 'Be concise'"
          className="w-full px-3 py-2 rounded-lg bg-surface-high/50 border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <label className="block text-xs text-muted-foreground mb-2 mt-4">
          Environment Variables
        </label>
        <textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={"KEY=value\nANOTHER_KEY=value"}
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-surface-high/50 border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />

        <div className="flex justify-end gap-2 mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="bg-primary text-white hover:bg-primary/90"
          >
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}
