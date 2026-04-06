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
import { SettingsModal } from './components/SettingsModal'

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
  const [subagentMessages, setSubagentMessages] = useState<Record<string, ChatItem[]>>({})
  const [showSettings, setShowSettings] = useState(false)
  const [newSessionProjectCwd, setNewSessionProjectCwd] = useState<string | null>(null)
  const [currentSettings, setCurrentSettings] = useState<Record<string, unknown>>({})
  // Global model list: start with well-known models, replace with SDK list when available
  const [globalModels, setGlobalModels] = useState<ModelInfo[]>([
    { value: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', description: 'Fast and capable' },
    { value: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', description: 'Most capable' },
    { value: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', description: 'Fastest' },
  ])
  // Track locally-sent user messages to deduplicate SDK echoes
  const sentMessagesRef = useRef<Set<string>>(new Set())
  // Track cwd for pending session creation so we can attach it to the new session
  const pendingSessionCwdRef = useRef<string | null>(null)
  // Buffer permission_requests that arrive before their tool_use sdk_message
  const pendingPermissionsRef = useRef<Map<string, { permission: Record<string, unknown>; sessionId: string }>>(new Map())

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

        case 'session_created': {
          const cwd = pendingSessionCwdRef.current
          pendingSessionCwdRef.current = null
          store.addSession(data.sessionId as string, undefined, cwd ?? undefined)
          break
        }

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

          // Route subagent messages into SubAgentCard instead of main chat
          const parentToolUseId = (msg as Record<string, unknown>).parent_tool_use_id as string | null | undefined
          if (parentToolUseId) {
            const key = `${sessionId}:${parentToolUseId}`
            if (sdkType === 'assistant') {
              const message = msg.message as Record<string, unknown>
              const content = message.content as Array<Record<string, unknown>>
              const msgUuid = (msg as Record<string, unknown>).uuid as string | undefined
              for (const block of content) {
                if (block.type === 'text') {
                  setSubagentMessages(prev => ({
                    ...prev,
                    [key]: [...(prev[key] ?? []), { id: msgUuid ?? uuid(), type: 'assistant', content: block.text as string, timestamp: Date.now(), uuid: msgUuid }],
                  }))
                } else if (block.type === 'tool_use') {
                  const toolName = block.name as string
                  const toolId = block.id as string
                  const toolInput = block.input as Record<string, unknown>
                  // Check if a permission_request arrived before this tool_use
                  const pendingPerm = pendingPermissionsRef.current.get(toolId)
                  if (pendingPerm) pendingPermissionsRef.current.delete(toolId)
                  setSubagentMessages(prev => ({
                    ...prev,
                    [key]: [...(prev[key] ?? []), {
                      id: toolId, type: 'tool_use',
                      content: { name: toolName, input: toolInput, ...(pendingPerm?.permission ?? {}) },
                      timestamp: Date.now(), collapsed: true,
                      agentId: toolName === 'Agent' ? toolId : undefined,
                      toolInput,
                    }],
                  }))
                }
              }
            } else if (sdkType === 'user') {
              const message = msg.message as Record<string, unknown>
              const content = message.content as Array<Record<string, unknown>>
              for (const block of content) {
                if (block.type === 'tool_result') {
                  const toolUseId = block.tool_use_id as string
                  // Check if this is the Agent tool's own result (toolUseId === parentToolUseId)
                  // or a result for a tool inside the subagent
                  if (toolUseId === parentToolUseId) {
                    // This is the Agent tool's result — update main chat item
                    store.updateChatItem(sessionId, toolUseId, { content: { result: block.content } })
                  } else {
                    // Result for a tool inside the subagent
                    setSubagentMessages(prev => {
                      const items = prev[key]
                      if (!items) return prev
                      return {
                        ...prev,
                        [key]: items.map(it =>
                          it.id === toolUseId
                            ? { ...it, content: { ...(it.content as Record<string, unknown>), result: block.content } }
                            : it
                        ),
                      }
                    })
                  }
                }
              }
            }
            break
          }

          if (sdkType === 'assistant') {
            // Don't clear loading here — keep showing activity until 'result' arrives
            const message = msg.message as Record<string, unknown>
            const content = message.content as Array<Record<string, unknown>>
            const msgUuid = msg.uuid as string | undefined

            for (const block of content) {
              if (block.type === 'text') {
                const text = block.text as string
                // Render SDK interrupt markers as a friendly divider instead of raw text
                if (/^\[Request interrupted/.test(text)) {
                  store.addChatItem(sessionId, {
                    id: msgUuid ?? uuid(),
                    type: 'interrupt',
                    content: null,
                    timestamp: Date.now(),
                  })
                  continue
                }
                const item: ChatItem = {
                  id: msgUuid ?? uuid(),
                  type: 'assistant',
                  content: text,
                  timestamp: Date.now(),
                  uuid: msgUuid,
                }
                store.addChatItem(sessionId, item)
              } else if (block.type === 'tool_use') {
                const toolName = block.name as string
                const toolId = block.id as string
                const toolInput = block.input as Record<string, unknown>
                // Check if a permission_request arrived before this tool_use
                const pendingPerm = pendingPermissionsRef.current.get(toolId)
                if (pendingPerm) pendingPermissionsRef.current.delete(toolId)
                const item: ChatItem = {
                  id: toolId,
                  type: 'tool_use',
                  content: { name: toolName, input: toolInput, ...(pendingPerm?.permission ?? {}) },
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
                // Skip system-injected prompts (skill content, system reminders, etc.)
                if (/<system-reminder>|<EXTREMELY_IMPORTANT>|<skill-name>|<command-name>/.test(text) && text.length > 500) {
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
            const permissionContent = {
              permission: {
                status: 'pending' as const,
                title: data.title as string | undefined,
                description: data.description as string | undefined,
                hasSuggestions: data.hasSuggestions as boolean | undefined,
                suggestions: data.suggestions as import('./types').PermissionSuggestion[] | undefined,
              },
            }
            const toolUseId = data.toolUseId as string
            // Try main chat items
            store.updateChatItem(sessionId, toolUseId, { content: permissionContent })
            // Also try subagent messages (tool_use may be stored there instead)
            let foundInSubagent = false
            setSubagentMessages(prev => {
              for (const [key, items] of Object.entries(prev)) {
                if (!key.startsWith(`${sessionId}:`)) continue
                const idx = items.findIndex(it => it.id === toolUseId)
                if (idx !== -1) {
                  foundInSubagent = true
                  const updated = [...items]
                  const item = updated[idx]
                  updated[idx] = {
                    ...item,
                    content: { ...(item.content as Record<string, unknown>), ...permissionContent },
                  }
                  return { ...prev, [key]: updated }
                }
              }
              return prev
            })
            // If tool_use hasn't arrived yet (SDK calls canUseTool before yielding
            // the assistant message to the stream), buffer it for later
            if (!foundInSubagent) {
              const mainItems = store.messagesBySession[sessionId] ?? []
              if (!mainItems.find(it => it.id === toolUseId)) {
                pendingPermissionsRef.current.set(toolUseId, { permission: permissionContent, sessionId })
              }
            }
          }
          break
        }

        case 'session_history': {
          const sessionId = data.sessionId as string
          const messages = data.messages as Array<Record<string, unknown>>
          const items: ChatItem[] = []
          // Map tool_use IDs to items so we can attach tool_results later
          const toolUseMap = new Map<string, ChatItem>()
          // Subagent messages grouped by parent_tool_use_id
          const subagentItems = new Map<string, ChatItem[]>()
          const subagentToolUseMap = new Map<string, ChatItem>()

          for (const msg of messages) {
            const msgType = msg.type as string
            const message = msg.message as Record<string, unknown> | undefined
            if (!message) continue
            const parentId = msg.parent_tool_use_id as string | null | undefined

            if (msgType === 'assistant') {
              const content = message.content as Array<Record<string, unknown>> | undefined
              if (!content) continue
              const msgUuid = msg.uuid as string | undefined
              for (const block of content) {
                if (block.type === 'text') {
                  const item: ChatItem = {
                    id: msgUuid ?? uuid(),
                    type: 'assistant',
                    content: block.text as string,
                    timestamp: 0,
                    uuid: msgUuid,
                  }
                  if (parentId) {
                    const arr = subagentItems.get(parentId) ?? []
                    arr.push(item)
                    subagentItems.set(parentId, arr)
                  } else {
                    items.push(item)
                  }
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
                  if (parentId) {
                    const arr = subagentItems.get(parentId) ?? []
                    arr.push(item)
                    subagentItems.set(parentId, arr)
                    subagentToolUseMap.set(toolId, item)
                  } else {
                    items.push(item)
                    toolUseMap.set(toolId, item)
                  }
                }
              }
            } else if (msgType === 'system' && (msg as Record<string, unknown>).subtype === 'local_command_output') {
              if (!parentId) {
                items.push({
                  id: (msg as Record<string, unknown>).uuid as string ?? uuid(),
                  type: 'assistant',
                  content: (msg as Record<string, unknown>).content as string,
                  timestamp: 0,
                })
              }
            } else if (msgType === 'user') {
              const content = message.content
              if (!parentId && typeof content === 'string') {
                items.push({
                  id: uuid(),
                  type: 'user',
                  content,
                  timestamp: 0,
                })
              } else if (Array.isArray(content)) {
                for (const block of content as Array<Record<string, unknown>>) {
                  if (block.type === 'text' && !parentId) {
                    items.push({
                      id: uuid(),
                      type: 'user',
                      content: block.text as string,
                      timestamp: 0,
                    })
                  } else if (block.type === 'tool_result') {
                    const toolUseId = block.tool_use_id as string
                    // Check subagent tool_use first, then main
                    const toolItem = subagentToolUseMap.get(toolUseId) ?? toolUseMap.get(toolUseId)
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
          // Merge subagent history into subagentMessages state
          if (subagentItems.size > 0) {
            setSubagentMessages(prev => {
              const updated = { ...prev }
              for (const [parentId, msgs] of subagentItems) {
                updated[`${sessionId}:${parentId}`] = msgs
              }
              return updated
            })
          }
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
          // Remap subagent messages (keys are `${sessionId}:${agentId}`)
          setSubagentMessages((prev) => {
            const tempPrefix = `${data.tempId as string}:`
            const hasTemp = Object.keys(prev).some((k) => k.startsWith(tempPrefix))
            if (!hasTemp) return prev
            const updated: Record<string, ChatItem[]> = {}
            for (const [key, value] of Object.entries(prev)) {
              if (key.startsWith(tempPrefix)) {
                updated[`${data.sessionId as string}:${key.slice(tempPrefix.length)}`] = value
              } else {
                updated[key] = value
              }
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
          const decidedContent = { permission: { status: approved ? 'approved' as const : 'denied' as const } }
          // Try main chat items
          for (const [sessionId, items] of Object.entries(store.messagesBySession)) {
            if (items.find((i) => i.id === toolUseId)) {
              store.updateChatItem(sessionId, toolUseId, { content: decidedContent })
              break
            }
          }
          // Also try subagent messages
          setSubagentMessages(prev => {
            for (const [key, items] of Object.entries(prev)) {
              const idx = items.findIndex(it => it.id === toolUseId)
              if (idx !== -1) {
                const updated = [...items]
                const item = updated[idx]
                updated[idx] = {
                  ...item,
                  content: { ...(item.content as Record<string, unknown>), ...decidedContent },
                }
                return { ...prev, [key]: updated }
              }
            }
            return prev
          })
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
          store.addSession(newSessionId, 'idle')
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
          const sid = (data.sessionId as string | undefined) ?? store.activeSessionId ?? ''
          const key = `${sid}:${agentId}`
          // Convert SDK SessionMessage format to ChatItem[]
          // SDK format: { type: 'assistant'|'user', message: { content: [...] }, uuid, ... }
          const items: ChatItem[] = []
          for (const raw of agentMsgs) {
            const m = raw as Record<string, unknown>
            const msgType = m.type as string
            const message = m.message as Record<string, unknown> | undefined
            if (!message) continue
            const content = message.content as Array<Record<string, unknown>> | undefined
            if (!Array.isArray(content)) continue
            const msgUuid = m.uuid as string | undefined
            for (const block of content) {
              if (block.type === 'text' && msgType === 'assistant') {
                items.push({ id: msgUuid ?? uuid(), type: 'assistant', content: block.text as string, timestamp: 0, uuid: msgUuid })
              } else if (block.type === 'tool_use') {
                const toolName = block.name as string
                const toolId = block.id as string
                const toolInput = block.input as Record<string, unknown>
                items.push({
                  id: toolId, type: 'tool_use',
                  content: { name: toolName, input: toolInput },
                  timestamp: 0, collapsed: true,
                  agentId: toolName === 'Agent' ? toolId : undefined,
                  toolInput,
                })
              } else if (block.type === 'tool_result') {
                const toolUseId = block.tool_use_id as string
                const existing = items.find(it => it.id === toolUseId)
                if (existing) {
                  existing.content = { ...(existing.content as Record<string, unknown>), result: block.content }
                }
              }
            }
          }
          setSubagentMessages(prev => {
            // Don't overwrite live-streamed messages with an empty fetch result
            if (items.length === 0 && prev[key]?.length) return prev
            return { ...prev, [key]: items }
          })
          break
        }

        case 'elicitation_request': {
          const sessionId = (data.sessionId as string | undefined) ?? store.activeSessionId
          if (sessionId) {
            const item: ChatItem = {
              id: data.id as string,
              type: 'elicitation',
              content: 'elicitation' as unknown,
              timestamp: Date.now(),
              serverName: data.serverName as string,
              elicitationMessage: data.message as string,
              mode: data.mode as string | undefined,
              requestedSchema: data.requestedSchema as Record<string, unknown> | undefined,
              url: data.url as string | undefined,
            }
            store.addChatItem(sessionId, item)
          }
          break
        }

        case 'session_settings':
          setCurrentSettings(data.settings as Record<string, unknown>)
          setShowSettings(true)
          break

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

  const handleCreateSession = useCallback((projectCwd?: string) => {
    setNewSessionProjectCwd(projectCwd ?? null)
    setShowNewSessionDialog(true)
  }, [])

  const handleOpenDirectory = useCallback(() => {
    setNewSessionProjectCwd(null)
    setShowNewSessionDialog(true)
  }, [])

  const handleConfirmNewSession = useCallback(
    (cwd: string, model?: string, permissionMode?: string, executableArgs?: string[], env?: Record<string, string>) => {
      setShowNewSessionDialog(false)
      pendingSessionCwdRef.current = cwd
      send({
        type: 'create_session',
        options: {
          cwd,
          ...(model ? { model } : {}),
          ...(permissionMode ? { permissionMode } : {}),
          ...(executableArgs?.length ? { executableArgs } : {}),
          ...(env && Object.keys(env).length ? { env } : {}),
        },
      })
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

  const handleInterruptSession = useCallback(
    (sessionId: string) => {
      send({ type: 'interrupt_session', sessionId })
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
    (toolUseId: string, approved: boolean, alwaysAllow?: boolean, updatedPermissions?: import('./types').PermissionSuggestion[]) => {
      send({ type: 'permission_decision', toolUseId, approved, alwaysAllow, updatedPermissions })
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

  const handleOpenSettings = useCallback(() => {
    if (!store.activeSessionId) return
    send({ type: 'get_session_settings', sessionId: store.activeSessionId })
    // The modal opens when session_settings response arrives
  }, [store.activeSessionId, send])

  const handleElicitationResponse = useCallback(
    (id: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown>) => {
      send({ type: 'elicitation_response', id, action, content })
      // Find which session owns this elicitation item and mark it resolved
      for (const [sessionId, items] of Object.entries(store.messagesBySession)) {
        if (items.find((i) => i.id === id)) {
          store.updateChatItem(sessionId, id, { resolved: true, resolvedAction: action })
          break
        }
      }
    },
    [send, store],
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
          defaultCwd={defaultCwd}
          onOpenDirectory={handleOpenDirectory}
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
            onElicitationResponse={handleElicitationResponse}
            onOpenSettings={handleOpenSettings}
            onInterrupt={handleInterruptSession}
          />
        </div>
        {artifact && (
          <>
            <ResizeHandle
              onResize={(delta) => {
                const total = contentRef.current?.offsetWidth
                if (!total) return
                const pctDelta = (delta / total) * 100
                setArtifactRatio((r) => Math.min(80, Math.max(20, r + pctDelta)))
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
        projectCwd={newSessionProjectCwd}
        availableModels={globalModels}
        onConfirm={handleConfirmNewSession}
        onCancel={() => setShowNewSessionDialog(false)}
        onRequestFiles={handleRequestFiles}
        fileList={fileList}
      />
      {showSettings && (
        <SettingsModal
          settings={currentSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
