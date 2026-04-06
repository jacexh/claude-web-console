import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { EventCard } from './EventCard'
import type { ChatItem } from '../types'

interface SubAgentCardProps {
  agentId: string
  sessionId: string
  agentName?: string
  description: string
  status: 'running' | 'done' | 'error'
  resultPreview?: string
  resultText?: string
  subagentMessages?: ChatItem[]
  allSubagentMessages?: Record<string, ChatItem[]>
  onExpand: (sessionId: string, agentId: string) => void
  onSelectArtifact?: (toolName: string, input: Record<string, unknown>, result?: unknown) => void
  onPermissionDecision?: (toolUseId: string, approved: boolean, alwaysAllow?: boolean, updatedPermissions?: import('../types').PermissionSuggestion[]) => void
}

export function SubAgentCard({ agentId, sessionId, agentName, description, status, resultPreview, resultText, subagentMessages, allSubagentMessages, onExpand, onSelectArtifact, onPermissionDecision }: SubAgentCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Auto-expand when subagent starts streaming messages
  useEffect(() => {
    if (status === 'running' && subagentMessages && subagentMessages.length > 0) {
      setExpanded(true)
    }
  }, [status, subagentMessages])

  const handleToggle = () => {
    if (!expanded && !subagentMessages) {
      onExpand(sessionId, agentId)
    }
    setExpanded(!expanded)
  }

  const statusColors = {
    running: 'bg-[#fcf1ce] text-amber-700',
    done: 'bg-[#e8f5e8] text-emerald-700',
    error: 'bg-[#fef2f2] text-red-700',
  }

  const renderItem = (item: ChatItem) => {
    switch (item.type) {
      case 'user':
        return <MessageBubble key={item.id} role="user" content={item.content as string} />
      case 'assistant':
        return <MessageBubble key={item.id} role="assistant" content={item.content as string} />
      case 'tool_use': {
        const data = item.content as { name: string; input: Record<string, unknown>; result?: unknown; permission?: { status: 'pending' | 'approved' | 'denied'; title?: string; description?: string; hasSuggestions?: boolean } }
        // Nested SubAgentCard for Agent tool calls
        if (data.name === 'Agent' && item.agentId) {
          const toolInput = item.toolInput ?? data.input
          const nestedAgentName = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type : undefined
          const promptStr = typeof toolInput.prompt === 'string' ? toolInput.prompt : undefined
          const descStr = typeof toolInput.description === 'string' ? toolInput.description : undefined
          const desc = descStr ?? (promptStr ? promptStr.split('\n')[0] : undefined) ?? data.name
          const hasResult = data.result != null
          const isError = Array.isArray(data.result) &&
            (data.result as Array<{ type: string; is_error?: boolean }>).some(b => b.is_error === true)
          const nestedStatus: 'running' | 'done' | 'error' = isError ? 'error' : hasResult ? 'done' : status === 'running' ? 'running' : 'done'
          const nestedKey = `${sessionId}:${item.agentId}`
          return (
            <SubAgentCard
              key={item.id}
              agentId={item.agentId}
              sessionId={sessionId}
              agentName={nestedAgentName}
              description={desc}
              status={nestedStatus}
              subagentMessages={allSubagentMessages?.[nestedKey]}
              allSubagentMessages={allSubagentMessages}
              onExpand={onExpand}
              onSelectArtifact={onSelectArtifact}
              onPermissionDecision={onPermissionDecision}
            />
          )
        }
        return (
          <EventCard
            key={item.id}
            toolUseId={item.id}
            toolName={data.name}
            input={data.input}
            result={data.result}
            permission={data.permission}
            onPermissionDecision={onPermissionDecision}
            defaultCollapsed
            onSelect={onSelectArtifact ? () => onSelectArtifact(data.name, data.input, data.result) : undefined}
          />
        )
      }
      default:
        return null
    }
  }

  return (
    <div className="ml-10 my-2 border border-[#d4c5f9] bg-[#f5f0ff] rounded-lg overflow-hidden shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between cursor-pointer px-4 py-2.5 border-b border-[#d4c5f9]/50" onClick={handleToggle}>
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} className="text-violet-500" /> : <ChevronRight size={14} className="text-violet-500" />}
          {agentName && <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#e4d8f9] text-violet-700">{agentName}</span>}
          <span className="text-sm font-medium text-violet-800 truncate max-w-xs">{description}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
          {status}
        </span>
      </div>
      {/* Body */}
      {resultPreview && !expanded && (
        <div className="px-4 py-2 text-xs text-slate-500 truncate">{resultPreview}</div>
      )}
      {expanded && (
        <div className="px-3 py-3 border-l-2 border-[#d4c5f9] ml-3 my-2 space-y-1">
          {!subagentMessages ? (
            <div className="text-xs text-slate-400">Loading...</div>
          ) : subagentMessages.length === 0 ? (
            <div className="text-xs text-slate-400 italic">Internal messages are only available during live sessions</div>
          ) : (
            subagentMessages.map(renderItem)
          )}
          {resultText && (
            <MessageBubble role="assistant" content={resultText} />
          )}
        </div>
      )}
    </div>
  )
}
