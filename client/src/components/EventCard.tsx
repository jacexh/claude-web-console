import { memo, useState } from "react"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  FileText,
  Terminal,
  Pencil,
  Search,
  FolderSearch,
  Globe,
  Wrench,
  Loader2,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react"
import type { PermissionSuggestion } from "../types"

export interface PermissionState {
  status: 'pending' | 'approved' | 'denied'
  title?: string
  description?: string
  hasSuggestions?: boolean
  suggestions?: PermissionSuggestion[]
}

interface EventCardProps {
  toolUseId?: string
  toolName: string
  input: Record<string, unknown>
  result?: unknown
  display?: 'summarized' | 'omitted'
  systemTags?: string[]
  permission?: PermissionState
  onPermissionDecision?: (toolUseId: string, approved: boolean, alwaysAllow?: boolean, updatedPermissions?: PermissionSuggestion[]) => void
  defaultCollapsed?: boolean
  onSelect?: () => void
}

function shortenPath(p: string): string {
  const parts = p.split("/")
  if (parts.length <= 3) return p
  return ".../" + parts.slice(-2).join("/")
}

function getToolSummary(_toolName: string, input: Record<string, unknown>): string {
  if (typeof input.query === "string" && input.query) return input.query
  if (typeof input.file_path === "string" && input.file_path) return shortenPath(input.file_path)
  if (typeof input.path === "string" && input.path) return shortenPath(input.path)
  if (typeof input.pattern === "string" && input.pattern) return input.pattern
  if (input.description != null) return String(input.description)
  if (input.command != null) {
    const cmd = String(input.command)
    return cmd.length > 80 ? cmd.slice(0, 80) + "…" : cmd
  }
  if (input.prompt != null) {
    const p = String(input.prompt)
    return p.length > 80 ? p.slice(0, 80) + "…" : p
  }
  if (input.skill != null) return String(input.skill)
  return ""
}

const toolMeta: Record<string, { icon: typeof FileText; headerBg: string; bodyBg: string; borderColor: string; textColor: string }> = {
  Bash:    { icon: Terminal,     headerBg: "bg-[#ebd2c1]", bodyBg: "bg-[#f9eae0]", borderColor: "border-[#ebd2c1]", textColor: "text-amber-900" },
  Read:    { icon: FileText,     headerBg: "bg-blue-100",  bodyBg: "bg-blue-50",   borderColor: "border-blue-100",  textColor: "text-blue-800" },
  Write:   { icon: Pencil,       headerBg: "bg-emerald-100", bodyBg: "bg-emerald-50", borderColor: "border-emerald-100", textColor: "text-emerald-800" },
  Edit:    { icon: Pencil,       headerBg: "bg-violet-100", bodyBg: "bg-violet-50", borderColor: "border-violet-100", textColor: "text-violet-800" },
  Grep:    { icon: Search,       headerBg: "bg-cyan-100",  bodyBg: "bg-cyan-50",   borderColor: "border-cyan-100",  textColor: "text-cyan-800" },
  Glob:    { icon: FolderSearch,  headerBg: "bg-teal-100",  bodyBg: "bg-teal-50",   borderColor: "border-teal-100",  textColor: "text-teal-800" },
  WebFetch:{ icon: Globe,        headerBg: "bg-indigo-100", bodyBg: "bg-indigo-50", borderColor: "border-indigo-100", textColor: "text-indigo-800" },
}

const defaultMeta = { icon: Wrench, headerBg: "bg-slate-200", bodyBg: "bg-slate-50", borderColor: "border-slate-200", textColor: "text-slate-700" }

