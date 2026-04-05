import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  listSessions,
  getSessionMessages,
  renameSession as sdkRenameSession,
  forkSession as sdkForkSession,
  type SDKSession,
  type SDKSessionOptions,
  type SDKMessage,
  type PermissionResult,
} from '@anthropic-ai/claude-agent-sdk'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SessionInfo } from './types.js'

type PermissionResolver = {
  resolve: (approved: boolean, reason?: string, updatedPermissions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[]) => void
  sessionId: string
  suggestions?: import('@anthropic-ai/claude-agent-sdk').PermissionUpdate[]
}

export type PermissionMeta = {
  agentId?: string
  title?: string
  description?: string
  hasSuggestions?: boolean
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

const CLAUDE_EXECUTABLE = process.env.CLAUDE_PATH ?? '/home/xuhao/.local/bin/claude'

// Read ~/.claude/settings.json and resolve enabled plugins to local --plugin-dir paths
function getPluginDirArgs(): string[] {
  const home = homedir()
  try {
    const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf-8'))
    const enabled = settings.enabledPlugins as Record<string, boolean> | undefined
    if (!enabled) return []
    const args: string[] = []
    const pluginsBase = join(home, '.claude', 'plugins')
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
  const sessionsDir = join(homedir(), '.claude', 'sessions')
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

export class SessionManager {
  private sessions = new Map<string, SDKSession>()
  private pendingPermissions = new Map<string, PermissionResolver>()
  private runningSessionIds = new Set<string>()
  private closedSessionIds = new Set<string>()
  private streamingSessionIds = new Set<string>()
  private sessionListeners = new Map<string, Set<SessionListener>>()
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingRemaps = new Map<string, { sessionIdRef: { current: string } }>()
  // Track cwd for each session so we can resume in the correct project
  private sessionCwds = new Map<string, string>()
  // Cache commands extracted from SDK init messages
  private sessionCommands = new Map<string, { name: string; description: string }[]>()
  // Active stream (Query) references for control requests like setModel
  private activeQueries = new Map<string, AsyncGenerator<SDKMessage, void>>()

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
        this.scheduleIdleClose(sessionId)
      }
    }
  }

  private broadcast(sessionId: string, fn: (listener: SessionListener) => void): void {
    const listeners = this.sessionListeners.get(sessionId)
    if (!listeners) return
    for (const l of listeners) {
      try { fn(l) } catch (err) {
        console.error('[SessionManager] Listener error:', err)
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

  private buildCanUseTool(
    sessionIdRef: { current: string },
  ): SDKSessionOptions['canUseTool'] {
    return async (toolName, input, { toolUseID, agentID, suggestions, title, description }) => {
      // Auto-allow non-dangerous tools that don't need user approval
      const autoAllow = new Set(['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])
      if (autoAllow.has(toolName)) {
        return { behavior: 'allow' as const, updatedInput: input as Record<string, unknown> }
      }

      // AskUserQuestion: keep canUseTool pending (SDK waits for answer)
      // but don't send permission_request (no PermissionCard).
      // The user's answer comes via resolvePermission() from the frontend.
      const isQuestion = toolName === 'AskUserQuestion'

      return new Promise<PermissionResult>((resolve) => {
        this.pendingPermissions.set(toolUseID, {
          resolve: (approved: boolean, reason?: string, updatedPermissions?) => {
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
          sessionId: sessionIdRef.current,
          suggestions,
        })
        // Only send permission_request for real permission prompts, not questions
        if (!isQuestion) {
          this.broadcast(sessionIdRef.current, (l) =>
            l.onPermissionRequest(sessionIdRef.current, toolUseID, toolName, input as Record<string, unknown>, {
              agentId: agentID,
              title,
              description,
              hasSuggestions: (suggestions?.length ?? 0) > 0,
            }),
          )
        }
      })
    }
  }

  async createSession(
    options?: { model?: string; cwd?: string },
  ): Promise<string> {
    const cwd = options?.cwd ?? process.env.CC_WEB_CONSOLE_CWD ?? process.env.HOME ?? '/'
    const sessionIdRef = { current: '' }
    const sessionOptions = {
      ...(options?.model ? { model: options.model } : {}),
      permissionMode: 'default',
      canUseTool: this.buildCanUseTool(sessionIdRef),
      env: cleanEnv(cwd),
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      executableArgs: getPluginDirArgs(),
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
        this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
          type: 'models_updated', models, currentModel,
        } as unknown as SDKMessage))
      }
    }).catch((err) => {
      console.error('[SessionManager] Failed to fetch models:', err)
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
        const query = session.stream()
        // Store query reference so control requests (setModel etc.) can use it
        try {
          const sid = session.sessionId
          this.activeQueries.set(sid, query)
        } catch { /* sessionId not yet available, will set after remap */ }

        for await (const msg of query) {
          const msgAny = msg as Record<string, unknown>

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
                  this.sessionCommands.set(sid, cmds)
                  // Notify via broadcast so ws-handler can push updated list
                  this.broadcast(sid, (l) => l.onMessage(sid, { type: 'commands_updated' } as unknown as SDKMessage))
                }
              }).catch(() => {})
            } catch { /* session not yet initialized */ }
          }
          if (msgAny.type === 'result') {
            if (msgAny.is_error) {
              console.error('[SessionManager] SDK error result:', JSON.stringify(msg).slice(0, 500))
            } else {
              console.log('[SessionManager] Turn complete, cost:', (msgAny as Record<string, unknown>).total_cost_usd)
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
        console.error('[SessionManager] Stream error:', err)
      }
    } finally {
      try {
        const sessionId = session.sessionId
        this.runningSessionIds.delete(sessionId)
        this.streamingSessionIds.delete(sessionId)
        this.activeQueries.delete(sessionId)
        this.broadcast(sessionId, (l) => l.onEnd(sessionId))
      } catch {
        // Session never initialized — try with our tracked id
        this.runningSessionIds.delete(currentSessionId)
        this.streamingSessionIds.delete(currentSessionId)
        this.activeQueries.delete(currentSessionId)
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
  }

  async sendMessage(sessionId: string, content: string): Promise<void> {
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

  resolvePermission(toolUseId: string, approved: boolean, reason?: string, alwaysAllow?: boolean): void {
    const pending = this.pendingPermissions.get(toolUseId)
    if (pending) {
      const updatedPermissions = (approved && alwaysAllow) ? pending.suggestions : undefined
      pending.resolve(approved, reason, updatedPermissions)
      this.pendingPermissions.delete(toolUseId)

      // Broadcast permission decision to all listeners
      this.broadcast(pending.sessionId, (l) => l.onMessage(pending.sessionId, {
        type: 'permission_decided', toolUseId, approved,
      } as unknown as SDKMessage))
    }
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
      }))
  }

  async getHistory(sessionId: string): Promise<unknown[]> {
    const cwd = this.sessionCwds.get(sessionId)
    try {
      const messages = await getSessionMessages(sessionId, { dir: cwd })
      return messages
    } catch (err) {
      console.error('[SessionManager] Failed to load history for', sessionId, err)
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

    // Use the cached cwd from listSessions so claude spawns in the correct project
    const cwd = this.sessionCwds.get(sessionId)
    const sessionOptions = {
      permissionMode: 'default',
      canUseTool: this.buildCanUseTool({ current: sessionId }),
      env: cleanEnv(cwd),
      pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
      executableArgs: getPluginDirArgs(),
    } as SDKSessionOptions

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
    }
  }

  /** Close all active sessions. Called on server shutdown. */
  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      console.log('[SessionManager] Shutting down session', sessionId)
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

  async forkSession(sessionId: string, upToMessageId: string): Promise<string> {
    if (!upToMessageId) {
      throw new Error('upToMessageId is required')
    }
    const cwd = this.sessionCwds.get(sessionId)
    const result = await sdkForkSession(sessionId, { upToMessageId, dir: cwd })
    const newSessionId = result.sessionId
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'session_forked', sessionId, newSessionId,
    } as unknown as SDKMessage))
    return newSessionId
  }
}
