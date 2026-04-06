import { useState } from 'react'
import { FileText } from 'lucide-react'

type SchemaProperty = { type?: string; enum?: string[]; description?: string; title?: string }

interface ElicitationCardProps {
  id: string
  serverName: string
  message: string
  mode?: string
  requestedSchema?: Record<string, unknown>
  url?: string
  resolved?: boolean
  resolvedAction?: string
  onResponse: (id: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown>) => void
}

export function ElicitationCard({
  id,
  serverName,
  message,
  mode,
  requestedSchema,
  url,
  resolved,
  resolvedAction,
  onResponse,
}: ElicitationCardProps) {
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})

  if (resolved) {
    const actionColors: Record<string, string> = {
      accept: 'text-emerald-600',
      decline: 'text-amber-600',
      cancel: 'text-slate-400',
    }
    return (
      <div className="ml-10 my-2">
        <div className="border border-[#c5d9ff]/60 bg-[#f0f5ff]/60 rounded-lg px-4 py-2.5 shadow-soft opacity-75">
          <div className="text-xs font-medium text-blue-700 mb-1">Input Required — {serverName}</div>
          {resolvedAction && (
            <div className="text-xs text-slate-500">
              <span className={actionColors[resolvedAction] ?? 'text-slate-500'}>
                Response: {resolvedAction}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const handleSubmit = () => {
    onResponse(id, 'accept', Object.keys(formValues).length > 0 ? formValues : undefined)
  }

  const properties = requestedSchema?.properties as Record<string, SchemaProperty> | undefined

  return (
    <div className="ml-10 my-2">
      <div className="border border-[#c5d9ff] bg-[#f0f5ff] rounded-lg overflow-hidden shadow-soft">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#c5d9ff]/50">
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">Input Required — {serverName}</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-sm text-slate-700 mb-3">{message}</p>

          {mode === 'url' && url ? (
            <div className="mb-3">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                Open URL ↗
              </a>
            </div>
          ) : properties ? (
            <div className="space-y-2 mb-3">
              {Object.entries(properties).map(([key, prop]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">{prop.title ?? key}</label>
                  {prop.type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={!!formValues[key]}
                      onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                  ) : prop.enum ? (
                    <select
                      value={String(formValues[key] ?? '')}
                      onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="">— select —</option>
                      {prop.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : prop.type === 'number' ? (
                    <input
                      type="number"
                      value={String(formValues[key] ?? '')}
                      onChange={(e) => setFormValues((v) => ({
                        ...v,
                        [key]: e.target.value === '' ? undefined : Number(e.target.value),
                      }))}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-32"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(formValues[key] ?? '')}
                      onChange={(e) => setFormValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="px-4 py-1.5 text-sm font-medium rounded border transition-colors bg-[#c5d9ff] hover:bg-[#9cbdfb] text-primary border-[#9cbdfb]"
            >
              Submit
            </button>
            <button
              onClick={() => onResponse(id, 'decline')}
              className="px-4 py-1.5 text-sm font-medium rounded border transition-colors bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
            >
              Decline
            </button>
            <button
              onClick={() => onResponse(id, 'cancel')}
              className="px-4 py-1.5 text-sm font-medium rounded transition-colors text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
