import { X } from 'lucide-react'

interface McpServer {
  name: string
  status?: string
  [key: string]: unknown
}

interface SettingsModalProps {
  settings: Record<string, unknown>
  onClose: () => void
}

export function SettingsModal({ settings, onClose }: SettingsModalProps) {
  const mcpServers = (settings.mcpServers as McpServer[] | undefined) ?? []
  const account = (settings.account as Record<string, unknown> | undefined) ?? {}
  const permissionMode = settings.permissionMode as string | undefined

  const isConnected = (status?: string) => !status || status === 'connected'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Session Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Permission Mode */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Permission Mode</h3>
            <p className="text-sm text-slate-700">{permissionMode ?? 'default'}</p>
          </section>

          {/* MCP Servers */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">MCP Servers</h3>
            {mcpServers.length === 0 ? (
              <p className="text-sm text-slate-400">No MCP servers configured</p>
            ) : (
              <ul className="space-y-1.5">
                {mcpServers.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected(s.status) ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span>{s.name ?? String(s)}</span>
                    {s.status && s.status !== 'connected' && (
                      <span className="text-xs text-slate-400 ml-auto">{s.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Account */}
          {Object.keys(account).length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Account</h3>
              <dl className="space-y-1">
                {Object.entries(account).map(([k, v]) =>
                  v != null && typeof v !== 'object' ? (
                    <div key={k} className="flex items-baseline gap-2">
                      <dt className="text-xs text-slate-500 w-28 flex-shrink-0">{k}</dt>
                      <dd className="text-sm text-slate-700">{String(v)}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
