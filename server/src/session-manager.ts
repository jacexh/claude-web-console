import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  listSessions,
  getSessionMessages,
  getSubagentMessages as sdkGetSubagentMessages,
  renameSession as sdkRenameSession,
  forkSession as sdkForkSession,
  getSessionInfo,
  type SDKSession,
  type SDKSessionOptions,
  type SDKMessage,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk'
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { FastifyBaseLogger } from 'fastify'
import type { SessionInfo, EffortLevel } from './types.js'

type PermissionResolver = {
  resolve: (approved: boolean, reason?: string, updatedPermissions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[]) => void
  sessionId: string
  suggestions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[]
}

type ElicitationResult = {
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, string | number | boolean | string[]>
}

export type PermissionMeta = {
  agentId?: string
  title?: string
  description?: string
  hasSuggestions?: boolean
  suggestions?: unknown[]
}

export type SessionListener = {
  id: string
  onMessage: (sessionId: string, msg: SDKMessage) => void
  onPermissionRequest: (sessionId: string, toolUseId: string, toolName: string, input: Record<string, unknown>, meta: PermissionMeta) => void
  onEnd: (sessionId: string) => void
}

// Strip inherited Claude Code env vars to prevent SDK from connecting
// to the parent CC session instead of spawning a fresh process
function cleanEnv(cwd?: string): Record<string, string | undefined> {
  const env = { ...process.env }
  delete env.CLAUDE_CODE_SSE_PORT
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  if (cwd) {
    env.CC_CLAUDE_CWD = cwd
  }
  return env
}

const CLAUDE_EXECUTABLE = process.env.CLAUDE_PATH ?? 'claude'
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')

// Read ~/.claude/settings.json and resolve enabled plugins to local --plugin-dir paths
function getPluginDirArgs(): string[] {
  try {
    const settings = JSON.parse(readFileSync(join(CLAUDE_DIR, 'settings.json'), 'utf-8'))
    const enabled = settings.enabledPlugins as Record<string, boolean> | undefined
    if (!enabled) return []
    const args: string[] = []
    const pluginsBase = join(CLAUDE_DIR, 'plugins')
    for (const [key, value] of Object.entries(enabled)) {
      if (!value) continue
      // key format: "plugin-name@marketplace-id"
      const atIdx = key.indexOf('@')
      if (atIdx === -1) continue
      const pluginName = key.slice(0, atIdx)
      const marketplaceId = key.slice(atIdx + 1)
      // Try marketplace subdirs: plugins/, external_plugins/, then root
      const candidates = [
        join(pluginsBase, 'marketplaces', marketplaceId, 'plugins', pluginName),
        join(pluginsBase, 'marketplaces', marketplaceId, 'external_plugins', pluginName),
        join(pluginsBase, 'marketplaces', marketplaceId, pluginName),
      ]
      let resolved = candidates.find((p) => { try { return statSync(p).isDirectory() } catch { return false } })
      // Fallback to cache: pick the latest version directory
      if (!resolved) {
        const cacheDir = join(pluginsBase, 'cache', marketplaceId, pluginName)
        try {
          const versions = readdirSync(cacheDir).sort()
          if (versions.length > 0) {
            resolved = join(cacheDir, versions[versions.length - 1])
          }
        } catch { /* no cache entry */ }
      }
      if (resolved) {
        args.push('--plugin-dir', resolved)
      }
    }
    return args
  } catch {
    return []
  }
}

/** Check if a session is being used by an external process (e.g. CLI) */
function isSessionLockedExternally(sessionId: string): boolean {
  const sessionsDir = join(CLAUDE_DIR, 'sessions')
  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'))
        if (data.sessionId !== sessionId) continue
        const pid = data.pid as number
        // Check if process is still alive
        try { process.kill(pid, 0); return true } catch { /* dead process, stale lock */ }
      } catch { /* skip malformed files */ }
    }
  } catch { /* sessions dir doesn't exist */ }
  return false
}

const optionsDir = join(CLAUDE_DIR, 'claude-web-console')

type SessionCreationOptions = {
  model?: string
  permissionMode?: string
  executableArgs?: string[]
  env?: Record<string, string>
}

