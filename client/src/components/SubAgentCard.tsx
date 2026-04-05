import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface SubAgentCardProps {
  agentId: string
  sessionId: string
  description: string
  status: 'running' | 'done' | 'error'
  resultPreview?: string
  subagentMessages?: unknown[]
  onExpand: (sessionId: string, agentId: string) => void
}

export function SubAgentCard({ agentId, sessionId, description, status, resultPreview, subagentMessages, onExpand }: SubAgentCardProps) {
  const [expanded, setExpanded] = useState(false)

  const handleToggle = () => {
    if (!expanded && !subagentMessages) {
      onExpand(sessionId, agentId)
    }
    setExpanded(!expanded)
  }

  const statusColors = {
    running: 'bg-amber-100 text-amber-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }

  return (
    <div className="ml-10 border border-violet-200 bg-violet-50 rounded-lg p-3 my-2 cursor-pointer" onClick={handleToggle}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} className="text-violet-500" /> : <ChevronRight size={14} className="text-violet-500" />}
          <span className="text-sm font-medium text-violet-800 truncate max-w-xs">{description}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
          {status}
        </span>
      </div>
      {resultPreview && !expanded && (
        <div className="mt-1 ml-5 text-xs text-slate-500 truncate">{resultPreview}</div>
      )}
      {expanded && (
        <div className="mt-3 ml-5 border-l-2 border-violet-200 pl-3 space-y-2">
          {!subagentMessages ? (
            <div className="text-xs text-slate-400">Loading...</div>
          ) : subagentMessages.length === 0 ? (
            <div className="text-xs text-slate-400">No messages</div>
          ) : (
            subagentMessages.map((msg, i) => {
              const m = msg as Record<string, unknown>
              const role = m.role as string
              const content = Array.isArray(m.content)
                ? (m.content as Array<{ type: string; text?: string }>)
                    .filter(b => b.type === 'text')
                    .map(b => b.text)
                    .join('')
                : String(m.content ?? '')
              if (!content) return null
              return (
                <div key={i} className={`text-xs p-2 rounded ${role === 'assistant' ? 'bg-white border border-violet-100' : 'bg-violet-100'}`}>
                  <div className="font-medium text-slate-500 mb-1">{role}</div>
                  <div className="text-slate-700 whitespace-pre-wrap line-clamp-5">{content}</div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
