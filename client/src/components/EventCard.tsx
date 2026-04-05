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

export interface PermissionState {
  status: 'pending' | 'approved' | 'denied'
  title?: string
  description?: string
  hasSuggestions?: boolean
}

interface EventCardProps {
  toolUseId?: string
  toolName: string
  input: Record<string, unknown>
  result?: unknown
  permission?: PermissionState
  onPermissionDecision?: (toolUseId: string, approved: boolean, alwaysAllow?: boolean) => void
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

export const EventCard = memo(function EventCard({ toolUseId, toolName, input, result, permission, onPermissionDecision, defaultCollapsed = true, onSelect }: EventCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const [localDecided, setLocalDecided] = useState<'approved' | 'denied' | null>(null)
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

  const handleDecision = (approved: boolean, alwaysAllow?: boolean) => {
    if (!toolUseId || !onPermissionDecision) return
    setLocalDecided(approved ? 'approved' : 'denied')
    onPermissionDecision(toolUseId, approved, alwaysAllow)
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
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#fcf1ce] border-b border-[#f3e4b0]">
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
                {permission.hasSuggestions && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDecision(true, true) }}
                    className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-sm font-medium rounded transition-colors"
                  >
                    Always allow
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
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-muted-foreground">
                      {typeof result === "string"
                        ? (result.length > 4000 ? result.slice(0, 4000) + "\n… (truncated)" : result)
                        : JSON.stringify(result, null, 2)}
                    </pre>
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