function saveSessionOptions(sessionId: string, opts: SessionCreationOptions): void {
  try {
    mkdirSync(optionsDir, { recursive: true })
    writeFileSync(join(optionsDir, `${sessionId}.options.json`), JSON.stringify(opts))
  } catch { /* best-effort */ }
}

function loadSessionOptions(sessionId: string): SessionCreationOptions | undefined {
  try {
    return JSON.parse(readFileSync(join(optionsDir, `${sessionId}.options.json`), 'utf-8'))
  } catch { return undefined }
}

export class SessionManager {
  private log: FastifyBaseLogger
  private sessions = new Map<string, SDKSession>()
  private pendingPermissions = new Map<string, PermissionResolver>()
  private pendingElicitations = new Map<string, { resolve: (result: ElicitationResult) => void; sessionId: string }>()
  private runningSessionIds = new Set<string>()
  private closedSessionIds = new Set<string>()
  private streamingSessionIds = new Set<string>()
  private sessionListeners = new Map<string, Set<SessionListener>>()
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingRemaps = new Map<string, { sessionIdRef: { current: string } }>()
  // Track cwd for each session so we can resume in the correct project
  private sessionCwds = new Map<string, string>()
  /** User-supplied creation options that must survive resume cycles */
  private sessionCreationOptions = new Map<string, SessionCreationOptions>()
  // Cache commands extracted from SDK init messages
  private sessionCommands = new Map<string, { name: string; description: string }[]>()
  // Active stream (Query) references for control requests like setModel
  private activeQueries = new Map<string, AsyncGenerator<SDKMessage, void>>()
  // Track current model and effort level per session for multi-client sync
  private sessionModels = new Map<string, string>()
  private sessionEffortLevels = new Map<string, EffortLevel>()

  constructor(log: FastifyBaseLogger) {
    this.log = log
  }

  // --- Pub/Sub methods ---

