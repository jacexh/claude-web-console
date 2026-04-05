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
      accept: 'text-green-600',
      decline: 'text-amber-600',
      cancel: 'text-slate-400',
    }
    return (
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 my-2 opacity-75">
        <div className="text-xs font-medium text-blue-600 mb-1">Input Required — {serverName}</div>
        {resolvedAction && (
          <div className="text-xs text-slate-500">
            <span className={actionColors[resolvedAction] ?? 'text-slate-500'}>
              Response: {resolvedAction}
            </span>
          </div>
        )}
      </div>
    )
  }

  const handleSubmit = () => {
    onResponse(id, 'accept', Object.keys(formValues).length > 0 ? formValues : undefined)
  }

  const properties = requestedSchema?.properties as Record<string, SchemaProperty> | undefined

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 my-2">
      <div className="flex items-center gap-2 mb-2">
        <FileText size={13} className="text-blue-500" />
        <span className="text-xs font-semibold text-blue-700">Input Required — {serverName}</span>
      </div>
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
                  onChange={(e) => setFormValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
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
          className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Submit
        </button>
        <button
          onClick={() => onResponse(id, 'decline')}
          className="text-xs px-3 py-1 border border-slate-300 bg-white rounded hover:bg-slate-50 text-slate-600"
        >
          Decline
        </button>
        <button
          onClick={() => onResponse(id, 'cancel')}
          className="text-xs px-3 py-1 text-slate-400 hover:text-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
