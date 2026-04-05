import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronsRight } from 'lucide-react'
import { useWebSocket } from './hooks/useWebSocket'
import { useSessionStore } from './hooks/useSessionStore'
import { SessionList } from './components/SessionList'
import { ChatPanel } from './components/ChatPanel'
import { ArtifactPanel, type Artifact } from './components/ArtifactPanel'
import { ResizeHandle } from './components/ResizeHandle'
import type { ChatItem, SessionInfo, ModelInfo, EffortLevel } from './types'
import type { FileEntry } from './components/FileMention'
import { NewSessionDialog } from './components/NewSessionDialog'
import type { SessionStatusInfo } from './components/StatusBar'

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function App() {
  const store = useSessionStore()
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [fileList, setFileList] = useState<FileEntry[]>([])
  const [commandList, setCommandList] = useState<{ name: string; description: string }[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [artifactRatio, setArtifactRatio] = useState(50) // percentage of remaining space
  const contentRef = useRef<HTMLDivElement>(null)
  const fileListCallbackRef = useRef<((files: FileEntry[]) => void) | null>(null)
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [defaultCwd, setDefaultCwd] = useState('')
  const [statusBySession, setStatusBySession] = useState<Record<string, SessionStatusInfo>>({})
  const [modelsBySession, setModelsBySession] = useState<Record<string, ModelInfo[]>>({})
  const [effortBySession, setEffortBySession] = useState<Record<string, EffortLevel>>({})
  const [subagentMessages, setSubagentMessages] = useState<Record<string, unknown[]>>({})
  // Global model list: start with well-known models, replace with SDK list when available
  const [globalModels, setGlobalModels] = useState<ModelInfo[]>([
    { value: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', description: 'Fast and capable' },
    { value: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', description: 'Most capable' },
    { value: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', description: 'Fastest' },
  ])
  // Track locally-sent user messages to deduplicate SDK echoes
  const sentMessagesRef = useRef<Set<string>>(new Set())

  const updateSessionStatus = useCallback((sessionId: string, patch: Partial<SessionStatusInfo>) => {
    setStatusBySession((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], ...patch },
    }))
  }, [])

  const handleServerMessage = useCallback(
    (raw: unknown) => {
      const data = raw as Record<string, unknown>
      const type = data.type as string

      switch (type) {
        case 'session_list':
          store.setSessions(data.sessions as SessionInfo[])
          break

        case 'session_created':
          store.addSession(data.sessionId as string)
          break

        case 'sdk_message': {
          const sessionId = data.sessionId as string
          const msg = data.message as Record<string, unknown>
          const sdkType = msg.type as string

          // Extract status info from SDK messages
          if (sdkType === 'system' && msg.subtype === 'init') {
            if (msg.model) {
              updateSessionStatus(sessionId, { model: msg.model as string })
            }
          }

          if (sdkType === 'assistant') {
            // Don't clear loading here — keep showing activity until 'result' arrives
            const message = msg.message as Record<string, unknown>
            const content = message.content as Array<Record<string, unknown>>
            const msgUuid = msg.uuid as string | undefined

            for (const block of content) {
              if (block.type === 'text') {
                const item: ChatItem = {
                  id: msgUuid ?? uuid(),
                  type: 'assistant',
                  content: block.text as string,
                  timestamp: Date.now(),
                  uuid: msgUuid,
                }
                store.addChatItem(sessionId, item)
              } else if (block.type === 'tool_use') {
                const toolName = block.name as string
                const toolId = block.id as string
                const toolInput = block.input as Record<string, unknown>
                const item: ChatItem = {
                  id: toolId,
                  type: 'tool_use',
                  content: { name: toolName, input: toolInput },
                  timestamp: Date.now(),
                  collapsed: true,
                  agentId: toolName === 'Agent' ? toolId : undefined,
                  toolInput,
                }
                store.addChatItem(sessionId, item)
              }
            }
          } else if (sdkType === 'user') {
            const message = msg.message as Record<string, unknown>
            const content = message.content as Array<Record<string, unknown>>

            for (const block of content) {
              if (block.type === 'text') {
                const text = block.text as string
                // Skip if this is an echo of our own message
                if (sentMessagesRef.current.has(text)) {
                  sentMessagesRef.current.delete(text)
                  continue
                }
                const item: ChatItem = {
                  id: uuid(),
                  type: 'user',
                  content: text,
                  timestamp: Date.now(),
                }
                store.addChatItem(sessionId, item)
              } else if (block.type === 'tool_result') {
                store.updateChatItem(sessionId, block.tool_use_id as string, {
                  content: {
                    result: block.content,
                  },
                })
              }
            }
          } else if (sdkType === 'system' && (msg as Record<string, unknown>).subtype === 'local_command_output') {
            const item: ChatItem = {
              id: (msg as Record<string, unknown>).uuid as string ?? uuid(),
              type: 'assistant',
              content: (msg as Record<string, unknown>).content as string,
              timestamp: Date.now(),
            }
            store.addChatItem(sessionId, item)
            store.setLoading(sessionId, false)
          } else if (sdkType === 'result') {
            store.setLoading(sessionId, false)
            // Accumulate cost and token usage
            const resultMsg = msg as Record<string, unknown>
            const usage = resultMsg.usage as Record<string, number> | undefined
            const costDelta = (resultMsg.total_cost_usd as number) ?? 0
            const inDelta = usage?.inputTokens ?? 0
            const outDelta = usage?.outputTokens ?? 0
            const cacheDelta = usage?.cacheReadInputTokens ?? 0
            setStatusBySession((prev) => {
              const s = prev[sessionId] ?? {}
              return {
                ...prev,
                [sessionId]: {
                  ...s,
                  totalCost: (s.totalCost ?? 0) + costDelta,
                  inputTokens: (s.inputTokens ?? 0) + inDelta,
                  outputTokens: (s.outputTokens ?? 0) + outDelta,
                  cacheReadTokens: (s.cacheReadTokens ?? 0) + cacheDelta,
                },
              }
            })
          }
          break
        }

        case 'permission_request': {
          const sessionId = (data.sessionId as string) ?? store.activeSessionId
          if (sessionId) {
            // Merge permission state into the existing tool_use card
            store.updateChatItem(sessionId, data.toolUseId as string, {
              content: {
                permission: {
                  status: 'pending' as const,
                  title: data.title as string | undefined,
                  description: data.description as string | undefined,
                  hasSuggestions: data.hasSuggestions as boolean | undefined,
                },
              },
            })
          }
          break
        }

        case 'session_history': {
          const sessionId = data.sessionId as string
          const messages = data.messages as Array<Record<string, unknown>>
          const items: ChatItem[] = []
          // Map tool_use IDs to items so we can attach tool_results later
          const toolUseMap = new Map<string, ChatItem>()

          for (const msg of messages) {
            const msgType = msg.type as string
            const message = msg.message as Record<string, unknown> | undefined
            if (!message) continue

            if (msgType === 'assistant') {
              const content = message.content as Array<Record<string, unknown>> | undefined
              if (!content) continue
              const msgUuid = msg.uuid as string | undefined
              for (const block of content) {
                if (block.type === 'text') {
                  items.push({
                    id: msgUuid ?? uuid(),
                    type: 'assistant',
                    content: block.text as string,
                    timestamp: 0,
                    uuid: msgUuid,
                  })
                } else if (block.type === 'tool_use') {
                  const toolName = block.name as string
                  const toolId = block.id as string
                  const toolInput = block.input as Record<string, unknown>
                  const item: ChatItem = {
                    id: toolId,
                    type: 'tool_use',
                    content: { name: toolName, input: toolInput },
                    timestamp: 0,
                    collapsed: true,
                    agentId: toolName === 'Agent' ? toolId : undefined,
                    toolInput,
                  }
                  items.push(item)
                  toolUseMap.set(toolId, item)
                }
              }
            } else if (msgType === 'system' && (msg as Record<string, unknown>).subtype === 'local_command_output') {
              items.push({
                id: (msg as Record<string, unknown>).uuid as string ?? uuid(),
                type: 'assistant',
                content: (msg as Record<string, unknown>).content as string,
                timestamp: 0,
              })
            } else if (msgType === 'user') {
              const content = message.content
              if (typeof content === 'string') {
                items.push({
                  id: uuid(),
                  type: 'user',
                  content,
                  timestamp: 0,
                })
              } else if (Array.isArray(content)) {
                for (const block of content as Array<Record<string, unknown>>) {
                  if (block.type === 'text') {
                    items.push({
                      id: uuid(),
                      type: 'user',
                      content: block.text as string,
                      timestamp: 0,
                    })
                  } else if (block.type === 'tool_result') {
                    // Attach result to matching tool_use item
                    const toolItem = toolUseMap.get(block.tool_use_id as string)
                    if (toolItem) {
                      const existing = toolItem.content as Record<string, unknown>
                      toolItem.content = { ...existing, result: block.content }
                    }
                  }
                }
              }
            }
          }

          store.setHistoryItems(sessionId, items)
          break
        }

        case 'session_id_resolved':
          store.remapSession(data.tempId as string, data.sessionId as string)
          // Remap status info
          setStatusBySession((prev) => {
            const updated = { ...prev }
            if (updated[data.tempId as string]) {
              updated[data.sessionId as string] = updated[data.tempId as string]
              delete updated[data.tempId as string]
            }
            return updated
          })
          // Remap model list
          setModelsBySession((prev) => {
            const updated = { ...prev }
            if (updated[data.tempId as string]) {
              updated[data.sessionId as string] = updated[data.tempId as string]
              delete updated[data.tempId as string]
            }
            return updated
          })
          // Remap effort level
          setEffortBySession((prev) => {
            const updated = { ...prev }
            if (updated[data.tempId as string]) {
              updated[data.sessionId as string] = updated[data.tempId as string]
              delete updated[data.tempId as string]
            }
            return updated
          })
          send({ type: 'list_commands', sessionId: data.sessionId as string })
          break

        case 'session_resumed':
          store.setSessionStatus(data.sessionId as string, 'running')
          break

        case 'permission_decided': {
          const toolUseId = data.toolUseId as string
          const approved = data.approved as boolean
          for (const [sessionId, items] of Object.entries(store.messagesBySession)) {
            if (items.find((i) => i.id === toolUseId)) {
              store.updateChatItem(sessionId, toolUseId, {
                content: {
                  permission: { status: approved ? 'approved' : 'denied' },
                },
              })
              break
            }
          }
          break
        }

        case 'session_end':
          store.setSessionStatus(data.sessionId as string, 'idle')
          store.sessionEnd(data.sessionId as string)
          break

        case 'file_list':
          setFileList(data.files as FileEntry[])
          break

        case 'command_list':
          setCommandList(data.commands as { name: string; description: string }[])
          break

        case 'model_list': {
          const sid = data.sessionId as string
          const models = data.models as ModelInfo[]
          setModelsBySession((prev) => ({ ...prev, [sid]: models }))
          setGlobalModels(models)
          if (data.currentModel) {
            updateSessionStatus(sid, { model: data.currentModel as string })
          }
          break
        }

        case 'session_renamed':
          store.renameSession(data.sessionId as string, data.title as string)
          break

        case 'session_forked': {
          const newSessionId = data.newSessionId as string
          store.addSession(newSessionId)
          store.setActive(newSessionId)
          send({ type: 'switch_session', sessionId: newSessionId })
          send({ type: 'list_commands', sessionId: newSessionId })
          break
        }

        case 'effort_level_changed':
          setEffortBySession((prev) => ({ ...prev, [data.sessionId as string]: data.level as EffortLevel }))
          break

        case 'subagent_messages': {
          const { agentId, messages: agentMsgs } = data as { agentId: string; messages: unknown[] }
          setSubagentMessages(prev => ({ ...prev, [agentId]: agentMsgs }))
          break
        }

        case 'default_cwd':
          setDefaultCwd(data.cwd as string)
          break

        case 'error':
          console.error('[Server Error]', data.message)
          alert(`Server error: ${data.message}`)
          break
      }
    },
    [store],
  )

  const { send, connected } = useWebSocket(handleServerMessage)

  // Request default cwd once connected
  useEffect(() => {
    if (connected) {
      send({ type: 'get_default_cwd' })
    }
  }, [connected, send])

  const handleCreateSession = useCallback(() => {
    setShowNewSessionDialog(true)
  }, [])

  const handleConfirmNewSession = useCallback(
    (cwd: string, model?: string) => {
      setShowNewSessionDialog(false)
      send({ type: 'create_session', options: { cwd, ...(model ? { model } : {}) } })
    },
    [send],
  )

  const handleSwitchSession = useCallback(
    (sessionId: string) => {
      store.setActive(sessionId)
      send({ type: 'switch_session', sessionId })
      send({ type: 'list_commands', sessionId })
    },
    [send, store],
  )



  const handleResumeSession = useCallback(
    (sessionId: string) => {
      send({ type: 'resume_session', sessionId })
    },
    [send],
  )

  const handleRenameSession = useCallback(
    (sessionId: string, title: string) => {
      send({ type: 'rename_session', sessionId, title })
    },
    [send],
  )

  const handleForkSession = useCallback(
    (sessionId: string, upToMessageId: string) => {
      send({ type: 'fork_session', sessionId, upToMessageId })
    },
    [send],
  )

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      send({ type: 'close_session', sessionId })
    },
    [send],
  )

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!store.activeSessionId) return

      const item: ChatItem = {
        id: uuid(),
        type: 'user',
        content,
        timestamp: Date.now(),
      }
      store.addChatItem(store.activeSessionId, item)
      // Track for dedup when SDK echoes this message back
      sentMessagesRef.current.add(content)

      // CLI-internal commands don't produce assistant responses
      const cliCommands = [
        '/help', '/clear', '/compact', '/context', '/cost', '/model',
        '/exit', '/fast', '/vim', '/bug', '/terminal-setup', '/plugin',
        '/mcp', '/agents', '/memory', '/skills', '/permissions', '/status',
        '/doctor', '/login', '/logout', '/init', '/resume',
      ]
      const trimmed = content.trim()
      const isCliCommand = cliCommands.some((cmd) => trimmed === cmd || trimmed.startsWith(cmd + ' '))
      if (isCliCommand) {
        // Show immediate feedback, then auto-clear loading after timeout
        store.setLoading(store.activeSessionId, true)
        const sid = store.activeSessionId
        setTimeout(() => {
          store.setLoading(sid, false)
          store.addChatItem(sid, {
            id: uuid(),
            type: 'system',
            content: { command: trimmed },
            timestamp: Date.now(),
          })
        }, 2000)
      } else {
        store.setLoading(store.activeSessionId, true)
      }
      send({ type: 'send_message', sessionId: store.activeSessionId, content })
    },
    [send, store],
  )

  const handlePermissionDecision = useCallback(
    (toolUseId: string, approved: boolean, alwaysAllow?: boolean) => {
      send({ type: 'permission_decision', toolUseId, approved, alwaysAllow })
    },
    [send],
  )

  const handleSetModel = useCallback(
    (model: string) => {
      if (!store.activeSessionId) return
      send({ type: 'set_model', sessionId: store.activeSessionId, model })
      updateSessionStatus(store.activeSessionId, { model })
    },
    [send, store.activeSessionId, updateSessionStatus],
  )

  const handleSetEffortLevel = useCallback(
    (level: EffortLevel) => {
      if (!store.activeSessionId) return
      setEffortBySession((prev) => ({ ...prev, [store.activeSessionId!]: level }))
      send({ type: 'set_effort_level', sessionId: store.activeSessionId, level })
    },
    [send, store.activeSessionId],
  )

  const handleGetSubagentMessages = useCallback(
    (sessionId: string, agentId: string) => {
      send({ type: 'get_subagent_messages', sessionId, agentId })
    },
    [send],
  )

  const handleRequestFiles = useCallback(
    (prefix: string) => {
      send({ type: 'list_files', prefix, sessionId: store.activeSessionId ?? undefined })
    },
    [send, store.activeSessionId],
  )

  const messages = store.activeSessionId
    ? store.messagesBySession[store.activeSessionId] ?? []
    : []
  const history = store.activeSessionId
    ? store.historyBySession[store.activeSessionId] ?? []
    : []
  const loading = store.activeSessionId
    ? store.loadingBySession[store.activeSessionId] ?? false
    : false
  const activeSession = store.sessions.find((s) => s.sessionId === store.activeSessionId)
  const sessionStatus = store.activeSessionId
    ? statusBySession[store.activeSessionId] ?? {}
    : {}
  const availableModels = store.activeSessionId
    ? (modelsBySession[store.activeSessionId] ?? globalModels)
    : []

  return (
    <div className="flex h-screen bg-white relative">
      {/* Sidebar expand button — fixed position, always visible when collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="absolute top-3 left-3 z-30 w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
          title="Show sidebar"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      )}
      <div
        style={sidebarCollapsed ? { width: 0 } : { width: sidebarWidth, minWidth: 180, maxWidth: 400 }}
        className="shrink-0 overflow-hidden transition-[width] duration-200"
      >
        <SessionList
          sessions={store.sessions}
          activeSessionId={store.activeSessionId}
          onSelect={handleSwitchSession}
          onCreate={handleCreateSession}
          connected={connected}
          onToggleCollapse={() => setSidebarCollapsed(true)}
          onClose={handleCloseSession}
          onRename={handleRenameSession}
        />
      </div>
      {!sidebarCollapsed && (
        <ResizeHandle
          onResize={(delta) => setSidebarWidth((w) => Math.min(400, Math.max(180, w + delta)))}
          side="right"
        />
      )}
      {/* Chat + Artifact split the remaining space */}
      <div ref={contentRef} className="flex-1 flex min-w-0 h-full overflow-hidden">
        <div style={artifact ? { flex: `${100 - artifactRatio} 1 0%` } : { flex: '1 1 0%' }} className="min-w-0 h-full">
          <ChatPanel
            messages={messages}
            history={history}
            loading={loading}
            onSend={handleSendMessage}
            activeSessionSummary={activeSession?.summary}
            onPermissionDecision={handlePermissionDecision}
            onSelectArtifact={(toolName, input, result) => setArtifact({ toolName, input, result })}
            activeSessionId={store.activeSessionId}
            sessionRunning={activeSession?.status === 'running'}
            onResume={handleResumeSession}
            sessionStatus={sessionStatus}
            availableModels={availableModels}
            onSetModel={handleSetModel}
            fileList={fileList}
            onRequestFiles={handleRequestFiles}
            commandList={commandList}
            onRename={handleRenameSession}
            onFork={handleForkSession}
            effortLevel={effortBySession[store.activeSessionId ?? ''] ?? 'medium'}
            onSetEffortLevel={handleSetEffortLevel}
            subagentMessages={subagentMessages}
            onGetSubagentMessages={handleGetSubagentMessages}
          />
        </div>
        {artifact && (
          <>
            <ResizeHandle
              onResize={(delta) => {
                const total = contentRef.current?.offsetWidth
                if (!total) return
                const pctDelta = (delta / total) * 100
                setArtifactRatio((r) => Math.min(80, Math.max(20, r - pctDelta)))
              }}
              side="left"
            />
            <div style={{ flex: `${artifactRatio} 1 0%` }} className="min-w-0 h-full">
              <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
            </div>
          </>
        )}
        {!artifact && (
          <ArtifactPanel artifact={null} onClose={() => {}} />
        )}
      </div>
      <NewSessionDialog
        open={showNewSessionDialog}
        defaultCwd={defaultCwd}
        availableModels={globalModels}
        onConfirm={handleConfirmNewSession}
        onCancel={() => setShowNewSessionDialog(false)}
        onRequestFiles={handleRequestFiles}
        fileList={fileList}
      />
    </div>
  )
}