export const EventCard = memo(function EventCard({ toolUseId, toolName, input, result, display, systemTags, permission, onPermissionDecision, defaultCollapsed = true, onSelect }: EventCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const [displayExpanded, setDisplayExpanded] = useState(false)
  const [localDecided, setLocalDecided] = useState<'approved' | 'denied' | null>(null)
  const [editingRules, setEditingRules] = useState(false)
  const [editedRules, setEditedRules] = useState<{ toolName: string; ruleContent: string }[]>([])
  const decided = permission?.status === 'approved'
    ? 'approved'
    : permission?.status === 'denied'
      ? 'denied'
      : localDecided
  const summary = getToolSummary(toolName, input)
  const hasDetail = Object.keys(input).length > 0 || result != null
  const isDone = result != null
  const isPending = permission?.status === 'pending' && !decided
  const meta = toolMeta[toolName] ?? defaultMeta
  // Use warning style when permission is pending
  const activeMeta = isPending
    ? { ...meta, headerBg: "bg-[#fcf1ce]", borderColor: "border-[#f3e4b0]", bodyBg: "bg-[#fdf8eb]" }
    : meta

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && onSelect) onSelect()
  }

  const handleDecision = (approved: boolean, alwaysAllow?: boolean, permissions?: PermissionSuggestion[]) => {
    if (!toolUseId || !onPermissionDecision) return
    setLocalDecided(approved ? 'approved' : 'denied')
    setEditingRules(false)
    onPermissionDecision(toolUseId, approved, alwaysAllow, permissions)
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Extract rules with toolName, deduplicate by toolName+ruleContent
    const seen = new Set<string>()
    const rules: { toolName: string; ruleContent: string }[] = []
    for (const s of permission?.suggestions ?? []) {
      for (const r of s.rules ?? []) {
        const key = `${r.toolName}:${r.ruleContent ?? ''}`
        if (!seen.has(key)) {
          seen.add(key)
          rules.push({ toolName: r.toolName, ruleContent: r.ruleContent ?? '' })
        }
      }
    }
    setEditedRules(rules)
    setEditingRules(true)
  }

  const handleSubmitEdited = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Rebuild suggestions with edited ruleContent, deduplicating
    const suggestions = permission?.suggestions ?? []
    const editMap = new Map<string, string>() // original key → edited content
    const origRules: { toolName: string; ruleContent: string }[] = []
    const seen = new Set<string>()
    for (const s of suggestions) {
      for (const r of s.rules ?? []) {
        const key = `${r.toolName}:${r.ruleContent ?? ''}`
        if (!seen.has(key)) {
          seen.add(key)
          origRules.push({ toolName: r.toolName, ruleContent: r.ruleContent ?? '' })
        }
      }
    }
    origRules.forEach((orig, i) => {
      editMap.set(`${orig.toolName}:${orig.ruleContent}`, editedRules[i]?.ruleContent ?? orig.ruleContent)
    })
    // Apply edits back, skipping duplicates
    const usedKeys = new Set<string>()
    const updated = suggestions.map(s => {
      if (!s.rules) return s
      const newRules = s.rules.filter(r => {
        const key = `${r.toolName}:${r.ruleContent ?? ''}`
        if (usedKeys.has(key)) return false // skip duplicate
        usedKeys.add(key)
        return true
      }).map(r => ({
        ...r,
        ruleContent: editMap.get(`${r.toolName}:${r.ruleContent ?? ''}`) ?? r.ruleContent,
      }))
      return { ...s, rules: newRules }
    }).filter(s => !s.rules || s.rules.length > 0)
    handleDecision(true, true, updated)
  }

  return (
    <div className="ml-10 my-2">
      <Collapsible open={open} onOpenChange={handleOpenChange}>
        <div className={cn("rounded-lg overflow-hidden border shadow-soft transition-colors", activeMeta.borderColor, activeMeta.bodyBg)}>
          {/* Header bar */}
          <CollapsibleTrigger
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 border-b",
              activeMeta.headerBg, activeMeta.borderColor
            )}
          >
            {isPending ? (
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
            ) : !isDone ? (
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            ) : null}
            <span className={cn("font-semibold text-sm", isPending ? "text-yellow-900" : meta.textColor)}>
              {toolName}
            </span>
            {summary && (
              <span className="font-mono text-sm text-foreground/70 truncate ml-1">
                {summary}
              </span>
            )}
            {decided && (
              <span className="flex items-center gap-1 ml-1">
                {decided === 'approved' ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                )}
              </span>
            )}
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 shrink-0 transition-transform",
                meta.textColor,
                open ? "rotate-90" : ""
              )}
            />
          </CollapsibleTrigger>

          {/* Permission action bar */}
          {isPending && (
            <div className="px-4 py-2.5 bg-[#fcf1ce] border-b border-[#f3e4b0] space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-yellow-900">
                  {permission.title || `Allow ${toolName}?`}
                </p>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecision(true) }}
                    className="px-3 py-1 bg-[#f3e4b0] hover:bg-[#e8d596] text-yellow-900 text-sm font-medium rounded transition-colors"
                  >
                    Allow
                  </button>
                  {permission.hasSuggestions && !editingRules && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDecision(true, true) }}
                      className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-medium rounded transition-colors"
                    >
                      Always allow
                    </button>
                  )}
                  {permission.hasSuggestions && !editingRules && (
                    <button
                      onClick={handleStartEdit}
                      className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium rounded transition-colors"
                    >
                      Edit rule
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecision(false) }}
                    className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded border border-slate-200 transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
              {permission.description && (
                <p data-testid="permission-description" className="text-xs text-yellow-800/70">
                  {permission.description}
                </p>
              )}
              {editingRules && (
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {editedRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-yellow-800 shrink-0 w-12">{rule.toolName}</span>
                      <input
                        value={rule.ruleContent}
                        onChange={(e) => setEditedRules(prev => prev.map((r, j) => j === i ? { ...r, ruleContent: e.target.value } : r))}
                        className="flex-1 px-2 py-1 text-xs font-mono bg-white border border-yellow-300 rounded focus:outline-none focus:border-blue-400"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSubmitEdited}
                      className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-medium rounded transition-colors"
                    >
                      Save & always allow
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingRules(false) }}
                      className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded border border-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content body */}
          {hasDetail && (
            <CollapsibleContent>
              <div className="p-4 font-mono text-sm text-foreground leading-relaxed">
                {Object.keys(input).length > 0 && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(input, null, 2)}
                  </pre>
                )}
                {result != null && (
                  <>
                    {Object.keys(input).length > 0 && <hr className="my-2 border-t border-current/10" />}
                    {display && !displayExpanded ? (
                      <button
                        onClick={() => setDisplayExpanded(true)}
                        className="text-xs text-muted-foreground/60 hover:text-muted-foreground/80 italic cursor-pointer select-none"
                      >
                        {display === 'omitted' ? 'Result omitted' : 'Result summarized'}
                        <span className="ml-1 text-[10px]" aria-hidden="true">(click to show)</span>
                      </button>
                    ) : (
                      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
                        {typeof result === "string"
                          ? (result.length > 4000 ? result.slice(0, 4000) + "\n… (truncated)" : result)
                          : JSON.stringify(result, null, 2)}
                      </pre>
                    )}
                  </>
                )}
                {systemTags && systemTags.length > 0 && (
                  <>
                    <hr className="my-2 border-t border-current/10" />
                    <details className="text-xs text-muted-foreground/60">
                      <summary className="cursor-pointer select-none hover:text-muted-foreground/80">
                        system ({systemTags.length})
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                        {systemTags.join("\n---\n")}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            </CollapsibleContent>
          )}
        </div>
      </Collapsible>
    </div>
  )
})