  subscribe(sessionId: string, listener: SessionListener): void {
    let listeners = this.sessionListeners.get(sessionId)
    if (!listeners) {
      listeners = new Set()
      this.sessionListeners.set(sessionId, listeners)
    }
    // Deduplicate by listener.id: remove existing listener with same id
    for (const existing of listeners) {
      if (existing.id === listener.id) {
        listeners.delete(existing)
        break
      }
    }
    listeners.add(listener)

    // Cancel any pending idle timer since we now have a listener
    const timer = this.idleTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionId)
    }
  }

  unsubscribe(sessionId: string, listenerId: string): void {
    const listeners = this.sessionListeners.get(sessionId)
    if (!listeners) return
    for (const l of listeners) {
      if (l.id === listenerId) {
        listeners.delete(l)
        break
      }
    }
    if (listeners.size === 0) {
      this.denyOrphanedPending(sessionId)
      this.scheduleIdleClose(sessionId)
    }
  }

  unsubscribeAll(listenerId: string): void {
    for (const [sessionId, listeners] of this.sessionListeners) {
      for (const l of listeners) {
        if (l.id === listenerId) {
          listeners.delete(l)
          break
        }
      }
      if (listeners.size === 0) {
        this.denyOrphanedPending(sessionId)
        this.scheduleIdleClose(sessionId)
      }
    }
  }

  /** Deny all pending permissions/elicitations for a session when no listeners remain */
  private denyOrphanedPending(sessionId: string): void {
    for (const [id, entry] of this.pendingPermissions) {
      if (entry.sessionId === sessionId) {
        this.log.warn({ sessionId, toolUseId: id }, 'Denying orphaned permission (no listeners)')
        entry.resolve(false, 'All listeners disconnected')
        this.pendingPermissions.delete(id)
      }
    }
    for (const [id, entry] of this.pendingElicitations) {
      if (entry.sessionId === sessionId) {
        entry.resolve({ action: 'cancel' })
        this.pendingElicitations.delete(id)
      }
    }
  }

  private broadcast(sessionId: string, fn: (listener: SessionListener) => void): void {
    const listeners = this.sessionListeners.get(sessionId)
    if (!listeners || listeners.size === 0) {
      this.log.warn({ sessionId }, 'Broadcast: no listeners')
      return
    }
    for (const l of listeners) {
      try { fn(l) } catch (err) {
        this.log.error({ err, sessionId }, 'Listener error')
      }
    }
  }

  private scheduleIdleClose(sessionId: string): void {
    // Don't schedule if there's already a timer
    if (this.idleTimers.has(sessionId)) return
    const timer = setTimeout(() => {
      this.idleTimers.delete(sessionId)
      // Only close if still zero listeners
      const listeners = this.sessionListeners.get(sessionId)
      if (!listeners || listeners.size === 0) {
        this.closeSession(sessionId)
      }
    }, 60_000) // 1 minute
    this.idleTimers.set(sessionId, timer)
  }

  // --- Core methods ---

  private buildOnElicitation(sessionIdRef: { current: string }) {
    return async (request: { serverName: string; message: string; mode?: string; url?: string; requestedSchema?: Record<string, unknown> }, _options: { signal: AbortSignal }): Promise<ElicitationResult> => {
      const id = `elicit-${Date.now()}-${Math.random().toString(36).slice(2)}`
      return new Promise<ElicitationResult>((resolve) => {
        this.pendingElicitations.set(id, { resolve, sessionId: sessionIdRef.current })
        this.broadcast(sessionIdRef.current, (l) => l.onMessage(sessionIdRef.current, {
          type: 'elicitation_request',
          id,
          serverName: request.serverName,
          message: request.message,
          mode: request.mode,
          requestedSchema: request.requestedSchema,
          url: request.url,
        } as unknown as SDKMessage))
      })
    }
  }

  private buildCanUseTool(
    sessionIdRef: { current: string },
  ): SDKSessionOptions['canUseTool'] {
    return async (toolName, input, { toolUseID, agentID, suggestions, title, description }) => {
      // Auto-allow non-dangerous tools that don't need user approval
      const autoAllow = new Set(['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])
      if (autoAllow.has(toolName)) {
        this.log.info({ toolName, toolUseID, agentID }, 'canUseTool: auto-allowed')
        return { behavior: 'allow' as const, updatedInput: input as Record<string, unknown> }
      }

      const sessionId = sessionIdRef.current
      this.log.info({ toolName, toolUseID, agentID, sessionId, hasSuggestions: (suggestions?.length ?? 0) > 0 }, 'canUseTool: awaiting permission')

      // AskUserQuestion: keep canUseTool pending (SDK waits for answer)
      // but don't send permission_request (no PermissionCard).
      // The user's answer comes via resolvePermission() from the frontend.
      const isQuestion = toolName === 'AskUserQuestion'

      return new Promise<PermissionResult>((resolve) => {
        this.pendingPermissions.set(toolUseID, {
          resolve: (approved: boolean, reason?: string, updatedPermissions?) => {
            this.log.info({ toolName, toolUseID, approved, reason }, 'canUseTool: resolved')
            if (approved) {
              resolve({
                behavior: 'allow',
                updatedInput: input as Record<string, unknown>,
                ...(updatedPermissions ? { updatedPermissions } : {}),
              })
            } else {
              resolve({ behavior: 'deny', message: reason ?? 'User denied' })
            }
          },
          sessionId,
          suggestions,
        })
        // Only send permission_request for real permission prompts, not questions
        if (!isQuestion) {
          const listeners = this.sessionListeners.get(sessionId)
          this.log.info({ toolUseID, toolName, sessionId, listenerCount: listeners?.size ?? 0 }, 'canUseTool: broadcasting permission_request')
          this.broadcast(sessionId, (l) =>
            l.onPermissionRequest(sessionId, toolUseID, toolName, input as Record<string, unknown>, {
              agentId: agentID,
              title,
              description,
              hasSuggestions: (suggestions?.length ?? 0) > 0,
              suggestions: suggestions as unknown[] | undefined,
            }),
          )
        }
      })
    }
  }

  async createSession(
    options?: { model?: string; cwd?: string; permissionMode?: string; executableArgs?: string[]; env?: Record<string, string> },
  ): Promise<string> {
    const cwd = options?.cwd ?? process.env.CC_WEB_CONSOLE_CWD ?? process.env.HOME ?? '/'
    const sessionIdRef = { current: '' }
    const pluginArgs = getPluginDirArgs()
    const userArgs = options?.executableArgs ?? []
    const sessionOptions = {
      ...(options?.model ? { model: options.model } : {}),
      permissionMode: options?.permissionMode ?? 'default',
      canUseTool: this.buildCanUseTool(sessionIdRef),
      onElicitation: this.buildOnElicitation(sessionIdRef),
      env: { ...cleanEnv(cwd), ...options?.env },
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      executableArgs: [...pluginArgs, ...userArgs],
    } as SDKSessionOptions

    const originalCwd = process.cwd()
    try { process.chdir(cwd) } catch { /* ignore */ }
    const session = unstable_v2_createSession(sessionOptions)
    try { process.chdir(originalCwd) } catch { /* ignore */ }

    // New sessions need send() before sessionId is available.
    // Use a temporary ID, then remap when real sessionId arrives.
    const tempId = `pending-${Date.now()}`
    this.sessions.set(tempId, session)
    this.sessionCwds.set(tempId, cwd)
    this.sessionCreationOptions.set(tempId, {
      model: options?.model,
      permissionMode: options?.permissionMode,
      executableArgs: options?.executableArgs,
      env: options?.env,
    })

    // Store tempId in pendingRemaps for remap inside consumeStream
    this.pendingRemaps.set(tempId, { sessionIdRef })

    // For new sessions, start stream immediately — SDK may emit init messages
    this.startStreamConsumer(tempId, session)

    return tempId
  }

  private fetchAndBroadcastModels(sessionId: string, session: SDKSession, currentModel?: string): void {
    const query = (session as unknown as { query: { supportedModels(): Promise<{ value: string; displayName: string; description: string }[]> } }).query
    if (!query?.supportedModels) return
    query.supportedModels().then((models) => {
      if (models.length > 0) {
        if (currentModel) {
          this.sessionModels.set(sessionId, currentModel)
        }
        this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
          type: 'models_updated', models, currentModel,
        } as unknown as SDKMessage))
      }
    }).catch((err) => {
      this.log.error({ err, sessionId }, 'Failed to fetch models')
    })
  }

  private startStreamConsumer(
    sessionId: string,
    session: SDKSession,
  ): void {
    if (this.streamingSessionIds.has(sessionId)) return
    this.streamingSessionIds.add(sessionId)
    this.consumeStream(sessionId, session)
  }

  private async consumeStream(
    initialSessionId: string,
    session: SDKSession,
  ): Promise<void> {
    // Track the current sessionId — may change from tempId to real sessionId
    let currentSessionId = initialSessionId
    let modelsFetched = false

    try {
      // SDK's stream() ends after each turn (on "result" message).
      // Loop to re-enter stream() for subsequent turns.
      while (true) {
        this.log.info({ sessionId: currentSessionId }, 'consumeStream: entering stream()')
        const query = session.stream()
        // Store query reference so control requests (setModel etc.) can use it
        try {
          const sid = session.sessionId
          this.activeQueries.set(sid, query)
        } catch { /* sessionId not yet available, will set after remap */ }

        for await (const msg of query) {
          const msgAny = msg as Record<string, unknown>
          this.log.info({
            type: msgAny.type,
            subtype: msgAny.subtype,
            parentToolUseId: msgAny.parent_tool_use_id,
            sessionId: currentSessionId,
            message: JSON.stringify(msg).slice(0, 50),
          }, 'Stream message received')

          // Fetch models once after stream is active (works for both new and resumed sessions)
          if (!modelsFetched) {
            modelsFetched = true
            try {
              const sid = session.sessionId
              // Update query ref now that sessionId is available
              this.activeQueries.set(sid, query)
              this.fetchAndBroadcastModels(sid, session, (msgAny.type === 'system' && msgAny.subtype === 'init') ? (msgAny.model as string) : undefined)
            } catch { /* session not yet initialized */ }
          }

          // Extract commands from init message, then enrich with full descriptions
          if (msgAny.type === 'system' && msgAny.subtype === 'init') {
            try {
              const sid = session.sessionId
              const slashCmds = (msgAny.slash_commands as string[]) ?? []
              const skills = (msgAny.skills as string[]) ?? []
              const allNames = new Set([...slashCmds, ...skills])
              // Set basic cache immediately so getCommands() doesn't return empty
              this.sessionCommands.set(sid, Array.from(allNames).map((name) => ({
                name,
                description: skills.includes(name) ? 'skill' : '',
              })))
              // Async: fetch full descriptions from supportedCommands()
              const q = (session as unknown as { query: { supportedCommands(): Promise<{ name: string; description: string }[]> } }).query
              q?.supportedCommands()?.then((cmds: { name: string; description: string }[]) => {
                if (cmds.length > 0) {
                  // Merge: use supportedCommands descriptions, but keep init-only skills that supportedCommands missed
                  const cmdMap = new Map(cmds.map((c) => [c.name, c]))
                  const existing = this.sessionCommands.get(sid) ?? []
                  for (const prev of existing) {
                    if (!cmdMap.has(prev.name)) {
                      cmdMap.set(prev.name, prev)
                    }
                  }
                  this.sessionCommands.set(sid, Array.from(cmdMap.values()))
                  // Notify via broadcast so ws-handler can push updated list
                  this.broadcast(sid, (l) => l.onMessage(sid, { type: 'commands_updated' } as unknown as SDKMessage))
                }
              }).catch(() => {})
            } catch { /* session not yet initialized */ }
          }
          if (msgAny.type === 'result') {
            if (msgAny.is_error) {
              this.log.error({ result: JSON.stringify(msg).slice(0, 500) }, 'SDK error result')
            } else {
              this.log.info({ cost: (msgAny as Record<string, unknown>).total_cost_usd }, 'Turn complete')
            }
          }

          let sessionId: string
          try {
            sessionId = session.sessionId
          } catch {
            continue
          }

          // Remap tempId → real sessionId (O(1) lookup)
          const remap = this.pendingRemaps.get(initialSessionId)
          if (remap && remap.sessionIdRef.current === '' && sessionId && !sessionId.startsWith('pending-')) {
            remap.sessionIdRef.current = sessionId
            const tempId = initialSessionId
            // Move session, cwd, listeners, streaming from tempId to real sessionId
            const s = this.sessions.get(tempId)
            if (s) { this.sessions.delete(tempId); this.sessions.set(sessionId, s) }
            const c = this.sessionCwds.get(tempId)
            if (c) { this.sessionCwds.delete(tempId); this.sessionCwds.set(sessionId, c) }
            const opts = this.sessionCreationOptions.get(tempId)
            if (opts) { this.sessionCreationOptions.delete(tempId); this.sessionCreationOptions.set(sessionId, opts); saveSessionOptions(sessionId, opts) }
            const listeners = this.sessionListeners.get(tempId)
            if (listeners) { this.sessionListeners.delete(tempId); this.sessionListeners.set(sessionId, listeners) }
            this.streamingSessionIds.delete(tempId)
            this.streamingSessionIds.add(sessionId)
            const q = this.activeQueries.get(tempId)
            if (q) { this.activeQueries.delete(tempId); this.activeQueries.set(sessionId, q) }
            this.pendingRemaps.delete(tempId)
            // Update our tracking variable
            currentSessionId = sessionId
            // Notify listeners of the remap
            this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
              type: 'session_id_resolved', tempId, sessionId,
            } as unknown as SDKMessage))
          }

          this.runningSessionIds.add(sessionId)
          this.broadcast(sessionId, (l) => l.onMessage(sessionId, msg))
        }
        this.log.info({ sessionId: currentSessionId }, 'consumeStream: stream() ended (turn complete)')
        // Check if session was closed while we were streaming
        let sessionId: string
        try { sessionId = session.sessionId } catch { break }
        if (this.closedSessionIds.has(sessionId)) break
        // Wait briefly before re-entering stream() for next turn
        await new Promise((r) => setTimeout(r, 50))
      }
    } catch (err) {
      // AbortError is expected when session is closed
      if (!(err instanceof Error && err.name === 'AbortError')) {
        this.log.error({ err }, 'Stream error')
      }
    } finally {
      try {
        const sessionId = session.sessionId
        this.runningSessionIds.delete(sessionId)
        this.streamingSessionIds.delete(sessionId)
        this.activeQueries.delete(sessionId)
        // Clean up stale session object if stream ended unexpectedly (not via explicit closeSession).
        // Without this, the session stays in this.sessions (appears "already running")
        // while runningSessionIds shows it as idle — making resume impossible.
        if (this.sessions.has(sessionId) && !this.closedSessionIds.has(sessionId)) {
          const s = this.sessions.get(sessionId)
          this.sessions.delete(sessionId)
          try { s?.close() } catch { /* already closed */ }
        }
        this.broadcast(sessionId, (l) => l.onEnd(sessionId))
      } catch {
        // Session never initialized — try with our tracked id
        this.runningSessionIds.delete(currentSessionId)
        this.streamingSessionIds.delete(currentSessionId)
        this.activeQueries.delete(currentSessionId)
        if (this.sessions.has(currentSessionId) && !this.closedSessionIds.has(currentSessionId)) {
          const s = this.sessions.get(currentSessionId)
          this.sessions.delete(currentSessionId)
          try { s?.close() } catch { /* already closed */ }
        }
        this.broadcast(currentSessionId, (l) => l.onEnd(currentSessionId))
      }
    }
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  async getCommands(sessionId: string): Promise<{ name: string; description: string }[]> {
    // Try cached commands from init message first
    const cached = this.sessionCommands.get(sessionId)
    if (cached && cached.length > 0) return cached

    // Fallback to SDK API
    const session = this.sessions.get(sessionId)
    if (!session) return []
    try {
      const query = (session as unknown as { query: { supportedCommands(): Promise<{ name: string; description: string }[]> } }).query
      if (!query?.supportedCommands) return []
      const commands = await query.supportedCommands()
      if (commands.length > 0) {
        this.sessionCommands.set(sessionId, commands)
      }
      return commands
    } catch {
      return []
    }
  }

  async getSupportedModels(sessionId: string): Promise<{ value: string; displayName: string; description: string }[]> {
    const session = this.sessions.get(sessionId)
    if (!session) return []
    try {
      const query = (session as unknown as { query: { supportedModels(): Promise<{ value: string; displayName: string; description: string }[]> } }).query
      if (!query?.supportedModels) return []
      return await query.supportedModels()
    } catch {
      return []
    }
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    // setModel lives on the internal Query object (session.query), not on SDKSession itself
    const query = (session as unknown as { query: { setModel(model?: string): Promise<void> } }).query
    if (!query?.setModel) {
      throw new Error(`Session ${sessionId} does not support model switching`)
    }
    await query.setModel(model)
    this.sessionModels.set(sessionId, model)
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'model_changed', sessionId, model,
    } as unknown as SDKMessage))
  }

  async setEffortLevel(sessionId: string, level: EffortLevel): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    // applyFlagSettings lives on the internal Query object (session.query)
    const query = (session as unknown as { query: { applyFlagSettings(settings: { effort?: EffortLevel }): Promise<void> } }).query
    if (!query?.applyFlagSettings) {
      throw new Error(`Session ${sessionId} does not support effort level`)
    }
    await query.applyFlagSettings({ effort: level })
    this.sessionEffortLevels.set(sessionId, level)
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'effort_level_changed', sessionId, level,
    } as unknown as SDKMessage))
  }

  getSessionState(sessionId: string): { model?: string; effortLevel?: EffortLevel } {
    return {
      model: this.sessionModels.get(sessionId),
      effortLevel: this.sessionEffortLevels.get(sessionId),
    }
  }

  async interruptSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    const query = (session as unknown as { query: { interrupt(): Promise<void> } }).query
    if (!query?.interrupt) {
      throw new Error(`Session ${sessionId} does not support interrupt`)
    }
    this.log.info({ sessionId }, 'Interrupting session')
    await query.interrupt()
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
    this.log.info({ sessionId, content: content.slice(0, 50) }, 'sendMessage: sending to SDK')
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Broadcast user message to all listeners so other connections can see it.
    // The sender deduplicates on the client side via sentMessagesRef.
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: content }] },
    } as unknown as SDKMessage))

    // Send first, THEN start stream consumer.
    // This ensures the SDK turn is queued before stream() is entered,
    // avoiding the race where stream() completes immediately (no active turn)
    // and the 50ms re-entry gap causes the turn response to be lost.
    await session.send(content)

    this.startStreamConsumer(sessionId, session)
  }

  resolvePermission(toolUseId: string, approved: boolean, reason?: string, alwaysAllow?: boolean, clientPermissions?: unknown[]): void {
    const pending = this.pendingPermissions.get(toolUseId)
    if (!pending) {
      this.log.warn({ toolUseId }, 'resolvePermission: no pending permission found')
      return
    }
    // Use client-edited permissions if provided, otherwise fall back to SDK suggestions
    const updatedPermissions = (approved && alwaysAllow)
      ? ((clientPermissions as import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[] | undefined) ?? pending.suggestions)
      : undefined
    this.log.info({
      toolUseId,
      approved,
      alwaysAllow,
      sessionId: pending.sessionId,
      updatedPermissions: JSON.stringify(updatedPermissions)?.slice(0, 200),
    }, 'resolvePermission')
    pending.resolve(approved, reason, updatedPermissions)
    this.pendingPermissions.delete(toolUseId)

    // Broadcast permission decision to all listeners
    this.broadcast(pending.sessionId, (l) => l.onMessage(pending.sessionId, {
      type: 'permission_decided', toolUseId, approved,
    } as unknown as SDKMessage))
  }

  resolveElicitation(id: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown>): void {
    const pending = this.pendingElicitations.get(id)
    if (!pending) return
    this.pendingElicitations.delete(id)
    pending.resolve({ action, content: content as ElicitationResult['content'] })
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sessions = await listSessions()
    // Cache cwd for each session so resumeSession can use the correct project dir
    for (const s of sessions) {
      const cwd = (s as Record<string, unknown>).cwd as string | undefined
      if (cwd) {
        this.sessionCwds.set(s.sessionId, cwd)
      }
    }
    return sessions.map((s) => ({
        sessionId: s.sessionId,
        summary: s.summary || 'Untitled',
        lastModified: s.lastModified,
        status: this.runningSessionIds.has(s.sessionId) ? 'running' as const : 'idle' as const,
        cwd: (s as Record<string, unknown>).cwd as string | undefined,
      }))
  }

  async getHistory(sessionId: string): Promise<unknown[]> {
    const cwd = this.sessionCwds.get(sessionId)
    try {
      const messages = await getSessionMessages(sessionId, { dir: cwd })
      return messages
    } catch (err) {
      this.log.error({ err, sessionId }, 'Failed to load history')
      return []
    }
  }

  async getSubagentMessages(sessionId: string, agentId: string): Promise<unknown[]> {
    const cwd = this.sessionCwds.get(sessionId)
    try {
      return await sdkGetSubagentMessages(sessionId, agentId, { dir: cwd })
    } catch (err) {
      this.log.error({ err, sessionId, agentId }, 'Failed to load subagent messages')
      return []
    }
  }

  getCwd(sessionId?: string): string {
    if (sessionId) {
      const cwd = this.sessionCwds.get(sessionId)
      if (cwd) return cwd
    }
    return process.env.CC_WEB_CONSOLE_CWD ?? process.env.HOME ?? '/'
  }

  async resumeSession(
    sessionId: string,
  ): Promise<void> {
    // Check if any process (ours or external) is already using this session
    if (this.sessions.has(sessionId)) {
      throw new Error('Session is already running in this server')
    }
    if (isSessionLockedExternally(sessionId)) {
      throw new Error('Session is currently in use by another client (e.g. CLI)')
    }
    this.closedSessionIds.delete(sessionId)

    // Use the cached cwd and creation options so claude spawns with the correct config.
    // Fall back to disk if the in-memory cache was lost (e.g. server restart).
    const cwd = this.sessionCwds.get(sessionId)
    const cached = this.sessionCreationOptions.get(sessionId) ?? loadSessionOptions(sessionId)
    if (cached && !this.sessionCreationOptions.has(sessionId)) {
      this.sessionCreationOptions.set(sessionId, cached)
    }
    const resumeSessionIdRef = { current: sessionId }
    const pluginArgs = getPluginDirArgs()
    const userArgs = cached?.executableArgs ?? []
    const sessionOptions = {
      ...(cached?.model ? { model: cached.model } : {}),
      permissionMode: cached?.permissionMode ?? 'default',
      canUseTool: this.buildCanUseTool(resumeSessionIdRef),
      onElicitation: this.buildOnElicitation(resumeSessionIdRef),
      env: { ...cleanEnv(cwd), ...cached?.env },
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      executableArgs: [...pluginArgs, ...userArgs],
    } as unknown as SDKSessionOptions

    const originalCwd = process.cwd()
    if (cwd) { try { process.chdir(cwd) } catch { /* ignore */ } }
    const session = unstable_v2_resumeSession(sessionId, sessionOptions)
    try { process.chdir(originalCwd) } catch { /* ignore */ }
    this.sessions.set(sessionId, session)
    this.runningSessionIds.add(sessionId)

    // Broadcast session_resumed to all listeners so other connections update their UI
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'session_resumed', sessionId,
    } as unknown as SDKMessage))

    // Do NOT start stream consumer yet.
    // Stream will be started by sendMessage() AFTER send() queues the turn,
    // ensuring stream() has an active turn to consume.
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.closedSessionIds.add(sessionId)
      session.close()
      this.sessions.delete(sessionId)
      this.runningSessionIds.delete(sessionId)
      this.streamingSessionIds.delete(sessionId)

      // Clean up idle timer
      const timer = this.idleTimers.get(sessionId)
      if (timer) {
        clearTimeout(timer)
        this.idleTimers.delete(sessionId)
      }

      // Broadcast onEnd but keep listeners — they represent "watching this session"
      // and should persist across stop/resume cycles. They're only removed on WS disconnect.
      this.broadcast(sessionId, (l) => l.onEnd(sessionId))

      // Keep sessionCwds and sessionCommands — they're metadata needed for re-resume.
      // Only clean up runtime state.
      this.pendingRemaps.delete(sessionId)
      // Deny pending permissions only for this session
      for (const [id, entry] of this.pendingPermissions) {
        if (entry.sessionId === sessionId) {
          entry.resolve(false, 'Session closed')
          this.pendingPermissions.delete(id)
        }
      }
      // Cancel pending elicitations for this session
      for (const [id, entry] of this.pendingElicitations) {
        if (entry.sessionId === sessionId) {
          entry.resolve({ action: 'cancel' })
          this.pendingElicitations.delete(id)
        }
      }
    }
  }

  async getSessionSettings(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId)
    if (!session) return { permissionMode: 'default', mcpServers: [], account: {} }

    // Access query the same way as setModel/setEffortLevel
    const query = (session as unknown as { query: {
      mcpServerStatus: () => Promise<unknown[]>
      initializationResult: () => Promise<unknown>
    } }).query

    const [mcpServers, initResult] = await Promise.all([
      query.mcpServerStatus().catch((err) => { this.log.error({ err, sessionId }, 'mcpServerStatus failed'); return [] }),
      query.initializationResult().catch((err) => { this.log.error({ err, sessionId }, 'initializationResult failed'); return {} }),
    ])

    return {
      permissionMode: 'default',
      mcpServers,
      account: initResult, // SDK initializationResult: active account/auth info
    }
  }

  /** Close all active sessions. Called on server shutdown. */
  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.log.info({ sessionId }, 'Shutting down session')
      this.closeSession(sessionId)
    }
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    // Note: no active-session guard here — renameSession operates on saved session
    // files, not running processes. this.sessions only tracks active sessions, so
    // idle sessions would be incorrectly rejected. The SDK handles missing sessions.
    const cwd = this.sessionCwds.get(sessionId)
    await sdkRenameSession(sessionId, title, { dir: cwd })
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'session_renamed', sessionId, title,
    } as unknown as SDKMessage))
  }

  async forkSession(sessionId: string, upToMessageId: string): Promise<{ sessionId: string; title: string }> {
    if (!upToMessageId) {
      throw new Error('upToMessageId is required')
    }
    const cwd = this.sessionCwds.get(sessionId)
    const result = await sdkForkSession(sessionId, { upToMessageId, dir: cwd })
    const newSessionId = result.sessionId

    // Copy metadata from parent session so the fork can be resumed
    if (cwd) this.sessionCwds.set(newSessionId, cwd)
    const options = this.sessionCreationOptions.get(sessionId)
    if (options) {
      this.sessionCreationOptions.set(newSessionId, options)
      saveSessionOptions(newSessionId, options)
    }

    // Read the title that the SDK auto-generated for the forked session
    const info = await getSessionInfo(newSessionId, { dir: cwd })
    const title = info?.summary || 'Forked session'

    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'session_forked', sessionId, newSessionId, title,
    } as unknown as SDKMessage))
    return { sessionId: newSessionId, title }
  }
}
