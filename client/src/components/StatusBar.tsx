import { Activity, Cpu, DollarSign, Settings, Zap } from "lucide-react"
import type { ModelInfo, EffortLevel } from "../types"

export interface SessionStatusInfo {
  model?: string
  totalCost?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
}

interface StatusBarProps {
  status: SessionStatusInfo
  loading: boolean
  availableModels: ModelInfo[]
  onSetModel: (model: string) => void
  effortLevel: EffortLevel
  onSetEffortLevel: (level: EffortLevel) => void
  onOpenSettings?: () => void
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
  return String(n)
}

/** Turn a model ID like "claude-opus-4-6" into a short label like "Opus 4.6" */
function friendlyModelName(value: string): string {
  const m = value.match(/claude-(\w+)-(\d+)-(\d+)/)
  if (m) {
    const family = m[1].charAt(0).toUpperCase() + m[1].slice(1)
    return `${family} ${m[2]}.${m[3]}`
  }
  return value
}

export function StatusBar({ status, loading, availableModels, onSetModel, effortLevel, onSetEffortLevel, onOpenSettings }: StatusBarProps) {
  const { model, totalCost, inputTokens, outputTokens, cacheReadTokens } = status
  const hasTokens = (inputTokens ?? 0) > 0 || (outputTokens ?? 0) > 0

  // Ensure current model appears in the option list
  const modelInList = model && availableModels.some((m) => m.value === model)
  const options = modelInList || !model
    ? availableModels
    : [{ value: model, displayName: friendlyModelName(model), description: '' }, ...availableModels]

  return (
    <div className="flex items-center gap-5 px-3 py-2 mb-2 text-xs text-slate-500 font-mono select-none rounded-lg bg-slate-50">
      {model && (
        <span className="flex items-center gap-1.5" title="Model">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          {options.length > 0 ? (
            <select
              value={model}
              onChange={(e) => onSetModel(e.target.value)}
              className="font-semibold text-slate-600 bg-transparent border-none outline-none cursor-pointer text-xs font-mono hover:text-slate-900 appearance-none pr-4 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%226%22%3E%3Cpath%20d%3D%22M0%200l5%206%205-6z%22%20fill%3D%22%2394a3b8%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_6px] bg-[right_center] bg-no-repeat"
            >
              {options.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.displayName}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-semibold text-slate-600">{model}</span>
          )}
        </span>
      )}

      <span className="flex items-center gap-1.5" title="Effort level">
        <Activity className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={effortLevel}
          onChange={(e) => onSetEffortLevel(e.target.value as EffortLevel)}
          className="font-semibold text-slate-600 bg-transparent border-none outline-none cursor-pointer text-xs font-mono hover:text-slate-900 appearance-none pr-4 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%226%22%3E%3Cpath%20d%3D%22M0%200l5%206%205-6z%22%20fill%3D%22%2394a3b8%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_6px] bg-[right_center] bg-no-repeat"
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="max">max</option>
        </select>
      </span>

      {hasTokens && (
        <span className="flex items-center gap-1.5" title="Tokens (in / out)">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>
            {formatTokens(inputTokens ?? 0)} in / {formatTokens(outputTokens ?? 0)} out
            {(cacheReadTokens ?? 0) > 0 && (
              <span className="text-slate-400"> ({formatTokens(cacheReadTokens!)} cached)</span>
            )}
          </span>
        </span>
      )}

      {totalCost != null && totalCost > 0 && (
        <span className="flex items-center gap-1.5" title="Total cost">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          <span>${totalCost.toFixed(4)}</span>
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {loading && (
          <span className="text-primary font-semibold animate-pulse">working...</span>
        )}
        {onOpenSettings && (
          <button onClick={onOpenSettings} className="text-slate-400 hover:text-slate-600" title="Session Settings">
            <Settings size={13} />
          </button>
        )}
      </span>
    </div>
  )
}
