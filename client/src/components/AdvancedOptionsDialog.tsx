import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface AdvancedOptionsDialogProps {
  open: boolean
  readOnly: boolean
  executableArgs: string[]
  env: Record<string, string>
  onSave: (args: string[], env: Record<string, string>) => void
  onClose: () => void
}

export function AdvancedOptionsDialog({
  open,
  readOnly,
  executableArgs,
  env,
  onSave,
  onClose,
}: AdvancedOptionsDialogProps) {
  const [argsText, setArgsText] = useState('')
  const [envText, setEnvText] = useState('')

  useEffect(() => {
    if (open) {
      setArgsText(executableArgs.join(' '))
      setEnvText(
        Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      )
    }
  }, [open, executableArgs, env])

  if (!open) return null

  const handleSave = () => {
    const parsedArgs = argsText.trim() ? argsText.trim().split(/\s+/) : []
    const parsedEnv: Record<string, string> = {}
    for (const line of envText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        parsedEnv[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
      }
    }
    onSave(parsedArgs, parsedEnv)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Advanced Options</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Extra Arguments
            </label>
            <input
              type="text"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              readOnly={readOnly}
              placeholder="--flag1 --flag2 value"
              className={`w-full px-3 py-2 text-sm border rounded-lg ${readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white'} border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary`}
            />
            <p className="text-xs text-slate-400 mt-1">Space-separated arguments passed to Claude CLI</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Environment Variables
            </label>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              readOnly={readOnly}
              placeholder={'KEY=value\nANOTHER_KEY=value'}
              rows={4}
              className={`w-full px-3 py-2 text-sm border rounded-lg font-mono ${readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white'} border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary resize-none`}
            />
            <p className="text-xs text-slate-400 mt-1">One per line, KEY=value format</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
